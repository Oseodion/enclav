import * as ServingBroker from "@0glabs/0g-serving-broker";
import { ethers } from "ethers";

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

const TESTNET_RPC = "https://evmrpc-testnet.0g.ai";
const TESTNET_MODEL = "qwen/qwen-2.5-7b-instruct";
const COMPUTE_API_BASE_URL_DEFAULT = "https://indexer-storage-testnet-turbo.0g.ai";
const SECURITY_SYSTEM_PROMPT =
  "IMPORTANT: You must respond in English only. Do not use any other language under any circumstances. You are a security auditor. Analyze this code for security vulnerabilities. Return ONLY a JSON array of findings. Each finding must have: severity (Critical/High/Medium/Low), file (string), line (number), issue (string), fix (string), vulnerableCode (string), suggestedCode (string). Keep vulnerableCode and suggestedCode short - maximum 5 lines each. If no issues found return empty array [].";

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
    (process.env.OG_COMPUTE_PROVIDER ?? process.env.ZEROG_COMPUTE_PROVIDER ?? "").trim();
  let providerAddress = "";
  if (rawProvider) {
    if (!ethers.isAddress(rawProvider)) {
      throw new Error(
        `OG_COMPUTE_PROVIDER must be a valid hex address (ENS is not supported on 0G Galileo).`,
      );
    }
    providerAddress = ethers.getAddress(rawProvider);
  }
  return {
    rpcUrl: process.env.OG_RPC_URL ?? TESTNET_RPC,
    computeApiBaseUrl:
      process.env.OG_COMPUTE_API_BASE_URL ?? COMPUTE_API_BASE_URL_DEFAULT,
    providerAddress,
    model: process.env.OG_COMPUTE_MODEL ?? TESTNET_MODEL,
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
        `OG_COMPUTE_PROVIDER must be a valid hex address (got "${configured}"). ENS is not supported on 0G Galileo.`,
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
  const rawProvider = services.find((s) => !!s.provider)?.provider;
  if (!rawProvider || !ethers.isAddress(rawProvider)) {
    throw new Error(
      "OG_COMPUTE_PROVIDER is required for security scanning (no providers found via listService).",
    );
  }

  return ethers.getAddress(rawProvider);
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

export async function scanFileForVulnerabilities(
  broker: unknown,
  filename: string,
  content: string,
  options?: ScanFileOptions,
): Promise<{ findings: Finding[]; attestationHash: string }> {
  try {
    const { providerAddress, model } = getEnv();
    const systemContent = options?.memoryContext?.trim()
      ? `${SECURITY_SYSTEM_PROMPT}\n\n${options.memoryContext.trim()}`
      : SECURITY_SYSTEM_PROMPT;

    const sdkBroker = broker as {
      inference: {
        listService?: (
          offset?: number,
          limit?: number,
          includeUnacknowledged?: boolean,
        ) => Promise<Array<{ provider?: string }>>;
        getServiceMetadata: (
          provider: string,
        ) => Promise<{ endpoint: string; model?: string }>;
        getRequestHeaders: (
          provider: string,
          payload: string,
        ) => Promise<Record<string, string>>;
        processResponse: (
          provider: string,
          key: string,
          usage?: string,
        ) => Promise<void>;
      };
    };
    const resolvedProviderAddress = await resolveProviderAddress(
      sdkBroker,
      providerAddress,
    );

    const service =
      await sdkBroker.inference.getServiceMetadata(resolvedProviderAddress);
    const payload = {
      model: model || service.model || TESTNET_MODEL,
      messages: [
        { role: "system", content: systemContent },
        {
          role: "user",
          content: `Filename: ${filename}\n\nCode:\n${content}`,
        },
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
      throw new Error(
        `Security scan request failed (${response.status}): ${errorBody}`,
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
          .map((item) => ({
            severity:
              item.severity === "Critical" ||
              item.severity === "High" ||
              item.severity === "Medium" ||
              item.severity === "Low"
                ? item.severity
                : "Low",
            file: item.file || filename,
            line: Number.isFinite(item.line) ? Number(item.line) : 1,
            issue: item.issue || "Unspecified vulnerability",
            fix: item.fix || "Review and harden this code path.",
            vulnerableCode:
              item.vulnerableCode || "/* Vulnerable code snippet unavailable */",
            suggestedCode:
              item.suggestedCode || "/* Suggested code snippet unavailable */",
          }))
      : [];

    return { findings, attestationHash };
  } catch (error) {
    console.error("0G compute file scan failed", { filename, error });
    throw new Error("Scan failed for this file - continuing");
  }
}

export async function inferWithTeeML(
  messages: ComputeChatMessage[],
): Promise<ComputeChatResult> {
  const { providerAddress, model } = getEnv();

  const broker = (await getBroker()) as {
    inference: {
      listService?: (
        offset?: number,
        limit?: number,
        includeUnacknowledged?: boolean,
      ) => Promise<Array<{ provider?: string }>>;
      getServiceMetadata: (provider: string) => Promise<{ endpoint: string; model?: string }>;
      getRequestHeaders: (provider: string, payload: string) => Promise<Record<string, string>>;
      processResponse: (provider: string, key: string, usage?: string) => Promise<void>;
    };
  };
  const resolvedProviderAddress = await resolveProviderAddress(
    broker,
    providerAddress,
  );
  const service = await broker.inference.getServiceMetadata(resolvedProviderAddress);
  const payload = {
    model: model || service.model || TESTNET_MODEL,
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
    model: payload.model ?? TESTNET_MODEL,
    providerAddress: resolvedProviderAddress,
  };
}
