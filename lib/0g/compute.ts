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
const TESTNET_MODEL = "qwen-2.5-7b-instruct";
const SECURITY_SYSTEM_PROMPT =
  "You are a security auditor. Analyze this code for security vulnerabilities. Return ONLY a JSON array of findings. Each finding must have: severity (Critical/High/Medium/Low), file (string), line (number), issue (string), fix (string). If no issues found return empty array [].";

let brokerPromise: Promise<unknown> | null = null;

export type Finding = {
  severity: "Critical" | "High" | "Medium" | "Low";
  file: string;
  line: number;
  issue: string;
  fix: string;
};

function getEnv() {
  return {
    rpcUrl: process.env.OG_RPC_URL ?? TESTNET_RPC,
    providerAddress: process.env.OG_COMPUTE_PROVIDER ?? "",
    model: process.env.OG_COMPUTE_MODEL ?? TESTNET_MODEL,
    privateKey: process.env.DEPLOYER_PRIVATE_KEY ?? "",
  };
}

export async function createBroker(signer: ethers.Signer) {
  try {
    const brokerModule = ServingBroker as unknown as Record<string, unknown>;
    const factory = brokerModule["ZGServingUserBrokerFactory"] as
      | {
          create: (s: ethers.Signer, rpcUrl: string) => Promise<unknown>;
        }
      | undefined;

    if (factory?.create) {
      return await factory.create(signer, TESTNET_RPC);
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
      addLedger?: (amount: bigint) => Promise<unknown>;
    };
  };

  const ledgerApi = broker.ledger;
  if (!ledgerApi?.getLedger || !ledgerApi?.addLedger) {
    return broker;
  }

  const existingLedger = await ledgerApi.getLedger();
  const hasAccount = (() => {
    if (!existingLedger) return false;
    if (typeof existingLedger === "bigint") return existingLedger > BigInt(0);
    if (typeof existingLedger === "number") return existingLedger > 0;
    if (typeof existingLedger === "string") return existingLedger !== "0";
    if (typeof existingLedger === "object") {
      const balance = (existingLedger as { balance?: bigint | number | string })
        .balance;
      if (typeof balance === "bigint") return balance > BigInt(0);
      if (typeof balance === "number") return balance > 0;
      if (typeof balance === "string") return balance !== "0";
      return true;
    }
    return false;
  })();

  if (!hasAccount) {
    await ledgerApi.addLedger(ethers.parseEther("0.01"));
  }

  return broker;
}

async function getBroker() {
  if (!brokerPromise) {
    const { privateKey } = getEnv();
    if (!privateKey) {
      throw new Error("DEPLOYER_PRIVATE_KEY is required for 0G Compute calls.");
    }
    const provider = new ethers.JsonRpcProvider(TESTNET_RPC);
    const wallet = new ethers.Wallet(privateKey, provider);
    brokerPromise = createBroker(wallet);
  }
  return brokerPromise;
}

export async function scanFileForVulnerabilities(
  broker: unknown,
  filename: string,
  content: string,
): Promise<{ findings: Finding[]; attestationHash: string }> {
  const { providerAddress, model } = getEnv();
  if (!providerAddress) {
    throw new Error("OG_COMPUTE_PROVIDER is required for security scanning.");
  }

  const sdkBroker = broker as {
    inference: {
      getServiceMetadata: (provider: string) => Promise<{ endpoint: string; model?: string }>;
      getRequestHeaders: (provider: string, payload: string) => Promise<Record<string, string>>;
      processResponse: (provider: string, key: string, usage?: string) => Promise<void>;
    };
  };

  const payload = {
    model: model || TESTNET_MODEL,
    messages: [
      { role: "system", content: SECURITY_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Filename: ${filename}\n\nCode:\n${content}`,
      },
    ],
  };

  const service = await sdkBroker.inference.getServiceMetadata(providerAddress);
  const billingHeaders = await sdkBroker.inference.getRequestHeaders(
    providerAddress,
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
    providerAddress,
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
        }))
    : [];

  return { findings, attestationHash };
}

export async function inferWithTeeML(
  messages: ComputeChatMessage[],
): Promise<ComputeChatResult> {
  const { providerAddress, model } = getEnv();

  if (!providerAddress) {
    throw new Error("OG_COMPUTE_PROVIDER is required for inference.");
  }

  const broker = (await getBroker()) as {
    inference: {
      getServiceMetadata: (provider: string) => Promise<{ endpoint: string; model?: string }>;
      getRequestHeaders: (provider: string, payload: string) => Promise<Record<string, string>>;
      processResponse: (provider: string, key: string, usage?: string) => Promise<void>;
    };
  };
  const service = await broker.inference.getServiceMetadata(providerAddress);
  const payload = {
    model: model || service.model,
    messages,
  };

  const billingHeaders = await broker.inference.getRequestHeaders(
    providerAddress,
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
    providerAddress,
    attestationHash,
    responseJson.usage ? JSON.stringify(responseJson.usage) : undefined,
  );

  return {
    content,
    attestationHash,
    model: payload.model ?? TESTNET_MODEL,
    providerAddress,
  };
}
