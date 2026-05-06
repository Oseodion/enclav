import * as ServingBroker from "@0glabs/0g-serving-broker";
import { ethers } from "ethers";
import { resolveOgRpcUrl, resolveOgStorageIndexerUrl } from "@/lib/og-env";

type InferenceBroker = {
  inference: {
    listService?: (
      offset?: number,
      limit?: number,
      includeUnacknowledged?: boolean,
    ) => Promise<Array<{ provider?: string; model?: string; name?: string; serviceName?: string }>>;
    getServiceMetadata: (provider: string) => Promise<{ endpoint: string; model?: string }>;
    getRequestHeaders: (provider: string, payload: string) => Promise<Record<string, string>>;
    processResponse: (provider: string, key: string, usage?: string) => Promise<void>;
  };
};

type ChatRole = "system" | "user" | "assistant";

export type ComputeChatMessage = {
  role: ChatRole;
  content: string;
};

export type ComputeChatResult = {
  content: string;
  attestationHash: string;
  model: string;
  providerAddress: string;
};

/** Default when `OG_COMPUTE_MODEL` is unset — 0G Aristotle mainnet TeeML catalog. */
const DEFAULT_OG_MODEL = "deepseek-chat-v3-0324";

function getZeroGChainPrivateKey(): string {
  return (
    process.env.ZERO_G_CHAIN_PRIVATE_KEY?.trim() ||
    process.env.DEPLOYER_PRIVATE_KEY?.trim() ||
    ""
  );
}

function getZeroGChainRpcUrl(): string {
  return process.env.ZERO_G_CHAIN_RPC_URL?.trim() || resolveOgRpcUrl();
}
const SECURITY_SYSTEM_PROMPT =
  "IMPORTANT: You must respond in English only. Do not use any other language under any circumstances. You are a security auditor. Analyze this code for security vulnerabilities. Return ONLY a JSON array of findings. Each finding must have: severity (Critical/High/Medium/Low), file (string), line (number), issue (string), fix (string), vulnerableCode (string), suggestedCode (string). Keep vulnerableCode and suggestedCode short - maximum 5 lines each. If no issues found return empty array [].";

const CHUNK_AUDIT_USER_PREFIX =
  `You are a security auditor. Analyze ALL of these files for vulnerabilities. Return ONLY a JSON array. Each finding must have: severity (Critical/High/Medium/Low), file (exact filename), line (number), issue (string), fix (string). If no issues found return [].`;

const ENGLISH_ONLY_PREFIX =
  "IMPORTANT: You must respond in English only. Do not use any other language under any circumstances.";

let brokerPromise: Promise<unknown> | null = null;

export type Finding = {
  severity: "Critical" | "High" | "Medium" | "Low";
  file: string;
  line: number;
  issue: string;
  fix: string;
  vulnerableCode: string;
  suggestedCode: string;
};

function getEnv() {
  const rawProvider =
    (process.env.ZERO_G_COMPUTE_PROVIDER ??
      process.env.OG_COMPUTE_PROVIDER ??
      process.env.ZEROG_COMPUTE_PROVIDER ??
      "").trim();
  let providerAddress = "";
  if (rawProvider) {
    if (!ethers.isAddress(rawProvider)) {
      throw new Error(
        "ZERO_G_COMPUTE_PROVIDER / OG_COMPUTE_PROVIDER must be a valid hex address.",
      );
    }
    providerAddress = ethers.getAddress(rawProvider);
  }
  return {
    rpcUrl: resolveOgRpcUrl(),
    computeApiBaseUrl:
      process.env.OG_COMPUTE_API_BASE_URL ?? resolveOgStorageIndexerUrl(),
    providerAddress,
    model: process.env.OG_COMPUTE_MODEL ?? DEFAULT_OG_MODEL,
    privateKey: process.env.DEPLOYER_PRIVATE_KEY ?? "",
  };
}

