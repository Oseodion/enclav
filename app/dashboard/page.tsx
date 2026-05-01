"use client";

import Link from "next/link";
import {
  Activity,
  CheckCircle2,
  Code2,
  Database,
  ExternalLink,
  Grid2x2,
  Info,
  Link2,
  ScanSearch,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Timer,
  TriangleAlert,
  User,
} from "lucide-react";
import { useMemo, useState } from "react";
import { WalletConnect } from "@/components/ui/WalletConnect";
import { useWallet } from "@/lib/wallet";

type FindingSeverity = "Critical" | "High" | "Medium" | "Low";

type Finding = {
  severity: FindingSeverity;
  file: string;
  line: number;
  description: string;
  fix: string;
  attestationHash: string;
};

const panelClass =
  "relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-[0_4px_24px_rgba(0,0,0,0.35)] backdrop-blur-[20px] before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent before:content-['']";

export default function DashboardPage() {
  const { address, isConnected } = useWallet();
  const [repoUrl, setRepoUrl] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [scanCompleted, setScanCompleted] = useState(false);
  const [currentFile, setCurrentFile] = useState("Waiting for repository URL input...");
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanLogs, setScanLogs] = useState<string[]>([
    "Waiting for repository URL input...",
  ]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [scannedFiles, setScannedFiles] = useState(0);
  const [totalFiles, setTotalFiles] = useState(0);

  const findingsSummary = useMemo(
    () =>
      findings.reduce(
        (acc, finding) => {
          acc[finding.severity] += 1;
          return acc;
        },
        {
          Critical: 0,
          High: 0,
          Medium: 0,
          Low: 0,
        } as Record<FindingSeverity, number>,
      ),
    [findings],
  );

  const progressPercent =
    totalFiles > 0 ? Math.round((scannedFiles / totalFiles) * 100) : 0;

  const startScan = async () => {
    const trimmedRepoUrl = repoUrl.trim();
    if (!trimmedRepoUrl) return;
    if (!isConnected || !address) {
      setScanError("Connect your wallet before starting a scan.");
      return;
    }

    setScanError(null);
    setFindings([]);
    setScannedFiles(0);
    setTotalFiles(0);
    setScanCompleted(false);
    setCurrentFile("Initializing scanner...");
    setScanLogs(["Repository queued. Starting autonomous scan..."]);
    setIsScanning(true);

    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoUrl: trimmedRepoUrl,
          walletAddress: address,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(payload.error ?? "Scan request failed.");
      }

      const totalFromHeader = Number(response.headers.get("X-Total-Files") ?? "0");
      if (Number.isFinite(totalFromHeader) && totalFromHeader > 0) {
        setTotalFiles(totalFromHeader);
      }

      if (!response.body) {
        throw new Error("Missing stream body from scan endpoint.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as
            | { type: "file"; filename: string }
            | {
                type: "finding";
                finding: {
                  severity: FindingSeverity;
                  file: string;
                  line: number;
                  issue: string;
                  fix: string;
                };
                attestationHash: string;
              }
            | { type: "complete"; totalFiles: number; totalFindings: number }
            | { type: "error"; message: string };

          if (event.type === "file") {
            setCurrentFile(event.filename);
            setScannedFiles((prev) => prev + 1);
            setScanLogs((prev) => [
              `Scanning ${event.filename}...`,
              ...prev.slice(0, 6),
            ]);
          }

          if (event.type === "finding") {
            setFindings((prev) => [
              ...prev,
              {
                severity: event.finding.severity,
                file: event.finding.file,
                line: event.finding.line,
                description: event.finding.issue,
                fix: event.finding.fix,
                attestationHash: event.attestationHash,
              },
            ]);
          }

          if (event.type === "complete") {
            setTotalFiles(event.totalFiles);
            setCurrentFile("Completed");
            setScanCompleted(true);
            setScanLogs((prev) => [
              `Scan complete. ${event.totalFindings} findings detected.`,
              ...prev.slice(0, 6),
            ]);
          }

          if (event.type === "error") {
            setScanError(event.message);
          }
        }
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unexpected scan error.";
      setScanError(message);
      setScanLogs((prev) => [`Scan failed: ${message}`, ...prev.slice(0, 6)]);
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <main className="relative flex h-screen flex-col overflow-hidden bg-black font-geist text-[#F0EEF8]">
      <AmbientGlow />
      <header className="relative z-10 flex h-[56px] items-center border-b border-white/10 bg-black/80 px-3 backdrop-blur-[24px] overflow-visible sm:px-5">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <div className="relative flex h-[34px] w-[34px] items-center justify-center">
            <div
              className="absolute h-[30px] w-[30px] rotate-45 rounded-[7px] border border-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_4px_16px_rgba(124,58,237,0.35)]"
              style={{ background: "rgba(139,92,246,0.2)" }}
            />
            <div
              className="absolute h-[15px] w-[15px] rotate-45 rounded-[3px] border border-white/25"
              style={{ background: "rgba(139,92,246,0.7)" }}
            />
            <div className="absolute z-[1] h-[5px] w-[5px] rounded-full bg-white shadow-[0_0_8px_white]" />
          </div>
          <span className="text-sm font-bold tracking-tight text-[#F0EEF8]">
            Encl<span className="text-purple-bright">av</span>
          </span>
          <span className="hidden rounded border border-[rgba(167,139,250,0.25)] bg-[rgba(139,92,246,0.1)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-[#A78BFA] sm:inline-flex">
            Beta
          </span>
        </Link>

        <nav className="hidden h-full flex-1 items-center justify-center md:flex">
          {["Scanner", "Findings", "History", "Certificate", "Settings"].map((item, i) => (
            <button
              key={item}
              type="button"
              className={`h-full border-b-2 px-4 font-mono text-[11px] uppercase tracking-[0.08em] ${
                i === 0
                  ? "border-[#7C3AED] bg-[rgba(124,58,237,0.12)] text-[#F0EEF8]"
                  : "border-transparent text-[#9B99B0] hover:text-[#F0EEF8]"
              }`}
            >
              {item}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <div className="hidden items-center gap-1.5 rounded-full border border-[rgba(16,185,129,0.2)] bg-[rgba(16,185,129,0.08)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.06em] text-[#6EE7B7] sm:flex">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#6EE7B7]" />
            TEE Active
          </div>
          <WalletConnect />
        </div>
      </header>

      <div className="relative z-[1] flex min-h-0 flex-1">
        <aside className={`${panelClass} m-3 flex w-[56px] shrink-0 flex-col items-center gap-1 bg-[rgba(255,255,255,0.02)] py-3`}>
          <SidebarIcon icon={Grid2x2} active />
          <SidebarIcon icon={Code2} />
          <SidebarIcon icon={Database} />
          <div className="my-1 h-px w-6 bg-[#2E2C3E]" />
          <SidebarIcon icon={User} />
          <SidebarIcon icon={Settings2} />
        </aside>

        <section className="flex min-w-0 flex-1 flex-col p-3 pl-0">
          <div className={`${panelClass} mb-3 p-3`}>
            <div className="flex flex-col gap-2 md:flex-row">
              <div className="relative flex-1">
                <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9B99B0]" />
                <input
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder="Paste GitHub repo URL to begin scan..."
                  className="w-full rounded-full border border-white/10 bg-[rgba(255,255,255,0.05)] py-2 pl-10 pr-4 text-sm text-[#F0EEF8] outline-none ring-purple/0 transition placeholder:text-[#9B99B0] focus:border-[#A78BFA]/50 focus:ring-2 focus:ring-[#7C3AED]/40"
                />
              </div>
              <button
                type="button"
                onClick={startScan}
                className="rounded-full border border-[rgba(167,139,250,0.5)] bg-[rgba(124,58,237,0.3)] px-5 py-2 font-mono text-xs uppercase tracking-[0.06em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_0_20px_rgba(124,58,237,0.2)] backdrop-blur-[10px] transition hover:bg-[rgba(124,58,237,0.45)]"
              >
                Start Scan
              </button>
            </div>
            <p className="mt-2 flex items-center justify-center gap-1.5 font-mono text-[11px] text-[var(--text-3)]">
              <Info className="h-3 w-3" />
              Supports public GitHub repositories only · Results may vary by codebase ·
              AI-generated findings — always verify with your security team
            </p>
            {scanError ? (
              <p className="mt-2 font-mono text-[11px] text-[#EF4444]">{scanError}</p>
            ) : null}
          </div>

          <div
            className={`grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[1.2fr_0.9fr_280px] ${
              isScanning
                ? "rounded-2xl border border-transparent bg-[linear-gradient(rgba(0,0,0,0.75),rgba(0,0,0,0.75))_padding-box,linear-gradient(120deg,#A78BFA,#7C3AED,#EC4899)_border-box] p-[1px] animate-pulse"
                : ""
            }`}
          >
            <LiveScanFeed findings={findings} isScanning={isScanning} />
            <ScanStatus
              currentFile={currentFile}
              scannedFiles={scannedFiles}
              totalFiles={totalFiles}
              progressPercent={progressPercent}
              logs={scanLogs}
              isScanning={isScanning}
              scanCompleted={scanCompleted}
            />
            <RightPanelSummary
              scannedFiles={scannedFiles}
              totalFiles={totalFiles}
              progressPercent={progressPercent}
              findingsSummary={findingsSummary}
            />
          </div>
        </section>
      </div>

      <footer className={`${panelClass} relative z-[5] m-3 mt-0 flex h-[30px] items-center gap-4 overflow-x-auto rounded-xl bg-[rgba(255,255,255,0.02)] px-4 font-mono text-[10px] text-[#9B99B0]`}>
        <StatusItem iconColor="bg-[#3B82F6]" label="0G Chain" value="Galileo" />
        <StatusItem iconColor="bg-[#7C3AED]" label="Storage" value={`${scannedFiles}/${totalFiles}`} />
        <StatusItem iconColor="bg-[#059669]" label="Inference" value={isScanning ? "Running" : "Idle"} />
        <StatusItem iconColor="bg-[#EF4444]" label="Critical" value={`${findingsSummary.Critical}`} />
      </footer>
    </main>
  );
}

function SidebarIcon({
  icon: Icon,
  active = false,
}: {
  icon: typeof Grid2x2;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      className={`flex h-[36px] w-[36px] items-center justify-center rounded-lg ${
        active ? "bg-[rgba(124,58,237,0.16)]" : "hover:bg-white/5"
      }`}
    >
      <Icon className={active ? "h-4 w-4 text-[#A78BFA]" : "h-4 w-4 text-[#2E2C3E]"} strokeWidth={1.6} />
    </button>
  );
}

function LiveScanFeed({
  findings,
  isScanning,
}: {
  findings: Finding[];
  isScanning: boolean;
}) {
  return (
    <section className="relative min-h-0 overflow-hidden rounded-2xl border border-white/10 bg-[rgba(0,0,0,0.4)] shadow-[0_10px_30px_rgba(14,10,30,0.45)] backdrop-blur-[20px] before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent before:content-['']">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <ScanSearch className="h-4 w-4 text-[#7C3AED]" />
          <h3 className="font-semibold text-[#E9E4FF]">Live Scan Feed</h3>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#9B99B0]">
          {isScanning ? "Scanning" : "Ready"}
        </span>
      </div>

      <div className="h-full min-h-0 flex-1 space-y-3 overflow-y-auto p-4 pb-[60px] [scrollbar-width:thin] [scrollbar-color:rgba(139,92,246,0.4)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[rgba(139,92,246,0.4)] [&::-webkit-scrollbar-track]:bg-transparent">
        {findings.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-[rgba(255,255,255,0.04)] p-4 text-sm text-[#9B99B0]">
            No findings yet. Start a scan to stream autonomous security results.
          </div>
        ) : (
          findings.map((finding, index) => (
            <FindingCard key={`${finding.file}-${finding.line}-${index}`} finding={finding} />
          ))
        )}
      </div>
    </section>
  );
}

function FindingCard({ finding }: { finding: Finding }) {
  const [expanded, setExpanded] = useState(false);
  const badgeStyles: Record<FindingSeverity, string> = {
    Critical: "bg-[#FCEBEB] text-[#A32D2D]",
    High: "bg-[#FAEEDA] text-[#854F0B]",
    Medium: "bg-[#E6F1FB] text-[#185FA5]",
    Low: "bg-[#E1F5EE] text-[#0F6E56]",
  };
  const learnMoreHref =
    finding.severity === "Critical" || finding.severity === "High"
      ? "https://owasp.org/www-project-top-ten/"
      : "https://owasp.org/www-community/vulnerabilities/";

  return (
    <article className="rounded-lg border border-white/10 bg-[rgba(255,255,255,0.04)] px-5 py-4 shadow-[0_8px_20px_rgba(12,10,24,0.35)]">
      <div className="grid grid-cols-[72px_1fr_auto] gap-3">
        <div>
          <span className={`inline-flex rounded-[4px] px-2 py-[3px] font-mono text-[10px] uppercase tracking-[0.06em] ${badgeStyles[finding.severity]}`}>
            {finding.severity}
          </span>
        </div>

        <div className="min-w-0">
          <p className="mb-1 text-[14px] font-medium text-[#F4F2FF]">{finding.description}</p>
        </div>

        <div className="flex flex-col items-end gap-1.5 text-right font-mono text-[11px] text-[#9B99B0]">
          <span>
            {finding.file}:{finding.line}
          </span>
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="rounded-[6px] border border-[rgba(167,139,250,0.5)] bg-[rgba(124,58,237,0.3)] px-2 py-[3px] text-[10px] text-[#E9E4FF] shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_0_20px_rgba(124,58,237,0.2)] backdrop-blur-[10px] transition hover:bg-[rgba(124,58,237,0.45)] hover:text-white"
          >
            View Fix
          </button>
        </div>
      </div>

      <div
        className={`overflow-hidden transition-[max-height] duration-300 ease-in-out ${
          expanded ? "max-h-[320px] pt-4" : "max-h-0"
        }`}
      >
        <div className="rounded-md border border-white/10 bg-[rgba(255,255,255,0.03)] p-3">
          <p className="mb-2 text-[12px] leading-[1.6] text-[#9B99B0]">
            <span className="font-semibold text-[#F0EEF8]">Fix guidance:</span>{" "}
            {finding.fix}
          </p>
          <a
            href={learnMoreHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-[#A78BFA] transition hover:underline"
          >
            Learn more
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </article>
  );
}

function ScanStatus({
  currentFile,
  scannedFiles,
  totalFiles,
  progressPercent,
  logs,
  isScanning,
  scanCompleted,
}: {
  currentFile: string;
  scannedFiles: number;
  totalFiles: number;
  progressPercent: number;
  logs: string[];
  isScanning: boolean;
  scanCompleted: boolean;
}) {
  return (
    <section className={`${panelClass} min-h-0`}>
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h3 className="font-semibold text-[#F0EEF8]">Scan Status</h3>
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#9B99B0]">
          {isScanning ? "Running" : scanCompleted ? "Complete" : "Waiting"}
        </span>
      </div>
      <div className="space-y-4 p-4">
        <div className="rounded-xl border border-white/10 bg-[rgba(255,255,255,0.04)] p-3">
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[#9B99B0]">
            Current file
          </p>
          <p className="font-mono text-xs text-[#F0EEF8]">{currentFile}</p>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between font-mono text-[10px] text-[#9B99B0]">
            <span>Progress</span>
            <span>
              {scannedFiles}/{totalFiles} ({progressPercent}%)
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[rgba(255,255,255,0.08)]">
            <div
              className="h-full rounded-full bg-[rgba(124,58,237,0.6)] transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-white/10 bg-[rgba(255,255,255,0.04)] p-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#9B99B0]">
            Live events
          </p>
          {logs.map((log, index) => (
            <div key={`${log}-${index}`} className="flex items-start gap-2 text-xs text-[#9B99B0]">
              <Timer className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#A78BFA]" />
              {log}
            </div>
          ))}
        </div>

        {scanCompleted ? (
          <div className="rounded-xl border border-[rgba(16,185,129,0.2)] bg-[rgba(16,185,129,0.08)] p-3 text-xs text-[#6EE7B7]">
            <div className="mb-1 flex items-center gap-1.5 font-semibold">
              <CheckCircle2 className="h-4 w-4" />
              Scan complete
            </div>
            Findings report finalized and ready for INFT certificate minting.
          </div>
        ) : null}
      </div>
    </section>
  );
}

function RightPanelSummary({
  scannedFiles,
  totalFiles,
  progressPercent,
  findingsSummary,
}: {
  scannedFiles: number;
  totalFiles: number;
  progressPercent: number;
  findingsSummary: Record<FindingSeverity, number>;
}) {
  return (
    <aside className={`${panelClass} hidden min-h-0 flex-col xl:flex`}>
      <div className="border-b border-white/10 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-[#F0EEF8]">Agent Identity</h3>
          <Link href="/agent-id" className="rounded border border-[rgba(167,139,250,0.25)] bg-[rgba(139,92,246,0.1)] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-[#A78BFA]">
            View INFT
          </Link>
        </div>
        <div className="rounded-xl border border-white/10 bg-[rgba(255,255,255,0.04)] p-3">
          <ShieldCheck className="mb-2 h-5 w-5 text-[#A78BFA]" />
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#9B99B0]">
            Agent ID - ERC-7857
          </p>
          <p className="font-mono text-xs text-[#F0EEF8]">—</p>
        </div>
      </div>

      <div className="border-b border-white/10 p-4">
        <h4 className="mb-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[#9B99B0]">
          Scan Progress
        </h4>
        <p className="mb-2 font-mono text-xs text-[#9B99B0]">
          {scannedFiles}/{totalFiles} files scanned
        </p>
        <div className="h-2 overflow-hidden rounded-full bg-[rgba(255,255,255,0.08)]">
          <div
            className="h-full rounded-full bg-[rgba(124,58,237,0.6)] transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      <div className="flex-1 p-4">
        <h4 className="mb-3 font-mono text-[10px] uppercase tracking-[0.08em] text-[#9B99B0]">
          Findings Summary
        </h4>
        <SummaryRow label="Critical" count={findingsSummary.Critical} color="bg-[#EF4444]" icon={Siren} />
        <SummaryRow label="High" count={findingsSummary.High} color="bg-[#F97316]" icon={ShieldAlert} />
        <SummaryRow label="Medium" count={findingsSummary.Medium} color="bg-[#EAB308]" icon={TriangleAlert} />
        <SummaryRow label="Low" count={findingsSummary.Low} color="bg-[#3B82F6]" icon={Activity} />
      </div>
    </aside>
  );
}

function SummaryRow({
  label,
  count,
  color,
  icon: Icon,
}: {
  label: string;
  count: number;
  color: string;
  icon: typeof Activity;
}) {
  return (
    <div className="mb-2.5 flex items-center justify-between rounded-lg border border-white/10 bg-[rgba(255,255,255,0.04)] px-2.5 py-2 last:mb-0">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${color}`} />
        <Icon className="h-3.5 w-3.5 text-[#A78BFA]" />
        <span className="font-mono text-[11px] text-[#9B99B0]">{label}</span>
      </div>
      <span className="font-mono text-xs text-[#F0EEF8]">{count}</span>
    </div>
  );
}

function AmbientGlow() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className="absolute -left-[100px] -top-[150px] h-[500px] w-[500px] animate-drift rounded-full bg-[radial-gradient(circle,rgba(124,58,237,0.15),transparent_65%)]" />
      <div className="absolute -bottom-[80px] -right-[60px] h-[350px] w-[350px] animate-drift-slow rounded-full bg-[radial-gradient(circle,rgba(236,72,153,0.12),transparent_65%)]" />
    </div>
  );
}

function StatusItem({
  iconColor,
  label,
  value,
}: {
  iconColor: string;
  label: string;
  value: string;
}) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5">
      <span className={`h-1.5 w-1.5 rounded-full ${iconColor}`} />
      {label}: {value}
    </span>
  );
}
