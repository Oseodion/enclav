import { ethers } from "ethers";
import {
  createBroker,
  initializeComputeAccount,
  listComputeProviders,
} from "@/lib/0g/compute";
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
import {
  deduplicateFindingsByFileLineIssue,
  runSecurityScan,
  type OpenClawFileInput,
} from "@/lib/openclaw/agent";
import { downloadTextByRootHash, uploadFile } from "@/lib/0g/storage";
import { resolveOgRpcUrl } from "@/lib/og-env";

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

/** File extensions eligible for security scanning (any public repo layout). */
const SCANNABLE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".sol",
  ".go",
  ".rs",
  ".java",
  ".rb",
  ".php",
  ".cpp",
  ".cc",
  ".c",
  ".h",
  ".cs",
  ".swift",
  ".kt",
  ".vue",
  ".svelte",
];
/** Path segment (any depth) — applies to any repository layout. */
const EXCLUDED_REPO_PATH_SEGMENTS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "design-templates",
]);

/** Enclav-specific paths (only exist when scanning this repo); safe no-ops elsewhere. */
const EXCLUDED_INFRASTRUCTURE_PATH_PREFIXES = ["contracts/scripts/"] as const;
const EXCLUDED_INFRASTRUCTURE_PATH_EXACT = new Set([
  "hardhat.config.ts",
  "contracts/enclav.sol",
  "contracts/enclavcredits.sol",
  "lib/0g/compute.ts",
  "lib/0g/storage.ts",
  "lib/0g/inft.ts",
  "lib/0g/credits.ts",
  "lib/0g/memory.ts",
  "lib/og-env.ts",
  "lib/og-network-label.ts",
  "lib/wagmi.ts",
  "lib/wallet.ts",
  "lib/openclaw/agent.ts",
  "lib/openclaw/skills/0g-deploy.ts",
  "components/ui/walletconnect.tsx",
  "components/providers.tsx",
]);

function isExcludedInfrastructurePath(filePathLower: string): boolean {
  if (EXCLUDED_INFRASTRUCTURE_PATH_EXACT.has(filePathLower)) return true;
  return EXCLUDED_INFRASTRUCTURE_PATH_PREFIXES.some((prefix) =>
    filePathLower.startsWith(prefix),
  );
}

/** Tier 1 (critical): filename stem matches these keywords (word-aware). Scanned in full. */
const TIER1_FILENAME_KEYWORDS = [
  "auth",
  "login",
  "password",
  "token",
  "secret",
  "key",
  "wallet",
  "payment",
  "contract",
  "admin",
  "api",
] as const;

/** Tier 2 (high): paths under these folders; scan up to this many (tier 1 excluded). */
const MAX_HIGH_TIER_SCAN_FILES = 15;

const HIGH_RISK_PATH_MARKERS = [
  "src/",
  "app/",
  "pages/",
  "routes/",
  "controllers/",
  "api/",
] as const;