async function resolveProviderAddress(
  broker: {
    inference: {
      listService?: (
        offset?: number,
        limit?: number,
        includeUnacknowledged?: boolean,
      ) => Promise<Array<{ provider?: string }>>;
    };
  },
  configuredProviderAddress?: string,
) {
  const configured = configuredProviderAddress?.trim();
  if (configured) {
    if (!ethers.isAddress(configured)) {
      throw new Error(
        `OG_COMPUTE_PROVIDER must be a valid hex address (got "${configured}").`,
      );
    }
    return ethers.getAddress(configured);
  }

  if (!broker.inference.listService) {
    throw new Error(
      "OG_COMPUTE_PROVIDER is required for security scanning (provider auto-discovery unavailable).",
    );
  }

  const services = await broker.inference.listService(0, 20, true);
  const qwenGlmFirst = services.filter((s) => {
    if (!s.provider || !ethers.isAddress(s.provider)) return false;
    const meta = `${(s as { model?: string }).model ?? ""} ${(s as { name?: string }).name ?? ""} ${(s as { serviceName?: string }).serviceName ?? ""}`.toLowerCase();
    return /qwen|glm|zhipu/.test(meta);
  });
  const pool = qwenGlmFirst.length > 0 ? qwenGlmFirst : services;
  const rawProvider = pool.find((s) => s.provider && ethers.isAddress(s.provider))?.provider;
  if (!rawProvider || !ethers.isAddress(rawProvider)) {
    throw new Error(
      "OG_COMPUTE_PROVIDER is required for security scanning (no providers found via listService).",
    );
  }

  return ethers.getAddress(rawProvider);
}

/**
 * Mainnet provider catalog via standalone broker (same as Emmanuel gist — for discovering Qwen/GLM addresses).
 */
export async function listZeroGProviders(): Promise<
  Array<{ provider?: string; model?: string; name?: string; [key: string]: unknown }>
> {
  const pk = getZeroGChainPrivateKey();
  if (!pk) {
    throw new Error("ZERO_G_CHAIN_PRIVATE_KEY or DEPLOYER_PRIVATE_KEY is required to list providers.");
  }
  const rpc = getZeroGChainRpcUrl();
  const wallet = new ethers.Wallet(pk, new ethers.JsonRpcProvider(rpc));
  const broker = (await createBroker(wallet)) as InferenceBroker;
  if (!broker.inference.listService) {
    throw new Error("0G Compute broker does not expose listService.");
  }
  return await broker.inference.listService(0, 20, true);
}

/** All distinct provider addresses — Qwen / GLM / Zhipu entries first when metadata matches (offset 0, limit 20). */
export async function listComputeProviders(broker: unknown): Promise<string[]> {
  const sdkBroker = broker as InferenceBroker;
  if (!sdkBroker.inference.listService) {
    throw new Error("0G Compute broker does not expose listService.");
  }
  const services = await sdkBroker.inference.listService(0, 20, true);
  const preferred: string[] = [];
  const rest: string[] = [];
  for (const s of services) {
    const raw = s.provider?.trim();
    if (!raw || !ethers.isAddress(raw)) continue;
    const addr = ethers.getAddress(raw);
    const meta = `${(s as { model?: string }).model ?? ""} ${(s as { name?: string }).name ?? ""} ${(s as { serviceName?: string }).serviceName ?? ""}`.toLowerCase();
    if (/qwen|glm|zhipu/.test(meta)) preferred.push(addr);
    else rest.push(addr);
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of [...preferred, ...rest]) {
    if (!seen.has(a)) {
      seen.add(a);
      out.push(a);
    }
  }
  return out;
}

/** Preferred first (if present), then remaining providers; preferred may be prepended even if not in list. */
export function orderProvidersForRotation(
  addresses: string[],
  preferredRaw?: string,
): string[] {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const addr of addresses) {
    if (!ethers.isAddress(addr)) continue;
    const c = ethers.getAddress(addr);
    if (!seen.has(c)) {
      seen.add(c);
      unique.push(c);
    }
  }
  const preferred = preferredRaw?.trim();
  if (!preferred || !ethers.isAddress(preferred)) {
    return unique;
  }
  const p = ethers.getAddress(preferred);
  const rest = unique.filter((x) => x !== p);
  if (seen.has(p)) {
    return [p, ...rest];
  }
  return [p, ...unique];
}

