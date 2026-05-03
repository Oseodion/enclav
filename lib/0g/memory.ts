import { keccak256, toUtf8Bytes } from "ethers";

export const ENCLAV_MEMORY_VERSION = 1 as const;

export type SlimMemoryFinding = {
  severity: "Critical" | "High" | "Medium" | "Low";
  file: string;
  line: number;
  issue: string;
  fix: string;
};

export type EnclavRepoMemoryV1 = {
  version: typeof ENCLAV_MEMORY_VERSION;
  key: string;
  repoUrl: string;
  repoUrlHash: string;
  scanDate: string;
  totalFindings: number;
  aggregatedFindings: SlimMemoryFinding[];
  /** 0G Storage root hash of this memory document (set after upload). */
  memoryRootHash?: string;
};

export function normalizeRepoUrlForMemory(repoUrl: string): string {
  return repoUrl.trim().replace(/\/$/, "");
}

export function hashRepoUrl(repoUrl: string): string {
  const n = normalizeRepoUrlForMemory(repoUrl);
  return keccak256(toUtf8Bytes(n));
}

export function enclavMemoryObjectKey(repoUrl: string): string {
  return `enclav-memory-${hashRepoUrl(repoUrl)}`;
}

export function buildLongContextMemoryPrompt(findings: SlimMemoryFinding[]): string {
  const trimmed = findings.slice(0, 80);
  const payload = JSON.stringify(trimmed, null, 2);
  return `Previous scans of this repository found these issues: ${payload}\n\nCheck if they have been fixed and identify any new issues.`;
}

export function toSlimFindings(
  items: Array<{
    severity: SlimMemoryFinding["severity"];
    file: string;
    line: number;
    issue: string;
    fix: string;
  }>,
): SlimMemoryFinding[] {
  return items.map((f) => ({
    severity: f.severity,
    file: f.file,
    line: f.line,
    issue: f.issue,
    fix: f.fix,
  }));
}

export function parseRepoMemoryJson(raw: string): EnclavRepoMemoryV1 | null {
  try {
    const parsed = JSON.parse(raw) as EnclavRepoMemoryV1;
    if (parsed.version !== 1 || !Array.isArray(parsed.aggregatedFindings)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
