import { ethers } from "ethers";
import { initializeComputeAccount } from "@/lib/0g/compute";
import {
  deductCreditsFromServer,
  getCreditsBalance,
  getCreditsContractAddress,
  SCAN_CREDIT_COST_WEI,
} from "@/lib/0g/credits";
import {
  buildLongContextMemoryPrompt,
  enclavMemoryObjectKey,
  hashRepoUrl,
  parseRepoMemoryJson,
  type EnclavRepoMemoryV1,
} from "@/lib/0g/memory";
import { deduplicateFindingsByFileLineIssue, runSecurityScan } from "@/lib/openclaw/agent";
import { downloadTextByRootHash, uploadFile } from "@/lib/0g/storage";

type ScanRequestBody = {
  repoUrl?: string;
  walletAddress?: string;
  /** 0G Storage root hash of prior `enclav-memory-*` blob for this repo (long-context memory). */
  previousMemoryRootHash?: string;
};
type StreamFinding = {
  severity: "Critical" | "High" | "Medium" | "Low";
  file: string;
  line: number;
  issue: string;
  fix: string;
};

type GithubBlobFile = {
  path: string;
  url: string;
};

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
/** Exact paths (lowercase) with no security relevance for typical audits. */
const EXCLUDED_SCAN_EXACT_PATHS = new Set(
  [
    "app/layout.tsx",
    "app/globals.css",
    "postcss.config.mjs",
    "next.config.mjs",
    "tsconfig.json",
    "next-env.d.ts",
    "lib/0g/compute.ts",
    "lib/0g/storage.ts",
    "lib/0g/inft.ts",
    "lib/0g/credits.ts",
    "lib/0g/memory.ts",
    "lib/openclaw/agent.ts",
    "lib/openclaw/skills/0g-deploy.ts",
    "lib/wagmi.ts",
    "lib/wallet.ts",
  ].map((p) => p.toLowerCase()),
);
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
  const githubToken = process.env.GITHUB_TOKEN?.trim();
  const githubHeaders: HeadersInit = {
    Accept: "application/vnd.github.v3+json",
    ...(githubToken ? { Authorization: `token ${githubToken}` } : {}),
  };

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

  const creditsContract = getCreditsContractAddress();
  if (!creditsContract) {
    return new Response(
      JSON.stringify({
        error:
          "Credits contract is not configured. Set CREDITS_CONTRACT_ADDRESS or NEXT_PUBLIC_CREDITS_CONTRACT_ADDRESS.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!ethers.isAddress(walletAddress)) {
    return new Response(JSON.stringify({ error: "Invalid walletAddress." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let normalizedWallet: string;
  try {
    normalizedWallet = ethers.getAddress(walletAddress);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid walletAddress." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const creditBalance = await getCreditsBalance(normalizedWallet);
    if (creditBalance < SCAN_CREDIT_COST_WEI) {
      return new Response(
        JSON.stringify({
          error: "Insufficient scan credits — add credits to continue",
        }),
        { status: 402, headers: { "Content-Type": "application/json" } },
      );
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to read scan credit balance.";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
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
    { headers: githubHeaders },
  );

  if (treeRes.status === 404) {
    return new Response(
      JSON.stringify({
        error:
          "Unable to access repository. If it's private, it's not supported. If public, GitHub API rate limit may be exceeded - try again in a few minutes.",
      }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  if (treeRes.status === 403) {
    return new Response(
      JSON.stringify({
        error:
          "Unable to access repository. If it's private, it's not supported. If public, GitHub API rate limit may be exceeded - try again in a few minutes.",
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

  const files = (treeJson.tree ?? []).filter((node) => {
    if (node.type !== "blob" || !node.path || !node.url) return false;
    const filePath = node.path.toLowerCase();

    const isEnvFile =
      filePath === ".env" ||
      filePath.endsWith("/.env") ||
      filePath.startsWith(".env.") ||
      filePath.includes("/.env.");
    if (isEnvFile) return false;

    if (filePath === "hardhat.config.ts") return false;

    if (EXCLUDED_SCAN_EXACT_PATHS.has(filePath)) return false;

    const isExcluded = EXCLUDED_SCAN_PREFIXES.some((prefix) => filePath.startsWith(prefix));
    if (isExcluded) return false;

    return CODE_EXTENSIONS.some((ext) => filePath.endsWith(ext));
  }) as GithubBlobFile[];

  const stream = new ReadableStream<Uint8Array>({
    start: async (controller) => {
      let totalFindings = 0;
      let processedFiles = 0;
      let failedFiles = 0;
      let rootHash: string | null = null;
      let memoryRootHash: string | null = null;
      const aggregatedFindings: Array<
        StreamFinding & { attestationHash: string }
      > = [];

      try {
        const provider = new ethers.JsonRpcProvider("https://evmrpc-testnet.0g.ai");
        const signer = new ethers.Wallet(deployerPrivateKey, provider);
        const broker = await initializeComputeAccount(signer);
        const runStorageUploadSequentially = createSequentialTaskRunner();

        let memoryContext: string | undefined;
        const prevHash = body.previousMemoryRootHash?.trim();
        if (prevHash) {
          const rawMem = await downloadTextByRootHash(prevHash);
          if (rawMem) {
            const parsedMem = parseRepoMemoryJson(rawMem);
            if (parsedMem) {
              memoryContext = buildLongContextMemoryPrompt(parsedMem.aggregatedFindings);
              const previousFindingCount = parsedMem.aggregatedFindings.length;
              streamChunk(controller, {
                type: "memory",
                previousFindingCount,
                message: `Previous scan found ${previousFindingCount} issues. Checking for fixes and new vulnerabilities...`,
              });
            }
          }
        }

        const scanSingleFile = async (file: GithubBlobFile) => {
          if (!file.path || !file.url) return;
          const filePath = file.path;
          const fileUrl = file.url;

          streamChunk(controller, { type: "file", filename: filePath });

          const blobRes = await fetch(fileUrl, {
            headers: githubHeaders,
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
              runSecurityScan(
                repoUrl,
                [{ path: filePath, content: decodedContent }],
                { broker, memoryContext },
              ).then((items) => items[0]),
              COMPUTE_SCAN_TIMEOUT_MS,
              `Compute scan for ${filePath}`,
            );
            if (!result) {
              throw new Error("OpenClaw scan returned no result.");
            }

            const uniqueForFile = deduplicateFindingsByFileLineIssue(result.findings);
            for (const finding of uniqueForFile) {
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

        const SCAN_BATCH_SIZE = 2;
        const SCAN_BATCH_DELAY_MS = 6000;
        for (let i = 0; i < files.length; i += SCAN_BATCH_SIZE) {
          if (i > 0) {
            await sleep(SCAN_BATCH_DELAY_MS);
          }
          const batch = files.slice(i, i + SCAN_BATCH_SIZE);
          await Promise.all(batch.map((f) => scanSingleFile(f)));
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unexpected scan pipeline error.";
        streamChunk(controller, { type: "error", message });
      } finally {
        const completedAt = new Date().toISOString();
        try {
          const provider = new ethers.JsonRpcProvider("https://evmrpc-testnet.0g.ai");
          if (deployerPrivateKey) {
            const signer = new ethers.Wallet(deployerPrivateKey, provider);
            const summaryReport = {
              repoUrl,
              scanDate: completedAt,
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

            const memoryKey = enclavMemoryObjectKey(repoUrl);
            const slimFindings = aggregatedFindings.map((f) => ({
              severity: f.severity,
              file: f.file,
              line: f.line,
              issue: f.issue,
              fix: f.fix,
            }));
            const memoryDoc: EnclavRepoMemoryV1 = {
              version: 1,
              key: memoryKey,
              repoUrl,
              repoUrlHash: hashRepoUrl(repoUrl),
              scanDate: completedAt,
              totalFindings: aggregatedFindings.length,
              aggregatedFindings: slimFindings,
            };
            memoryRootHash = await withTimeout(
              uploadFile(
                JSON.stringify(memoryDoc, null, 2),
                `${memoryKey}.json`,
                signer,
              ),
              SUMMARY_UPLOAD_TIMEOUT_MS,
              "Long-context memory upload",
            );
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Failed to store summary report.";
          streamChunk(controller, { type: "error", message });
        }

        if (files.length > 0 && deployerPrivateKey) {
          try {
            await deductCreditsFromServer(
              normalizedWallet,
              SCAN_CREDIT_COST_WEI,
              deployerPrivateKey,
            );
          } catch (billingError) {
            const billingMessage =
              billingError instanceof Error ? billingError.message : "Credit deduction failed.";
            streamChunk(controller, {
              type: "error",
              message: `Billing: ${billingMessage}`,
            });
          }
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
            scanDate: completedAt,
            filesScanned: processedFiles,
            totalFindings,
            criticalCount: severityCounts.Critical,
            highCount: severityCounts.High,
            mediumCount: severityCounts.Medium,
            lowCount: severityCounts.Low,
            reportHash: rootHash ?? "",
            ...(memoryRootHash ? { memoryRootHash } : {}),
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