const RATE_LIMIT_FULL_ROTATION_BACKOFF_MS = 15_000;
const AUTO_TOPUP_THRESHOLD_OG = "0.3";
const AUTO_TOPUP_AMOUNT_OG = "0.5";

export class ComputeHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`Compute request failed (${status})`);
    this.name = "ComputeHttpError";
  }
}

export async function createBroker(signer: ethers.Signer) {
  try {
    const { rpcUrl } = getEnv();
    const brokerModule = ServingBroker as unknown as Record<string, unknown>;
    const factory = brokerModule["ZGServingUserBrokerFactory"] as
      | {
          create: (s: ethers.Signer, rpcUrl: string) => Promise<unknown>;
        }
      | undefined;

    if (factory?.create) {
      return await factory.create(signer, rpcUrl);
    }

    const fallbackCreate = brokerModule["createZGComputeNetworkBroker"] as
      | ((s: ethers.Signer) => Promise<unknown>)
      | undefined;

    if (fallbackCreate) {
      return await fallbackCreate(signer);
    }

    throw new Error("No compatible broker factory export found.");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown broker error";
    throw new Error(`Failed to create 0G Compute broker: ${message}`);
  }
}

/** Seed each listed inference provider sub-account from the main ledger (see SDK `transferFund`). */
const INFERENCE_SUB_ACCOUNT_SEED_OG = "0.1";

type InferenceLedgerApi = {
  getLedger: () => Promise<unknown>;
  addLedger: (amount: number, gasPrice?: number) => Promise<void>;
  getAccount?: (wallet: string, provider: string) => Promise<unknown>;
  getProvidersWithBalance: (
    serviceTypeStr: "inference" | "fine-tuning",
  ) => Promise<[string, bigint, bigint][]>;
  transferFund: (
    provider: string,
    serviceTypeStr: "inference" | "fine-tuning",
    amount: bigint,
    gasPrice?: number,
  ) => Promise<void>;
};

function readBalanceFromAccountPayload(accountPayload: unknown): bigint | null {
  if (typeof accountPayload === "bigint") return accountPayload;
  if (typeof accountPayload === "number" && Number.isFinite(accountPayload)) {
    return BigInt(Math.trunc(accountPayload));
  }
  if (typeof accountPayload === "string") {
    const t = accountPayload.trim();
    if (/^\d+$/.test(t)) return BigInt(t);
    return null;
  }
  if (typeof accountPayload !== "object" || accountPayload === null) {
    return null;
  }
  const obj = accountPayload as Record<string, unknown>;
  const candidateKeys = [
    "balance",
    "availableBalance",
    "totalBalance",
    "freeBalance",
    "amount",
    "credit",
  ];
  for (const key of candidateKeys) {
    if (!(key in obj)) continue;
    const v = obj[key];
    const parsed = readBalanceFromAccountPayload(v);
    if (parsed !== null) return parsed;
  }
  return null;
}

async function autoTopUpInferenceSubAccount(
  broker: unknown,
  providerAddress: string,
): Promise<void> {
  const ledgerApi = (broker as { ledger?: InferenceLedgerApi }).ledger;
  if (!ledgerApi?.getAccount || !ledgerApi.transferFund) return;

  const privateKey = getEnv().privateKey?.trim();
  if (!privateKey) return;
  const walletAddress = new ethers.Wallet(privateKey).address;
  const provider = ethers.getAddress(providerAddress);

  try {
    const account = await ledgerApi.getAccount(walletAddress, provider);
    const balance = readBalanceFromAccountPayload(account);
    if (balance === null) return;
    if (balance >= ethers.parseEther(AUTO_TOPUP_THRESHOLD_OG)) return;

    await ledgerApi.transferFund(
      provider,
      "inference",
      ethers.parseEther(AUTO_TOPUP_AMOUNT_OG),
    );
    console.log("[compute] auto-topped up Qwen sub-account");
  } catch (error) {
    console.warn(
      "[compute] auto-topup check failed",
      error instanceof Error ? error.message : error,
    );
  }
}

