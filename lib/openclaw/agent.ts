import { ethers } from "ethers";
import {
  initializeComputeAccount,
  scanChunkForVulnerabilities,
  type Finding,
} from "@/lib/0g/compute";
import { resolveOgRpcUrl } from "@/lib/og-env";

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
  /** Files per single inference request (default 3). */
  chunkSize?: number;
};

/** Same file + line + issue text → keep first only (model sometimes repeats). */
export function deduplicateFindingsByFileLineIssue<T extends { file: string; line: number; issue: string }>(
  findings: T[],
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const f of findings) {
    const title = f.issue.replace(/\s+/g, " ").trim();
    const key = `${f.file}|${f.line}|${title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

function getRuntimeConfig() {
  return {
    privateKey: process.env.DEPLOYER_PRIVATE_KEY ?? "",
    rpcUrl: resolveOgRpcUrl(),
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
 * Batches files into chunks (default 3 per TeeML call) for fewer API round-trips.
 */
export async function runSecurityScan(
  repoUrl: string,
  fileContents: OpenClawFileInput[],
  options?: RunSecurityScanOptions,
): Promise<OpenClawScanResult[]> {
  const broker = options?.broker ?? (await getBrokerFromEnv());
  const memoryContext = options?.memoryContext?.trim();
  const chunkSize =
    options?.chunkSize !== undefined && options.chunkSize > 0 ? options.chunkSize : 3;
  const results: OpenClawScanResult[] = [];

  for (let i = 0; i < fileContents.length; i += chunkSize) {
    const chunk = fileContents.slice(i, i + chunkSize);
    const scan = await scanChunkForVulnerabilities(broker, chunk, { memoryContext });

    const byFile = new Map<string, Finding[]>();
    for (const f of chunk) {
      byFile.set(f.path, []);
    }
    for (const finding of scan.findings) {
      const list = byFile.get(finding.file);
      if (list) list.push(finding);
    }

    for (const file of chunk) {
      const findings = deduplicateFindingsByFileLineIssue(byFile.get(file.path) ?? []);
      results.push({
        file: file.path,
        findings,
        attestationHash: scan.attestationHash,
      });
    }
  }

  console.log("[openclaw] runSecurityScan completed", {
    repoUrl,
    files: fileContents.length,
    inferenceCalls: Math.ceil(fileContents.length / chunkSize),
    findings: results.reduce((acc, item) => acc + item.findings.length, 0),
  });

  return results;
}
