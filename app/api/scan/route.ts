import { ethers } from "ethers";
import {
  initializeComputeAccount,
  scanFileForVulnerabilities,
} from "@/lib/0g/compute";
import { uploadFile } from "@/lib/0g/storage";

type ScanRequestBody = {
  repoUrl?: string;
  walletAddress?: string;
};
type StreamFinding = {
  severity: "Critical" | "High" | "Medium" | "Low";
  file: string;
  line: number;
  issue: string;
  fix: string;
};

const CODE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".py", ".sol"];
const ALLOWED_SCAN_PREFIXES = ["app/", "components/", "lib/", "pages/"];
const EXCLUDED_SCAN_PREFIXES = [
  "contracts/",
  "contracts/scripts/",
  "node_modules/",
  "design-templates/",
];
const GITHUB_REPO_URL_PATTERN =
  /^https:\/\/github\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+(\.git)?\/?$/;
const encoder = new TextEncoder();
const STORAGE_UPLOAD_TIMEOUT_MS = 30_000;
const COMPUTE_SCAN_TIMEOUT_MS = 45_000;
const SUMMARY_UPLOAD_TIMEOUT_MS = 30_000;
const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string) {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.floor(timeoutMs / 1000)}s`));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error: unknown) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

function createSequentialTaskRunner() {
  let lastTask = Promise.resolve();
  return async <T>(task: () => Promise<T>): Promise<T> => {
    const run = lastTask.then(task, task);
    lastTask = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}

function parseRepoUrl(repoUrl: string) {
  try {
    const url = new URL(repoUrl);
    if (url.hostname !== "github.com") return null;
    const [owner, repo] = url.pathname.replace(/^\/+/, "").split("/");
    if (!owner || !repo) return null;
    return { owner, repo: repo.replace(/\.git$/, "") };
  } catch {
    return null;
  }
}

function streamChunk(controller: ReadableStreamDefaultController<Uint8Array>, chunk: unknown) {
  controller.enqueue(encoder.encode(`${JSON.stringify(chunk)}\n`));
}

export async function POST(request: Request) {
  const body = (await request.json()) as ScanRequestBody;
  const repoUrl = body.repoUrl?.trim();
  const walletAddress = body.walletAddress?.trim();
  const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY?.trim();

  if (!repoUrl || !walletAddress) {
    return new Response(
      JSON.stringify({ error: "repoUrl and walletAddress are required." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!GITHUB_REPO_URL_PATTERN.test(repoUrl)) {
    return new Response(
      JSON.stringify({ error: "Please enter a valid public GitHub repository URL" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!deployerPrivateKey) {
    return new Response(
      JSON.stringify({
        error:
          "DEPLOYER_PRIVATE_KEY is required and must be a valid 0x-prefixed private key.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!deployerPrivateKey.startsWith("0x") || deployerPrivateKey.length < 60) {
    return new Response(
      JSON.stringify({
        error:
          "Invalid DEPLOYER_PRIVATE_KEY format. Expected a 0x-prefixed key with at least 60 characters.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const parsedRepo = parseRepoUrl(repoUrl);
  if (!parsedRepo) {
    return new Response(JSON.stringify({ error: "Invalid GitHub repository URL." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { owner, repo } = parsedRepo;
  const treeRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`,
    { headers: { Accept: "application/vnd.github+json" } },
  );

  if (treeRes.status === 404) {
    return new Response(
      JSON.stringify({ error: "GitHub repository not found." }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  if (treeRes.status === 403) {
    return new Response(
      JSON.stringify({ error: "Repository is private or GitHub API access is limited." }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!treeRes.ok) {
    const detail = await treeRes.text();
    return new Response(
      JSON.stringify({ error: `Failed to fetch repository tree: ${detail}` }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const treeJson = (await treeRes.json()) as {
    tree?: Array<{ path?: string; type?: string; url?: string }>;
  };

  const files = (treeJson.tree ?? []).filter((node) => {
    if (node.type !== "blob" || !node.path) return false;
    const filePath = node.path.toLowerCase();

    const isEnvFile =
      filePath === ".env" ||
      filePath.endsWith("/.env") ||
      filePath.startsWith(".env.") ||
      filePath.includes("/.env.");
    if (isEnvFile) return false;

    if (filePath === "hardhat.config.ts") return false;

    const isExcluded = EXCLUDED_SCAN_PREFIXES.some((prefix) =>
      filePath.startsWith(prefix),
    );
    if (isExcluded) return false;

    const isAllowedFolder = ALLOWED_SCAN_PREFIXES.some((prefix) =>
      filePath.startsWith(prefix),
    );
    if (!isAllowedFolder) return false;

    return CODE_EXTENSIONS.some((ext) => filePath.endsWith(ext));
  });

  const stream = new ReadableStream<Uint8Array>({
    start: async (controller) => {
      let totalFindings = 0;
      let processedFiles = 0;
      let failedFiles = 0;
      let rootHash: string | null = null;
      const aggregatedFindings: Array<
        StreamFinding & { attestationHash: string }
      > = [];

      try {
        const provider = new ethers.JsonRpcProvider("https://evmrpc-testnet.0g.ai");
        const signer = new ethers.Wallet(deployerPrivateKey, provider);
        const broker = await initializeComputeAccount(signer);
        const runStorageUploadSequentially = createSequentialTaskRunner();

        const scanSingleFile = async (
          file: { path?: string; url?: string },
          batchIndex: number,
        ) => {
          if (!file.path || !file.url) return;
          const filePath = file.path;
          const fileUrl = file.url;
          await sleep(batchIndex * 2000);

          streamChunk(controller, { type: "file", filename: filePath });

          const blobRes = await fetch(fileUrl, {
            headers: { Accept: "application/vnd.github+json" },
          });
          if (!blobRes.ok) return;

          const blobJson = (await blobRes.json()) as {
            content?: string;
            encoding?: string;
          };
          if (!blobJson.content) return;

          const decodedContent =
            blobJson.encoding === "base64"
              ? Buffer.from(blobJson.content.replace(/\n/g, ""), "base64").toString("utf8")
              : blobJson.content;

          try {
            await runStorageUploadSequentially(() =>
              withTimeout(
                uploadFile(decodedContent, filePath, signer),
                STORAGE_UPLOAD_TIMEOUT_MS,
                `Storage upload for ${filePath}`,
              ),
            );
            const result = await withTimeout(
              scanFileForVulnerabilities(broker, filePath, decodedContent),
              COMPUTE_SCAN_TIMEOUT_MS,
              `Compute scan for ${filePath}`,
            );

            for (const finding of result.findings) {
              totalFindings += 1;
              aggregatedFindings.push({
                ...finding,
                attestationHash: result.attestationHash,
              });
              streamChunk(controller, {
                type: "finding",
                finding,
                attestationHash: result.attestationHash,
              });
            }
          } catch (error) {
            failedFiles += 1;
            const message =
              error instanceof Error
                ? error.message
                : `Failed scanning ${filePath}.`;
            streamChunk(controller, {
              type: "error",
              message: `${filePath}: ${message}`,
            });
          } finally {
            processedFiles += 1;
          }
        };

        for (let index = 0; index < files.length; index += 3) {
          const batch = files.slice(index, index + 3);
          await Promise.all(
            batch.map((file, batchIndex) => scanSingleFile(file, batchIndex)),
          );
          if (index + 3 < files.length) {
            await sleep(8000);
          }
        }

      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unexpected scan pipeline error.";
        streamChunk(controller, { type: "error", message });
      } finally {
        try {
          const provider = new ethers.JsonRpcProvider("https://evmrpc-testnet.0g.ai");
          if (deployerPrivateKey) {
            const signer = new ethers.Wallet(deployerPrivateKey, provider);
            const summaryReport = {
              repoUrl,
              scanDate: new Date().toISOString(),
              totalFiles: files.length,
              processedFiles,
              failedFiles,
              findings: aggregatedFindings,
              totalFindings,
            };
            rootHash = await withTimeout(
              uploadFile(
                JSON.stringify(summaryReport, null, 2),
                `scan-report-${owner}-${repo}-${Date.now()}.json`,
                signer,
              ),
              SUMMARY_UPLOAD_TIMEOUT_MS,
              "Summary report upload",
            );
          }
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Failed to store summary report.";
          streamChunk(controller, { type: "error", message });
        }

        const severityCounts = aggregatedFindings.reduce(
          (acc, item) => {
            acc[item.severity] += 1;
            return acc;
          },
          {
            Critical: 0,
            High: 0,
            Medium: 0,
            Low: 0,
          } as Record<StreamFinding["severity"], number>,
        );

        streamChunk(controller, {
          type: "complete",
          totalFiles: files.length,
          processedFiles,
          failedFiles,
          totalFindings,
          scanData: {
            repoUrl,
            scanDate: new Date().toISOString(),
            filesScanned: processedFiles,
            totalFindings,
            criticalCount: severityCounts.Critical,
            highCount: severityCounts.High,
            mediumCount: severityCounts.Medium,
            lowCount: severityCounts.Low,
            reportHash: rootHash ?? "",
          },
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Total-Files": String(files.length),
    },
  });
}
