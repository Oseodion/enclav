import { createZGComputeNetworkBroker } from "@0glabs/0g-serving-broker";
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

let brokerPromise: ReturnType<typeof createBroker> | null = null;

function getEnv() {
  return {
    rpcUrl: process.env.OG_RPC_URL ?? TESTNET_RPC,
    providerAddress: process.env.OG_COMPUTE_PROVIDER ?? "",
    model: process.env.OG_COMPUTE_MODEL ?? TESTNET_MODEL,
    privateKey: process.env.DEPLOYER_PRIVATE_KEY ?? "",
  };
}

async function createBroker() {
  const { rpcUrl, privateKey } = getEnv();
  if (!privateKey) {
    throw new Error("DEPLOYER_PRIVATE_KEY is required for 0G Compute calls.");
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  return createZGComputeNetworkBroker(wallet);
}

async function getBroker() {
  if (!brokerPromise) {
    brokerPromise = createBroker();
  }
  return brokerPromise;
}

export async function inferWithTeeML(
  messages: ComputeChatMessage[],
): Promise<ComputeChatResult> {
  const { providerAddress, model } = getEnv();

  if (!providerAddress) {
    throw new Error("OG_COMPUTE_PROVIDER is required for inference.");
  }

  const broker = await getBroker();
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
    model: payload.model,
    providerAddress,
  };
}
