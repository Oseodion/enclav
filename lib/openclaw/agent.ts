import { ethers } from "ethers";
import {
  initializeComputeAccount,
  scanFileForVulnerabilities,
  type Finding,
} from "@/lib/0g/compute";

export type OpenClawFileInput = {
  path: string;
  content: string;
};

export type OpenClawScanResult = {
  file: string;
  findings: Finding[];
  attestationHash: string;
};

type RunSecurityScanOptions = {
  broker?: unknown;
  /** TeeML long-context memory (previous scan findings from 0G Storage). */
  memoryContext?: string;
};

function getRuntimeConfig() {
  return {
    privateKey: process.env.DEPLOYER_PRIVATE_KEY ?? "",
    rpcUrl: process.env.OG_RPC_URL ?? "https://evmrpc-testnet.0g.ai",
  };
}

async function getBrokerFromEnv() {
  const { privateKey, rpcUrl } = getRuntimeConfig();
  if (!privateKey) {
    throw new Error("DEPLOYER_PRIVATE_KEY is required for OpenClaw security scans.");
  }
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(privateKey, provider);
  return initializeComputeAccount(signer);
}

/**
 * OpenClaw security orchestration entrypoint.
 * Coordinates file-by-file security scanning through 0G Compute.
 */
export async function runSecurityScan(
  repoUrl: string,
  fileContents: OpenClawFileInput[],
  options?: RunSecurityScanOptions,
): Promise<OpenClawScanResult[]> {
  const broker = options?.broker ?? (await getBrokerFromEnv());
  const memoryContext = options?.memoryContext?.trim();
  const results: OpenClawScanResult[] = [];

  for (const file of fileContents) {
    const scan = await scanFileForVulnerabilities(broker, file.path, file.content, {
      memoryContext,
    });
    results.push({
      file: file.path,
      findings: scan.findings,
      attestationHash: scan.attestationHash,
    });
  }

  console.log("[openclaw] runSecurityScan completed", {
    repoUrl,
    files: fileContents.length,
    findings: results.reduce((acc, item) => acc + item.findings.length, 0),
  });

  return results;
}