function escapeRegexChar(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Returns tier-1 keyword stems matched in the file basename (no extension). */
function tier1KeywordsMatchedInBasename(relativePath: string): string[] {
  const fileName = relativePath.split("/").pop() ?? relativePath;
  const stem = fileName.replace(/\.[^.]+$/, "");
  const matched: string[] = [];
  for (const kw of TIER1_FILENAME_KEYWORDS) {
    const re = new RegExp(`(^|[^a-z0-9])${escapeRegexChar(kw)}([^a-z0-9]|$)`, "i");
    if (re.test(stem)) matched.push(kw);
  }
  return matched;
}

function isTier1CriticalPath(relativePath: string): boolean {
  return tier1KeywordsMatchedInBasename(relativePath).length > 0;
}

function isHighRiskFolderPath(relativePath: string): boolean {
  const lower = relativePath.toLowerCase();
  for (const m of HIGH_RISK_PATH_MARKERS) {
    if (lower.startsWith(m) || lower.includes(`/${m}`)) return true;
  }
  return false;
}

function formatTier1KeywordLabel(kw: string): string {
  if (kw === "contract") return "contracts";
  return kw;
}

function describeHighTierLocation(paths: string[]): string {
  if (paths.length === 0) return "in application folders";
  const lowerPaths = paths.map((p) => p.toLowerCase());
  const apiLike = lowerPaths.filter(
    (p) => p.includes("/api/") || p.startsWith("api/"),
  );
  if (apiLike.length >= Math.ceil(paths.length * 0.5)) return "in API routes";
  return "in application folders (src, app, pages, routes)";
}

/** Prefer api/routes/controllers paths when tier 2 must be capped. */
function highTierPathPriorityScore(relativePath: string): number {
  const lower = relativePath.toLowerCase();
  let s = 0;
  if (lower.includes("/api/") || lower.startsWith("api/")) s += 5;
  if (lower.includes("/routes/") || lower.startsWith("routes/")) s += 4;
  if (lower.includes("/controllers/") || lower.startsWith("controllers/")) s += 4;
  if (lower.includes("/app/") || lower.startsWith("app/")) s += 3;
  if (lower.includes("/pages/") || lower.startsWith("pages/")) s += 3;
  if (lower.startsWith("src/")) s += 2;
  return s;
}

function selectHighTierFilesToScan(pool: GithubBlobFile[]): GithubBlobFile[] {
  if (pool.length <= MAX_HIGH_TIER_SCAN_FILES) {
    return [...pool].sort((a, b) => a.path.localeCompare(b.path));
  }
  return [...pool]
    .map((f) => ({ f, score: highTierPathPriorityScore(f.path) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.f.path.localeCompare(b.f.path);
    })
    .slice(0, MAX_HIGH_TIER_SCAN_FILES)
    .map((row) => row.f)
    .sort((a, b) => a.path.localeCompare(b.path));
}

type RepoTierPartition = {
  tier1Critical: GithubBlobFile[];
  tier2HighPool: GithubBlobFile[];
  tier2Capped: boolean;
  tier3Skipped: GithubBlobFile[];
  scanQueue: GithubBlobFile[];
};

function partitionRepoFilesForScan(files: GithubBlobFile[]): RepoTierPartition {
  const tier1Critical: GithubBlobFile[] = [];
  const tier2HighPool: GithubBlobFile[] = [];
  const tier3Skipped: GithubBlobFile[] = [];

  for (const f of files) {
    if (isTier1CriticalPath(f.path)) {
      tier1Critical.push(f);
    } else if (isHighRiskFolderPath(f.path)) {
      tier2HighPool.push(f);
    } else {
      tier3Skipped.push(f);
    }
  }

  tier1Critical.sort((a, b) => a.path.localeCompare(b.path));
  const tier2Capped = tier2HighPool.length > MAX_HIGH_TIER_SCAN_FILES;
  const tier2Selected = selectHighTierFilesToScan(tier2HighPool);
  const scanQueue = [...tier1Critical, ...tier2Selected];

  return {
    tier1Critical,
    tier2HighPool,
    tier2Capped,
    tier3Skipped,
    scanQueue,
  };
}
const GITHUB_REPO_URL_PATTERN =
  /^https:\/\/github\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+(\.git)?\/?$/;
const encoder = new TextEncoder();
const CHAIN_ID = Number(process.env.OG_CHAIN_ID ?? process.env.NEXT_PUBLIC_OG_CHAIN_ID ?? 16661);
const IS_MAINNET = CHAIN_ID === 16661;
/** One TeeML call may include multiple files — allow extra wall time. */
const COMPUTE_CHUNK_SCAN_TIMEOUT_MS = 90_000;
const INFERENCE_CHUNK_SIZE = 3;
const CHUNK_INFERENCE_DELAY_MS = 15_000;
const SUMMARY_UPLOAD_TIMEOUT_MS = IS_MAINNET ? 180_000 : 30_000;
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

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

    const segments = filePath.split("/");
    if (segments.some((seg) => EXCLUDED_REPO_PATH_SEGMENTS.has(seg))) return false;

    if (isExcludedInfrastructurePath(filePath)) return false;

    return SCANNABLE_EXTENSIONS.some((ext) => filePath.endsWith(ext));
  }) as GithubBlobFile[];

  const {
    tier1Critical,
    tier2HighPool,
    tier2Capped,
    tier3Skipped,
    scanQueue: scanFiles,
  } = partitionRepoFilesForScan(files);

  const stream = new ReadableStream<Uint8Array>({
    start: async (controller) => {
      let totalFindings = 0;
      let processedFiles = 0;
      let failedFiles = 0;
      let rootHash: string | null = null;
      let memoryRootHash: string | null = null;
      let skipBilling = false;
      const backgroundUploads: Promise<void>[] = [];
      const aggregatedFindings: Array<
        StreamFinding & { attestationHash: string }
      > = [];

      try {
        const provider = new ethers.JsonRpcProvider(resolveOgRpcUrl());
        const signer = new ethers.Wallet(deployerPrivateKey, provider);
        const broker = await createBroker(signer);
        let computeProviders = await listComputeProviders(broker);
        const envPreferred =
          (process.env.ZERO_G_COMPUTE_PROVIDER ??
            process.env.OG_COMPUTE_PROVIDER ??
            process.env.ZEROG_COMPUTE_PROVIDER ??
            "").trim();
        if (
          computeProviders.length === 0 &&
          envPreferred &&
          ethers.isAddress(envPreferred)
        ) {
          computeProviders = [ethers.getAddress(envPreferred)];
        }
        if (computeProviders.length === 0) {
          streamChunk(controller, {
            type: "error",
            message:
              "No 0G Compute providers available from listService. Set ZERO_G_COMPUTE_PROVIDER or OG_COMPUTE_PROVIDER or try again later.",
          });
          skipBilling = true;
        } else {
          await initializeComputeAccount(broker, computeProviders);
        }
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

        const uniqueTier1Labels = new Set<string>();
        for (const f of tier1Critical) {
          for (const kw of tier1KeywordsMatchedInBasename(f.path)) {
            uniqueTier1Labels.add(formatTier1KeywordLabel(kw));
          }
        }
        const tier1LabelStr = [...uniqueTier1Labels].sort().join(", ");

        if (tier1Critical.length > 0) {
          const labelPart = tier1LabelStr ? ` (${tier1LabelStr})` : "";
          streamChunk(controller, {
            type: "notice",
            message: `Found ${tier1Critical.length} critical-risk file${tier1Critical.length === 1 ? "" : "s"}${labelPart} — scanning all`,
          });
        }

        if (tier2HighPool.length > 0) {
          const where = describeHighTierLocation(tier2HighPool.map((f) => f.path));
          const scanVerb =
            tier2Capped
              ? `scanning ${MAX_HIGH_TIER_SCAN_FILES} highest-priority paths`
              : "scanning all";
          streamChunk(controller, {
            type: "notice",
            message: `Found ${tier2HighPool.length} high-risk file${tier2HighPool.length === 1 ? "" : "s"} ${where} — ${scanVerb}`,
          });
        }

        if (tier3Skipped.length > 0) {
          streamChunk(controller, {
            type: "notice",
            message: `Skipped ${tier3Skipped.length} low-risk utility file${tier3Skipped.length === 1 ? "" : "s"}`,
          });
        }

        if (!skipBilling) {
        for (let chunkIdx = 0; chunkIdx < scanFiles.length; chunkIdx += INFERENCE_CHUNK_SIZE) {
          if (chunkIdx > 0) {
            await sleep(CHUNK_INFERENCE_DELAY_MS);
          }
          const chunk = scanFiles.slice(chunkIdx, chunkIdx + INFERENCE_CHUNK_SIZE);
          const inputs: OpenClawFileInput[] = [];

          for (const file of chunk) {
            if (!file.path || !file.url) continue;
            const filePath = file.path;
            const fileUrl = file.url;

            streamChunk(controller, { type: "file", filename: filePath });

            const blobRes = await fetch(fileUrl, {
              headers: githubHeaders,
            });
            if (!blobRes.ok) {
              failedFiles += 1;
              processedFiles += 1;
              streamChunk(controller, {
                type: "error",
                message: `${filePath}: Failed to fetch file from GitHub.`,
              });
              continue;
            }

            const blobJson = (await blobRes.json()) as {
              content?: string;
              encoding?: string;
            };
            if (!blobJson.content) {
              failedFiles += 1;
              processedFiles += 1;
              streamChunk(controller, {
                type: "error",
                message: `${filePath}: Empty file content.`,
              });
              continue;
            }

            const decodedContent =
              blobJson.encoding === "base64"
                ? Buffer.from(blobJson.content.replace(/\n/g, ""), "base64").toString("utf8")
                : blobJson.content;

            streamChunk(controller, {
              type: "notice",
              message: `${filePath}: Uploading to 0G Storage...`,
            });
            const backgroundUpload = runStorageUploadSequentially(async () => {
              try {
                await uploadFile(decodedContent, filePath, signer);
              } catch (error) {
                const message = toErrorMessage(error);
                if (
                  message.toLowerCase().includes("upload timed out") &&
                  message.toLowerCase().includes("stored locally")
                ) {
                  streamChunk(controller, {
                    type: "error",
                    message: `${filePath}: upload timed out — stored locally — blockchain confirmation pending`,
                  });
                  return;
                }
                streamChunk(controller, {
                  type: "notice",
                  message: `${filePath}: 0G Storage upload pending (${message})`,
                });
              }
            });
            backgroundUploads.push(backgroundUpload);
            inputs.push({ path: filePath, content: decodedContent });
          }

          if (inputs.length === 0) continue;

          try {
            const scanResults = await withTimeout(
              runSecurityScan(repoUrl, inputs, {
                computeProviders,
                broker,
                memoryContext,
                chunkSize: INFERENCE_CHUNK_SIZE,
              }),
              COMPUTE_CHUNK_SCAN_TIMEOUT_MS,
              `Compute scan for chunk (${inputs.map((i) => i.path).join(", ")})`,
            );

            for (const result of scanResults) {
              processedFiles += 1;
              const uniqueForFile = deduplicateFindingsByFileLineIssue(result.findings);
              for (const finding of uniqueForFile) {
                totalFindings += 1;
                aggregatedFindings.push({
                  severity: finding.severity,
                  file: finding.file,
                  line: finding.line,
                  issue: finding.issue,
                  fix: finding.fix,
                  attestationHash: result.attestationHash,
                });
                streamChunk(controller, {
                  type: "finding",
                  finding: {
                    severity: finding.severity,
                    file: finding.file,
                    line: finding.line,
                    issue: finding.issue,
                    fix: finding.fix,
                  },
                  attestationHash: result.attestationHash,
                });
              }
            }
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Chunk scan failed.";
            for (const input of inputs) {
              failedFiles += 1;
              processedFiles += 1;
              streamChunk(controller, {
                type: "error",
                message: `${input.path}: ${message}`,
              });
            }
          }
        }
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unexpected scan pipeline error.";
        streamChunk(controller, { type: "error", message });
      } finally {
        const completedAt = new Date().toISOString();
        try {
          const provider = new ethers.JsonRpcProvider(resolveOgRpcUrl());
          if (deployerPrivateKey) {
            const signer = new ethers.Wallet(deployerPrivateKey, provider);
            const summaryReport = {
              repoUrl,
              scanDate: completedAt,
              totalFiles: scanFiles.length,
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

        if (scanFiles.length > 0 && deployerPrivateKey && !skipBilling) {
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

        if (backgroundUploads.length > 0) {
          streamChunk(controller, {
            type: "notice",
            message: `Background 0G Storage uploads running: ${backgroundUploads.length}`,
          });
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
          totalFiles: scanFiles.length,
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
      "X-Total-Files": String(scanFiles.length),
    },
  });
}
