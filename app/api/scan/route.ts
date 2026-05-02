import { ethers } from "ethers";
import { initializeComputeAccount } from "@/lib/0g/compute";
import { runSecurityScan } from "@/lib/openclaw/agent";
import { uploadFile } from "@/lib/0g/storage";

type ScanRequestBody = {
  repoUrl?: string;
  walletAddress?: string;
  devQuickScan?: boolean;
};
type StreamFinding = {
  severity: "Critical" | "High" | "Medium" | "Low";
  file: string;
  line: number;
  issue: string;
  fix: string;
};

type ScanFileJob = {
  path: string;
  url?: string;
  content?: string;
};

/** Label stored in scanData.repoUrl for dev quick scans (no GitHub fetch). */
const DEV_QUICK_SCAN_REPO_LABEL = "https://github.com/enclav/dev-test-mode";
const DEV_QUICK_SCAN_FILES: Array<{ path: string; content: string }> = [
  {
    path: "dev/mock-a.ts",
    content:
      'import http from "http";\nconst s = http.createServer((_req, res) => {\n  const cmd = "placeholder";\n  res.end(cmd);\n});\n',
  },
  {
    path: "dev/mock-b.ts",
    content:
      'const demoSecret = "sk-placeholder-demo-not-real";\nexport function expose() { return demoSecret; }\n',
  },
  {
    path: "dev/mock-c.ts",
    content: "export function unsafeEval(userInput: string) {\n  return eval(userInput);\n}\n",
  },
];

const CODE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".py", ".sol", ".go"];
const EXCLUDED_SCAN_PREFIXES = [
  "contracts/scripts/",
  ".git/",
  "node_modules/",
  "dist/",
  "build/",
  ".next/",
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

function devQuickScanAllowed(): boolean {
  return (
    process.env.NODE_ENV === "development" || process.env.ENABLE_DEV_QUICK_SCAN === "true"
  );
}

export async function POST(request: Request) {
  const body = (await request.json()) as ScanRequestBody;
  const devQuickScan = body.devQuickScan === true;
  const repoUrlInput = body.repoUrl?.trim() ?? "";
  const walletAddress = body.walletAddress?.trim();
  const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY?.trim();
  const githubToken = process.env.GITHUB_TOKEN?.trim();
  const githubHeaders: HeadersInit = {
    Accept: "application/vnd.github.v3+json",
    ...(githubToken ? { Authorization: `token ${githubToken}` } : {}),
  };

  if (!walletAddress) {
    return new Response(JSON.stringify({ error: "walletAddress is required." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
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

  let resolvedRepoUrl: string;
  let summaryOwner: string;
  let summaryRepo: string;
  let files: ScanFileJob[];

  if (devQuickScan) {
    if (!devQuickScanAllowed()) {
      return new Response(
        JSON.stringify({
          error:
            "Dev quick scan is disabled. Run in development or set ENABLE_DEV_QUICK_SCAN=true on the server.",
        }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }
    resolvedRepoUrl = DEV_QUICK_SCAN_REPO_LABEL;
    summaryOwner = "enclav";
    summaryRepo = "dev-test-mode";
    files = DEV_QUICK_SCAN_FILES.map((f) => ({ path: f.path, content: f.content }));
  } else {
    if (!repoUrlInput) {
      return new Response(
        JSON.stringify({ error: "repoUrl and walletAddress are required." }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    if (!GITHUB_REPO_URL_PATTERN.test(repoUrlInput)) {
      return new Response(
        JSON.stringify({ error: "Please enter a valid public GitHub repository URL" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const parsedRepo = parseRepoUrl(repoUrlInput);
    if (!parsedRepo) {
      return new Response(JSON.stringify({ error: "Invalid GitHub repository URL." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { owner, repo } = parsedRepo;
    summaryOwner = owner;
    summaryRepo = repo;
    resolvedRepoUrl = repoUrlInput;

    const treeRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`,
      { headers: githubHeaders },
    );

    if (treeRes.status === 404) {
      return new Response(
        JSON.stringify({
          error:
            "Unable to access repository. If it's private, it's not supported. If public, GitHub API rate limit may be exceeded — try again in a few minutes.",
        }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    if (treeRes.status === 403) {
      return new Response(
        JSON.stringify({
          error:
            "Unable to access repository. If it's private, it's not supported. If public, GitHub API rate limit may be exceeded — try again in a few minutes.",
        }),
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

    files = (treeJson.tree ?? []).filter((node) => {
      if (node.type !== "blob" || !node.path) return false;
      const filePath = node.path.toLowerCase();

      const isEnvFile =
        filePath === ".env" ||
        filePath.endsWith("/.env") ||
        filePath.startsWith(".env.") ||
        filePath.includes("/.env.");
      if (isEnvFile) return false;

      if (filePath === "hardhat.config.ts") return false;

      const isExcluded = EXCLUDED_SCAN_PREFIXES.some((prefix) => filePath.startsWith(prefix));
      if (isExcluded) return false;

      return CODE_EXTENSIONS.some((ext) => filePath.endsWith(ext));
    }) as ScanFileJob[];
  }

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

        const scanSingleFile = async (file: ScanFileJob, batchIndex: number) => {
          if (!file.path || (file.content === undefined && !file.url)) {
            processedFiles += 1;
            return;
          }
          const filePath = file.path;
          await sleep(batchIndex * 2000);

          streamChunk(controller, { type: "file", filename: filePath });

          let decodedContent: string;
          if (file.content !== undefined) {
            decodedContent = file.content;
          } else if (file.url) {
            const blobRes = await fetch(file.url, {
              headers: githubHeaders,
            });
            if (!blobRes.ok) {
              processedFiles += 1;
              return;
            }

            const blobJson = (await blobRes.json()) as {
              content?: string;
              encoding?: string;
            };
            if (!blobJson.content) {
              processedFiles += 1;
              return;
            }

            decodedContent =
              blobJson.encoding === "base64"
                ? Buffer.from(blobJson.content.replace(/\n/g, ""), "base64").toString("utf8")
                : blobJson.content;
          } else {
            processedFiles += 1;
            return;
          }

          try {
            await runStorageUploadSequentially(() =>
              withTimeout(
                uploadFile(decodedContent, filePath, signer),
                STORAGE_UPLOAD_TIMEOUT_MS,
                `Storage upload for ${filePath}`,
              ),
            );
            const result = await withTimeout(
              runSecurityScan(
                resolvedRepoUrl,
                [{ path: filePath, content: decodedContent }],
                { broker },
              ).then((items) => items[0]),
              COMPUTE_SCAN_TIMEOUT_MS,
              `Compute scan for ${filePath}`,
            );
            if (!result) {
              throw new Error("OpenClaw scan returned no result.");
            }

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
              error instanceof Error ? error.message : `Failed scanning ${filePath}.`;
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
              repoUrl: resolvedRepoUrl,
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
                `scan-report-${summaryOwner}-${summaryRepo}-${Date.now()}.json`,
                signer,
              ),
              SUMMARY_UPLOAD_TIMEOUT_MS,
              "Summary report upload",
            );
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Failed to store summary report.";
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
            repoUrl: resolvedRepoUrl,
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