/**
 * Ensures the on-chain 0G Compute **main ledger** exists, then checks a single configured
 * inference provider sub-account via `ledger.getAccount(wallet, provider)`.
 * Funds only when that sub-account does not yet exist.
 *
 * SDK (see `lib.commonjs/ledger/broker.d.ts`): **`transferFund(provider, "inference", amount, gasPrice?)`**
 * — `amount` is **bigint neuron** (use `ethers.parseEther("0.1")` for 0.1 OG).
 * There is **no** `depositFundForProvider`; main → provider sub-account uses **`transferFund`**.
 */
export async function initializeComputeAccount(
  broker: unknown,
): Promise<void> {
  const ledgerApi = (broker as { ledger?: InferenceLedgerApi }).ledger;
  if (!ledgerApi?.getLedger || !ledgerApi?.addLedger) {
    return;
  }

  try {
    await ledgerApi.getLedger();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes("Account does not exist") ||
      message.includes("add-account") ||
      message.includes("does not exist")
    ) {
      await ledgerApi.addLedger(3);
    } else {
      throw error;
    }
  }

  const transferFund = ledgerApi.transferFund;
  if (!transferFund) {
    return;
  }

  const configuredRaw = (process.env.ZERO_G_COMPUTE_PROVIDER ?? "").trim();
  if (!configuredRaw || !ethers.isAddress(configuredRaw)) {
    console.warn("[compute] ZERO_G_COMPUTE_PROVIDER missing/invalid; skipping funding bootstrap");
    return;
  }
  const configuredProvider = ethers.getAddress(configuredRaw);

  const privateKey = getEnv().privateKey?.trim();
  if (!privateKey) {
    console.warn("[compute] DEPLOYER_PRIVATE_KEY missing; skipping funding bootstrap");
    return;
  }
  const walletAddress = new ethers.Wallet(privateKey).address;

  const amountNeuron = ethers.parseEther(INFERENCE_SUB_ACCOUNT_SEED_OG);
  const getAccount = ledgerApi.getAccount;
  if (getAccount) {
    try {
      await getAccount(walletAddress, configuredProvider);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
      const missingAccount =
        message.includes("does not exist") ||
        message.includes("account not found") ||
        message.includes("not found");
      if (!missingAccount) {
        console.error("[compute] broker.ledger.getAccount failed", {
          walletAddress,
          provider: configuredProvider,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }
  }

  try {
    await transferFund(configuredProvider, "inference", amountNeuron);
  } catch (error) {
    console.error("[compute] broker.ledger.transferFund failed", {
      provider: configuredProvider,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function getBroker() {
  if (!brokerPromise) {
    const { privateKey, rpcUrl } = getEnv();
    if (!privateKey) {
      throw new Error("DEPLOYER_PRIVATE_KEY is required for 0G Compute calls.");
    }
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);
    brokerPromise = createBroker(wallet);
  }
  return brokerPromise;
}

export type ScanFileOptions = {
  /** Appended to the security system prompt (0G long-context memory). */
  memoryContext?: string;
};

export type ScanChunkOptions = ScanFileOptions & {
  /** Catalog from `listComputeProviders` (scan start); rotation starts with `ZERO_G_COMPUTE_PROVIDER` / `OG_COMPUTE_PROVIDER` when set. */
  providers: string[];
  chunkIndex: number;
};

async function executeSecurityScanCompletion(
  broker: unknown,
  resolvedProviderAddress: string,
  systemContent: string,
  userContent: string,
): Promise<{ rawContent: string; attestationHash: string }> {
  const { model } = getEnv();
  const sdkBroker = broker as InferenceBroker;

  const service = await sdkBroker.inference.getServiceMetadata(resolvedProviderAddress);
  const payload = {
    model: model || service.model || DEFAULT_OG_MODEL,
    messages: [
      { role: "system", content: systemContent },
      { role: "user", content: userContent },
    ],
  };
  const billingHeaders = await sdkBroker.inference.getRequestHeaders(
    resolvedProviderAddress,
    JSON.stringify(payload),
  );

  const response = await fetch(`${service.endpoint}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...billingHeaders,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new ComputeHttpError(response.status, errorBody);
  }

  const responseJson = (await response.json()) as {
    id?: string;
    usage?: unknown;
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };

  const rawContent = responseJson.choices?.[0]?.message?.content?.trim() ?? "[]";
  const attestationHash = response.headers.get("ZG-Res-Key") ?? responseJson.id;

  if (!attestationHash) {
    throw new Error("Missing TeeML attestation hash in scan response.");
  }

  await sdkBroker.inference.processResponse(
    resolvedProviderAddress,
    attestationHash,
    responseJson.usage ? JSON.stringify(responseJson.usage) : undefined,
  );
  await autoTopUpInferenceSubAccount(broker, resolvedProviderAddress);

  return { rawContent, attestationHash };
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Tries each provider in order; on 429 moves to the next. After a full pass of only 429s,
 * waits 15s and retries from the first provider.
 */
async function executeSecurityScanWithProviderRotation(
  broker: unknown,
  orderedProviders: string[],
  systemContent: string,
  userContent: string,
): Promise<{ rawContent: string; attestationHash: string }> {
  if (orderedProviders.length === 0) {
    throw new Error("No compute providers available for rotation.");
  }

  for (;;) {
    for (const provider of orderedProviders) {
      try {
        const result = await executeSecurityScanCompletion(
          broker,
          provider,
          systemContent,
          userContent,
        );
        return result;
      } catch (e) {
        if (e instanceof ComputeHttpError && e.status === 429) {
          continue;
        }
        throw e;
      }
    }
    await sleep(RATE_LIMIT_FULL_ROTATION_BACKOFF_MS);
  }
}

function mapParsedRowToFinding(item: Partial<Finding>, fileFallback: string): Finding {
  return {
    severity:
      item.severity === "Critical" ||
      item.severity === "High" ||
      item.severity === "Medium" ||
      item.severity === "Low"
        ? item.severity
        : "Low",
    file: item.file || fileFallback,
    line: Number.isFinite(item.line) ? Number(item.line) : 1,
    issue: item.issue || "Unspecified vulnerability",
    fix: item.fix || "Review and harden this code path.",
    vulnerableCode:
      item.vulnerableCode || "/* Vulnerable code snippet unavailable */",
    suggestedCode:
      item.suggestedCode || "/* Suggested code snippet unavailable */",
  };
}

/** Map model `file` field to a repository path from the current chunk. */
function resolveFindingPathToChunk(modelFile: string, chunkPaths: string[]): string | null {
  const t = modelFile.trim().replace(/^\.\//, "");
  if (chunkPaths.includes(t)) return t;
  const tail = t.includes("/") ? (t.split("/").pop() ?? t) : t;
  const baseMatches = chunkPaths.filter((p) => (p.split("/").pop() ?? p) === tail);
  if (baseMatches.length === 1) return baseMatches[0];
  const suffixMatches = chunkPaths.filter((p) => p === t || p.endsWith(`/${t}`));
  if (suffixMatches.length === 1) return suffixMatches[0];
  return chunkPaths.length === 1 ? chunkPaths[0] : null;
}

function buildChunkUserContent(files: Array<{ path: string; content: string }>): string {
  const parts: string[] = [CHUNK_AUDIT_USER_PREFIX, ""];
  files.forEach((f, i) => {
    parts.push(`=== FILE ${i + 1}: ${f.path} ===`);
    parts.push(f.content);
    parts.push("");
  });
  return parts.join("\n");
}

export async function scanFileForVulnerabilities(
  broker: unknown,
  filename: string,
  content: string,
  options?: ScanFileOptions,
): Promise<{ findings: Finding[]; attestationHash: string }> {
  try {
    const systemContent = options?.memoryContext?.trim()
      ? `${SECURITY_SYSTEM_PROMPT}\n\n${options.memoryContext.trim()}`
      : SECURITY_SYSTEM_PROMPT;

    const userContent = `Filename: ${filename}\n\nCode:\n${content}`;
    const { providerAddress } = getEnv();
    const sdkBroker = broker as InferenceBroker;
    const resolved = await resolveProviderAddress(sdkBroker, providerAddress);
    const { rawContent, attestationHash } = await executeSecurityScanCompletion(
      broker,
      resolved,
      systemContent,
      userContent,
    );

    let parsed: unknown = [];
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      parsed = [];
    }

    const findings: Finding[] = Array.isArray(parsed)
      ? parsed
          .map((item) => item as Partial<Finding>)
          .filter((item) => item.issue && item.fix)
          .map((item) => mapParsedRowToFinding(item, filename))
      : [];

    return { findings, attestationHash };
  } catch (error) {
    console.error("0G compute file scan failed", { filename, error });
    throw new Error("Scan failed for this file - continuing");
  }
}

/** Multi-file chunk: one TeeML call, one attestation hash for the whole chunk. */
export async function scanChunkForVulnerabilities(
  broker: unknown,
  files: Array<{ path: string; content: string }>,
  options?: ScanChunkOptions,
): Promise<{ findings: Finding[]; attestationHash: string }> {
  if (files.length === 0) {
    return { findings: [], attestationHash: "" };
  }
  const providers = options?.providers;
  if (!providers || providers.length === 0) {
    throw new Error("scanChunkForVulnerabilities requires options.providers from listComputeProviders.");
  }

  const chunkPaths = files.map((f) => f.path);
  const memory = options?.memoryContext?.trim();
  const systemContent = memory
    ? `${ENGLISH_ONLY_PREFIX}\n\n${memory}`
    : ENGLISH_ONLY_PREFIX;
  const userContent = buildChunkUserContent(files);

  try {
    const { providerAddress } = getEnv();
    const ordered = orderProvidersForRotation(providers, providerAddress);
    const { rawContent, attestationHash } = await executeSecurityScanWithProviderRotation(
      broker,
      ordered,
      systemContent,
      userContent,
    );

    let parsed: unknown = [];
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      parsed = [];
    }

    const findings: Finding[] = [];
    if (Array.isArray(parsed)) {
      for (const row of parsed) {
        const item = row as Partial<Finding>;
        if (!item.issue || !item.fix) continue;
        const rawFile = typeof item.file === "string" ? item.file : "";
        const resolved = rawFile
          ? resolveFindingPathToChunk(rawFile, chunkPaths)
          : chunkPaths.length === 1
            ? chunkPaths[0]
            : null;
        if (!resolved) continue;
        findings.push(mapParsedRowToFinding({ ...item, file: resolved }, resolved));
      }
    }

    return { findings, attestationHash };
  } catch (error) {
    console.error("0G compute chunk scan failed", { paths: chunkPaths, error });
    throw new Error("Scan failed for this file - continuing");
  }
}

export async function inferWithTeeML(
  messages: ComputeChatMessage[],
): Promise<ComputeChatResult> {
  const { providerAddress, model } = getEnv();
  const broker = (await getBroker()) as InferenceBroker;
  const resolvedProviderAddress = await resolveProviderAddress(
    broker,
    providerAddress,
  );
  const service = await broker.inference.getServiceMetadata(resolvedProviderAddress);
  const payload = {
    model: model || service.model || DEFAULT_OG_MODEL,
    messages,
  };

  const billingHeaders = await broker.inference.getRequestHeaders(
    resolvedProviderAddress,
    JSON.stringify(payload),
  );

  const response = await fetch(`${service.endpoint}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...billingHeaders,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `0G Compute request failed (${response.status}): ${errorBody}`,
    );
  }

  const responseJson = (await response.json()) as {
    id?: string;
    usage?: unknown;
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };

  const content =
    responseJson.choices?.[0]?.message?.content?.trim() ??
    "No response content returned.";
  const attestationHash = response.headers.get("ZG-Res-Key") ?? responseJson.id;

  if (!attestationHash) {
    throw new Error("Missing TeeML attestation hash in compute response.");
  }

  await broker.inference.processResponse(
    resolvedProviderAddress,
    attestationHash,
    responseJson.usage ? JSON.stringify(responseJson.usage) : undefined,
  );

  return {
    content,
    attestationHash,
    model: payload.model ?? DEFAULT_OG_MODEL,
    providerAddress: resolvedProviderAddress,
  };
}
