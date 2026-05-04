import * as ServingBroker from "@0glabs/0g-serving-broker";
import { ethers } from "ethers";
import OpenAI from "openai";
import { APIError } from "openai";
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

/** Default model for OpenAI-compatible 0G proxy (Qwen / GLM — less rate-limited than DeepSeek on mainnet). */
const DEFAULT_OPENAI_MODEL = "qwen3.6-plus";

const DEFAULT_OPENAI_BASE_URL = "https://integratenetwork.work/v1/proxy";

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

type CachedZeroGToken = {
  apiKey: string;
  expiresAt: number;
};

const openAiTokenByProvider = new Map<string, CachedZeroGToken>();
const openAiTokenInflight = new Map<string, Promise<string>>();

function decodeExpiryFromApiKey(apiKey: string): number {
  try {
    const stripped = apiKey.replace(/^app-sk-/, "");
    const payloadB64 = stripped.split("|")[0];
    if (!payloadB64) return Date.now() + 23 * 60 * 60 * 1000;
    const json = Buffer.from(payloadB64, "base64").toString();
    const decoded = JSON.parse(json) as { expiresAt?: number };
    if (typeof decoded.expiresAt === "number") return decoded.expiresAt;
  } catch {
    /* fall through */
  }
  return Date.now() + 23 * 60 * 60 * 1000;
}

function providerCacheKey(address: string): string {
  return ethers.getAddress(address);
}

export function clearOpenAiCompatibleTokenCache(providerAddress?: string): void {
  if (providerAddress) {
    openAiTokenByProvider.delete(providerCacheKey(providerAddress));
  } else {
    openAiTokenByProvider.clear();
  }
}

/**
 * Mint a fresh Bearer token via the broker for the OpenAI-compatible proxy (Emmanuel / 0G pattern).
 */
async function getOpenAiCompatibleApiKey(
  broker: InferenceBroker,
  providerAddress: string,
  payloadJson: string,
): Promise<string> {
  const key = providerCacheKey(providerAddress);
  const hit = openAiTokenByProvider.get(key);
  if (hit && Date.now() < hit.expiresAt - TOKEN_REFRESH_BUFFER_MS) {
    return hit.apiKey;
  }
  let inflight = openAiTokenInflight.get(key);
  if (inflight) return inflight;

  inflight = (async () => {
    const headers = await broker.inference.getRequestHeaders(providerAddress, payloadJson);
    const headersObj = headers as Record<string, string>;
    const auth = headersObj.Authorization ?? headersObj.authorization ?? "";
    const apiKey = auth.replace(/^Bearer\s+/i, "").trim();
    if (!apiKey) {
      throw new Error("0G broker returned empty Authorization header for OpenAI-compatible inference.");
    }
    const expiresAt = decodeExpiryFromApiKey(apiKey);
    openAiTokenByProvider.set(key, { apiKey, expiresAt });
    return apiKey;
  })();

  openAiTokenInflight.set(key, inflight);
  try {
    return await inflight;
  } finally {
    openAiTokenInflight.delete(key);
  }
}

function getOpenAiBaseUrl(): string {
  return (process.env.OPENAI_BASE_URL ?? DEFAULT_OPENAI_BASE_URL).replace(/\/$/, "");
}

function getOpenAiModel(): string {
  return (
    process.env.OPENAI_MODEL?.trim() ||
    process.env.OG_COMPUTE_MODEL?.trim() ||
    DEFAULT_OPENAI_MODEL
  );
}

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
    model: getOpenAiModel(),
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

function formatProviderLog(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
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

export async function initializeComputeAccount(signer: ethers.Signer) {
  const broker = (await createBroker(signer)) as {
    ledger?: {
      getLedger?: () => Promise<unknown>;
      addLedger?: (amount: number, gasPrice?: number) => Promise<unknown>;
    };
  };

  const ledgerApi = broker.ledger;
  if (!ledgerApi?.getLedger || !ledgerApi?.addLedger) {
    return broker;
  }

  try {
    await ledgerApi.getLedger();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes("Account does not exist") ||
      message.includes("add-account")
    ) {
      await ledgerApi.addLedger(3);
      return broker;
    }
    throw error;
  }

  return broker;
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

/**
 * OpenAI-compatible 0G proxy (integratenetwork.work) with broker-minted Bearer token + ZG-Res-Key from response.
 */
async function runOpenAiCompatibleChatCompletion(
  broker: InferenceBroker,
  resolvedProviderAddress: string,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
): Promise<{ rawContent: string; attestationHash: string }> {
  const model = getOpenAiModel();

  const send = async (): Promise<{ rawContent: string; attestationHash: string }> => {
    const payloadJson = JSON.stringify({ model, messages });
    const apiKey = await getOpenAiCompatibleApiKey(broker, resolvedProviderAddress, payloadJson);
    let zgKey: string | null = null;
    const scopedFetch: typeof fetch = async (input, init) => {
      const res = await fetch(input as RequestInfo, init as RequestInit);
      zgKey = res.headers.get("ZG-Res-Key") ?? zgKey;
      return res;
    };
    const client = new OpenAI({
      apiKey,
      baseURL: getOpenAiBaseUrl(),
      fetch: scopedFetch,
    });
    let completion;
    try {
      completion = await client.chat.completions.create({
        model,
        messages,
      });
    } catch (err) {
      if (err instanceof APIError) {
        throw new ComputeHttpError(err.status ?? 500, err.message);
      }
      throw err;
    }
    const rawContent = completion.choices[0]?.message?.content?.trim() ?? "[]";
    const attestationHash = zgKey ?? completion.id ?? "";
    if (!attestationHash) {
      throw new Error("Missing TeeML attestation hash in scan response.");
    }
    await broker.inference.processResponse(
      resolvedProviderAddress,
      attestationHash,
      completion.usage ? JSON.stringify(completion.usage) : undefined,
    );
    return { rawContent, attestationHash };
  };

  try {
    return await send();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/session token expired|token expired/i.test(msg)) {
      clearOpenAiCompatibleTokenCache(resolvedProviderAddress);
      return await send();
    }
    throw err;
  }
}

async function executeSecurityScanCompletion(
  broker: unknown,
  resolvedProviderAddress: string,
  systemContent: string,
  userContent: string,
): Promise<{ rawContent: string; attestationHash: string }> {
  const sdkBroker = broker as InferenceBroker;
  return runOpenAiCompatibleChatCompletion(sdkBroker, resolvedProviderAddress, [
    { role: "system", content: systemContent },
    { role: "user", content: userContent },
  ]);
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
  chunkIndex: number,
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
        console.log(
          `[compute] using provider ${formatProviderLog(provider)} for chunk ${chunkIndex}`,
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
  const chunkIndex = options?.chunkIndex ?? 1;
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
      chunkIndex,
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
  const { providerAddress } = getEnv();
  const broker = (await getBroker()) as InferenceBroker;
  const resolvedProviderAddress = await resolveProviderAddress(
    broker,
    providerAddress,
  );
  const mapped = messages.map((m) => ({
    role: m.role,
    content: m.content,
  })) as Array<{ role: "system" | "user" | "assistant"; content: string }>;
  const { rawContent, attestationHash } = await runOpenAiCompatibleChatCompletion(
    broker,
    resolvedProviderAddress,
    mapped,
  );
  return {
    content: rawContent,
    attestationHash,
    model: getOpenAiModel(),
    providerAddress: resolvedProviderAddress,
  };
}
