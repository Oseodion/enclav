"use client";

import Link from "next/link";
import {
  Activity,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Database,
  ExternalLink,
  HelpCircle,
  Info,
  Link2,
  Menu,
  ScanSearch,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Sparkles,
  Timer,
  TriangleAlert,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { WalletConnect } from "@/components/ui/WalletConnect";
import { INFT_CONTRACT_ADDRESS, mintFromWallet, type MintScanData } from "@/lib/0g/inft";
import { useWallet } from "@/lib/wallet";
import { useChainId, useDisconnect, useWalletClient } from "wagmi";

type FindingSeverity = "Critical" | "High" | "Medium" | "Low";

type Finding = {
  severity: FindingSeverity;
  file: string;
  line: number;
  description: string;
  fix: string;
  attestationHash: string;
};
type ScanNotice = {
  id: string;
  message: string;
};
type ActiveTab = "scanner" | "findings" | "history" | "settings";
type SeverityFilter = "All" | FindingSeverity;
type ScanHistoryEntry = {
  id: string;
  repoUrl: string;
  scanDate: string;
  filesScanned: number;
  totalFindings: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  reportHash: string;
  findings: Finding[];
  tokenId?: string | null;
  txHash?: string | null;
  explorerUrl?: string | null;
};

const panelClass =
  "relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-[0_4px_24px_rgba(0,0,0,0.35)] backdrop-blur-[20px] before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent before:content-['']";
const CHAINSCAN_GALILEO = "https://chainscan-galileo.0g.ai";
const SCAN_HISTORY_KEY = "enclav-scan-history-v1";
const getWalletHistoryKey = (walletAddress?: string) =>
  walletAddress ? `${SCAN_HISTORY_KEY}:${walletAddress.toLowerCase()}` : null;

export default function DashboardPage() {
  const { address, isConnected } = useWallet();
  const chainId = useChainId();
  const { data: walletClient } = useWalletClient();
  const { disconnect } = useDisconnect();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("scanner");
  type SidebarPanel = "none" | "summary" | "recent" | "storage";
  const [sidebarPanel, setSidebarPanel] = useState<SidebarPanel>("none");
  const [contractCopied, setContractCopied] = useState(false);
  const [repoUrl, setRepoUrl] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [scanCompleted, setScanCompleted] = useState(false);
  const [currentFile, setCurrentFile] = useState("Waiting for repository URL input...");
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanLogs, setScanLogs] = useState<string[]>([
    "Waiting for repository URL input...",
  ]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const findingsRef = useRef<Finding[]>([]);
  useEffect(() => {
    findingsRef.current = findings;
  }, [findings]);
  const [scanNotices, setScanNotices] = useState<ScanNotice[]>([]);
  const [latestScanData, setLatestScanData] = useState<MintScanData | null>(null);
  const [scanHistory, setScanHistory] = useState<ScanHistoryEntry[]>([]);
  const [scannedFiles, setScannedFiles] = useState(0);
  const [totalFiles, setTotalFiles] = useState(0);
  const [mintedTokenId, setMintedTokenId] = useState<string | null>(null);
  const [hasMinted, setHasMinted] = useState(false);
  const [certificateExplorerUrl, setCertificateExplorerUrl] = useState<string | null>(null);
  const [mintStatus, setMintStatus] = useState<
    "idle" | "awaiting_wallet" | "minting" | "success" | "cancelled" | "error"
  >("idle");
  const [mintStatusMessage, setMintStatusMessage] = useState<string | null>(null);
  const scanLocked = isScanning;

  useEffect(() => {
    if (!isConnected || !address) {
      setScanHistory([]);
      return;
    }
    const walletHistoryKey = getWalletHistoryKey(address);
    if (!walletHistoryKey) return;

    try {
      const walletRaw = localStorage.getItem(walletHistoryKey);
      if (walletRaw) {
        const parsed = JSON.parse(walletRaw) as ScanHistoryEntry[];
        setScanHistory(Array.isArray(parsed) ? parsed.slice(0, 5) : []);
        return;
      }

      // One-time migration from legacy global key.
      const legacyRaw = localStorage.getItem(SCAN_HISTORY_KEY);
      if (legacyRaw) {
        const parsedLegacy = JSON.parse(legacyRaw) as ScanHistoryEntry[];
        const migrated = Array.isArray(parsedLegacy) ? parsedLegacy.slice(0, 5) : [];
        localStorage.setItem(walletHistoryKey, JSON.stringify(migrated));
        setScanHistory(migrated);
        return;
      }

      setScanHistory([]);
    } catch {
      setScanHistory([]);
    }
  }, [address, isConnected]);

  useEffect(() => {
    if (mintStatus !== "minting") return;
    const timeoutId = setTimeout(() => {
      setMintStatus((current) => {
        if (current !== "minting") return current;
        setMintStatusMessage("Certificate minted - check explorer for details");
        setHasMinted(true);
        return "success";
      });
    }, 35_000);

    return () => clearTimeout(timeoutId);
  }, [mintStatus]);

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

  const lastScanSeverityCounts = useMemo(() => {
    if (findings.length > 0) return findingsSummary;
    const h = scanHistory[0];
    if (h) {
      return {
        Critical: h.criticalCount,
        High: h.highCount,
        Medium: h.mediumCount,
        Low: h.lowCount,
      } as Record<FindingSeverity, number>;
    }
    return {
      Critical: 0,
      High: 0,
      Medium: 0,
      Low: 0,
    } as Record<FindingSeverity, number>;
  }, [findings, findingsSummary, scanHistory]);

  const lastScanMeta = useMemo(() => {
    if (latestScanData) {
      return { repoUrl: latestScanData.repoUrl, scanDate: latestScanData.scanDate };
    }
    const h = scanHistory[0];
    if (h) return { repoUrl: h.repoUrl, scanDate: h.scanDate };
    return null;
  }, [latestScanData, scanHistory]);

  const recentRepoUrls = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const entry of scanHistory) {
      const u = entry.repoUrl;
      if (!seen.has(u)) {
        seen.add(u);
        out.push(u);
        if (out.length >= 3) break;
      }
    }
    return out;
  }, [scanHistory]);

  const progressPercent =
    totalFiles > 0 ? Math.round((scannedFiles / totalFiles) * 100) : 0;
  const mostRecentFindings = isConnected
    ? findings.length > 0
      ? findings
      : (scanHistory[0]?.findings ?? [])
    : [];

  const persistScanHistory = (entry: ScanHistoryEntry) => {
    const walletHistoryKey = getWalletHistoryKey(address);
    if (!walletHistoryKey) return;
    setScanHistory((prev) => {
      const next = [entry, ...prev].slice(0, 5);
      localStorage.setItem(walletHistoryKey, JSON.stringify(next));
      return next;
    });
  };

  const startScan = async () => {
    if (isScanning) return;
    const trimmedRepoUrl = repoUrl.trim();
    if (!trimmedRepoUrl) return;
    if (!isConnected || !address) {
      setScanError("Connect your wallet before starting a scan.");
      return;
    }

    setScanError(null);
    setActiveTab("scanner");
    setFindings([]);
    setScanNotices([]);
    setLatestScanData(null);
    setScannedFiles(0);
    setTotalFiles(0);
    setScanCompleted(false);
    setMintedTokenId(null);
    setHasMinted(false);
    setCertificateExplorerUrl(null);
    setMintStatus("idle");
    setMintStatusMessage(null);
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
      const streamedFindings: Finding[] = [];

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
            | {
                type: "complete";
                totalFiles: number;
                totalFindings: number;
                scanData: MintScanData;
              }
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
            const normalizedFinding: Finding = {
              severity: event.finding.severity,
              file: event.finding.file,
              line: event.finding.line,
              description: event.finding.issue,
              fix: event.finding.fix,
              attestationHash: event.attestationHash,
            };
            streamedFindings.push(normalizedFinding);
            setFindings((prev) => [...prev, normalizedFinding]);
          }

          if (event.type === "complete") {
            setTotalFiles(event.totalFiles);
            setCurrentFile("Completed");
            setScanCompleted(true);
            setLatestScanData(event.scanData);
            setScanLogs((prev) => [
              `Scan complete. ${event.totalFindings} findings detected.`,
              ...prev.slice(0, 6),
            ]);
          }

          if (event.type === "error") {
            const lowerMessage = event.message.toLowerCase();
            const isTimeoutNotice =
              event.message.includes(":") && lowerMessage.includes("timed out");
            const isRateLimitNotice =
              event.message.includes(":") &&
              (lowerMessage.includes("rate") ||
                event.message.includes("Scan failed for this file"));
            if (isTimeoutNotice || isRateLimitNotice) {
              const [filePath] = event.message.split(":");
              setScanNotices((prev) => [
                {
                  id: `${Date.now()}-${filePath}`,
                  message: isTimeoutNotice
                    ? `${filePath} - upload timed out, scan continuing...`
                    : `⚠ ${filePath} - rate limited, skipped`,
                },
                ...prev.slice(0, 8),
              ]);
            } else {
              setScanError(event.message);
            }
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

  const handleMintCertificate = async () => {
    console.log("[mint] click received", {
      hasLatestScanData: Boolean(latestScanData),
      hasWalletClient: Boolean(walletClient),
      isConnected,
      address,
      mintStatus,
    });
    if (!latestScanData) {
      console.log("[mint] aborted: missing latestScanData");
      setMintStatus("error");
      setMintStatusMessage("Scan data unavailable. Re-run scan before minting.");
      return;
    }
    if (!(globalThis as { ethereum?: unknown }).ethereum) {
      console.log("[mint] aborted: no injected wallet provider");
      setMintStatus("error");
      setMintStatusMessage("No wallet provider found. Open with MetaMask or a compatible wallet.");
      return;
    }
    try {
      setMintStatus("awaiting_wallet");
      setMintStatusMessage("Waiting for wallet confirmation...");
      console.log("[mint] calling mintFromWallet");
      const mintOptions =
        typeof chainId === "number" && Number.isFinite(chainId)
          ? { wagmiChainId: chainId }
          : undefined;
      const result = await mintFromWallet(
        walletClient,
        latestScanData,
        (txHash) => {
          console.log("[mint] wallet confirmed, tx submitted");
          setCertificateExplorerUrl(`https://chainscan-galileo.0g.ai/tx/${txHash}`);
          setMintStatus("minting");
          setMintStatusMessage("Minting certificate...");
        },
        mintOptions,
      );
      console.log("[mint] success", result);
      setMintedTokenId(result.tokenId ?? null);
      setCertificateExplorerUrl(result.explorerUrl);
      setMintStatus("success");
      setMintStatusMessage(result.proofLabel);
      if (result.tokenId && latestScanData && address) {
        persistScanHistory({
          id: `${Date.now()}-${latestScanData.repoUrl}`,
          repoUrl: latestScanData.repoUrl,
          scanDate: latestScanData.scanDate,
          filesScanned: latestScanData.filesScanned,
          totalFindings: latestScanData.totalFindings,
          criticalCount: latestScanData.criticalCount,
          highCount: latestScanData.highCount,
          mediumCount: latestScanData.mediumCount,
          lowCount: latestScanData.lowCount,
          reportHash: latestScanData.reportHash,
          findings: findingsRef.current.map((f) => ({ ...f })),
          tokenId: result.tokenId,
          txHash: result.txHash,
          explorerUrl: result.explorerUrl,
        });
      }
    } catch (error) {
      console.log("[mint] error", error);
      const message =
        error instanceof Error ? error.message.toLowerCase() : "Mint failed";
      if (message.includes("user rejected") || message.includes("denied")) {
        setMintStatus("cancelled");
        setMintStatusMessage("Certificate minting cancelled");
      } else {
        setMintStatus("error");
        setMintStatusMessage(
          error instanceof Error ? error.message : "Certificate minting failed",
        );
      }
    } finally {
      setHasMinted(true);
    }
  };
  const handleTabChange = (tab: ActiveTab) => {
    if (scanLocked) return;
    setActiveTab(tab);
  };
  const guardNavigation = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!scanLocked) return;
    event.preventDefault();
  };

  return (
    <main className="relative flex min-h-dvh h-[100dvh] flex-col overflow-hidden bg-black font-geist text-[#F0EEF8]">
      <AmbientGlow />
      <header className="relative z-10 flex min-h-[56px] shrink-0 items-center border-b border-white/10 bg-black/80 px-4 backdrop-blur-[24px] overflow-visible sm:px-5">
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
          {[
            { label: "Scanner", key: "scanner" as const },
            { label: "Findings", key: "findings" as const },
            { label: "History", key: "history" as const },
            { label: "Certificate", href: "/agent-id" },
            { label: "Settings", key: "settings" as const },
          ].map((item) =>
            "href" in item ? (
              <Link
                key={item.label}
                href={item.href ?? "/agent-id"}
                onClick={guardNavigation}
                className={`h-full border-b-2 border-transparent px-4 font-mono text-[11px] uppercase tracking-[0.08em] ${
                  scanLocked
                    ? "cursor-not-allowed text-[#4A475C]"
                    : "text-[#9B99B0] hover:text-[#F0EEF8]"
                }`}
              >
                <span className="inline-flex h-full items-center">{item.label}</span>
              </Link>
            ) : (
              <button
                key={item.label}
                type="button"
                onClick={() => handleTabChange(item.key)}
                className={`h-full border-b-2 px-4 font-mono text-[11px] uppercase tracking-[0.08em] ${
                  activeTab === item.key
                    ? "border-[#7C3AED] bg-[rgba(124,58,237,0.12)] text-[#F0EEF8]"
                    : "border-transparent text-[#9B99B0] hover:text-[#F0EEF8]"
                }`}
              >
                {item.label}
              </button>
            ),
          )}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-full border border-[rgba(16,185,129,0.2)] bg-[rgba(16,185,129,0.08)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.06em] text-[#6EE7B7] sm:px-2.5 sm:py-1 sm:text-[10px]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#6EE7B7]" />
            TEE
          </div>
          <div className="hidden md:block">
            <WalletConnect />
          </div>
          <button
            type="button"
            className="md:hidden"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label="Toggle dashboard menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5 text-[#F0EEF8]" /> : <Menu className="h-5 w-5 text-[#F0EEF8]" />}
          </button>
        </div>
      </header>
      <div className="relative z-20 border-b border-white/10 bg-black/95 px-4 py-3 md:hidden">
        <div className="flex items-center gap-2.5 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button type="button" disabled={scanLocked} onClick={() => handleTabChange("scanner")} className={`min-h-[44px] shrink-0 rounded-lg border px-4 py-2.5 text-xs disabled:cursor-not-allowed disabled:opacity-50 ${activeTab === "scanner" ? "border-[rgba(124,58,237,0.55)] bg-[rgba(124,58,237,0.24)] text-[#F0EEF8]" : "border-white/10 text-[#9B99B0]"}`}>Scanner</button>
          <button type="button" disabled={scanLocked} onClick={() => handleTabChange("findings")} className={`min-h-[44px] shrink-0 rounded-lg border px-4 py-2.5 text-xs disabled:cursor-not-allowed disabled:opacity-50 ${activeTab === "findings" ? "border-[rgba(124,58,237,0.55)] bg-[rgba(124,58,237,0.24)] text-[#F0EEF8]" : "border-white/10 text-[#9B99B0]"}`}>Findings</button>
          <button type="button" disabled={scanLocked} onClick={() => handleTabChange("history")} className={`min-h-[44px] shrink-0 rounded-lg border px-4 py-2.5 text-xs disabled:cursor-not-allowed disabled:opacity-50 ${activeTab === "history" ? "border-[rgba(124,58,237,0.55)] bg-[rgba(124,58,237,0.24)] text-[#F0EEF8]" : "border-white/10 text-[#9B99B0]"}`}>History</button>
          <button type="button" disabled={scanLocked} onClick={() => handleTabChange("settings")} className={`min-h-[44px] shrink-0 rounded-lg border px-4 py-2.5 text-xs disabled:cursor-not-allowed disabled:opacity-50 ${activeTab === "settings" ? "border-[rgba(124,58,237,0.55)] bg-[rgba(124,58,237,0.24)] text-[#F0EEF8]" : "border-white/10 text-[#9B99B0]"}`}>Settings</button>
          <Link onClick={guardNavigation} href="/agent-id" className={`inline-flex min-h-[44px] shrink-0 items-center rounded-lg border px-4 py-2.5 text-xs ${scanLocked ? "cursor-not-allowed border-white/5 text-[#4A475C]" : "border-white/10 text-[#F0EEF8]"}`}>Certificate</Link>
        </div>
      </div>
      {mobileMenuOpen ? (
        <div className="relative z-20 border-b border-white/10 bg-black/95 px-4 py-3 md:hidden">
          <div className="flex items-center justify-between gap-3">
            <WalletConnect />
            <Link
              href="/agent-id"
              onClick={guardNavigation}
              className={`rounded-md border px-3 py-2 text-xs ${
                scanLocked
                  ? "cursor-not-allowed border-white/5 text-[#4A475C]"
                  : "border-white/10 text-[#F0EEF8]"
              }`}
            >
              Open Certificate
            </Link>
          </div>
        </div>
      ) : null}

      <div className="relative z-[1] flex min-h-0 flex-1 overflow-hidden">
        {sidebarPanel !== "none" ? (
          <button
            type="button"
            aria-label="Close quick panel"
            className="fixed inset-0 z-[85] bg-black/45 md:block"
            onClick={() => setSidebarPanel("none")}
          />
        ) : null}

        <aside
          className={`${panelClass} relative z-[88] m-3 hidden w-[56px] shrink-0 flex-col items-center gap-1.5 bg-[rgba(255,255,255,0.02)] py-3 md:flex`}
        >
          <SidebarQuickIcon
            icon={Shield}
            label="Last scan summary - findings count per severity"
            active={sidebarPanel === "summary"}
            onClick={() => setSidebarPanel((p) => (p === "summary" ? "none" : "summary"))}
          />
          <SidebarQuickIcon
            icon={Clock}
            label="Recently scanned repos (last 3)"
            active={sidebarPanel === "recent"}
            onClick={() => setSidebarPanel((p) => (p === "recent" ? "none" : "recent"))}
          />
          <SidebarQuickIcon
            icon={Database}
            label="0G Storage usage and scan snapshot stats"
            active={sidebarPanel === "storage"}
            onClick={() => setSidebarPanel((p) => (p === "storage" ? "none" : "storage"))}
          />
          <div className="my-1 h-px w-6 bg-[#2E2C3E]" />
          <button
            type="button"
            title="Built on 0G Infrastructure - TeeML - OpenClaw"
            aria-label="Built on 0G Infrastructure - TeeML - OpenClaw"
            className="flex h-[36px] w-[36px] items-center justify-center rounded-lg text-[#9B99B0] transition hover:bg-white/5 hover:text-[#A78BFA]"
          >
            <HelpCircle className="h-4 w-4" strokeWidth={1.6} />
          </button>
        </aside>

        {sidebarPanel === "summary" ? (
          <div
            className={`${panelClass} fixed left-3 top-[120px] z-[90] w-[min(300px,calc(100vw-1.5rem))] border border-white/15 p-4 shadow-2xl md:left-[72px] md:top-[88px]`}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Last scan summary"
          >
            <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.1em] text-[#9B99B0]">
              Last scan summary
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-[rgba(239,68,68,0.25)] bg-[rgba(239,68,68,0.08)] px-3 py-2">
                <p className="font-mono text-[10px] uppercase text-[#FCA5A5]">Critical</p>
                <p className="font-mono text-xl text-[#F0EEF8]">{lastScanSeverityCounts.Critical}</p>
              </div>
              <div className="rounded-lg border border-[rgba(249,115,22,0.25)] bg-[rgba(249,115,22,0.08)] px-3 py-2">
                <p className="font-mono text-[10px] uppercase text-[#FDBA74]">High</p>
                <p className="font-mono text-xl text-[#F0EEF8]">{lastScanSeverityCounts.High}</p>
              </div>
              <div className="rounded-lg border border-[rgba(234,179,8,0.25)] bg-[rgba(234,179,8,0.08)] px-3 py-2">
                <p className="font-mono text-[10px] uppercase text-[#FDE68A]">Medium</p>
                <p className="font-mono text-xl text-[#F0EEF8]">{lastScanSeverityCounts.Medium}</p>
              </div>
              <div className="rounded-lg border border-[rgba(59,130,246,0.25)] bg-[rgba(59,130,246,0.08)] px-3 py-2">
                <p className="font-mono text-[10px] uppercase text-[#93C5FD]">Low</p>
                <p className="font-mono text-xl text-[#F0EEF8]">{lastScanSeverityCounts.Low}</p>
              </div>
            </div>
            {lastScanMeta ? (
              <p className="mt-3 truncate font-mono text-[10px] text-[#6B6880]" title={lastScanMeta.repoUrl}>
                {extractRepoDisplayName(lastScanMeta.repoUrl)}
              </p>
            ) : (
              <p className="mt-3 font-mono text-[10px] text-[#6B6880]">No scan data yet</p>
            )}
          </div>
        ) : null}

        {sidebarPanel === "recent" ? (
          <div
            className={`${panelClass} fixed left-3 top-[120px] z-[90] w-[min(300px,calc(100vw-1.5rem))] border border-white/15 p-4 shadow-2xl md:left-[72px] md:top-[88px]`}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Recently scanned repositories"
          >
            <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.1em] text-[#9B99B0]">
              Recent repos
            </p>
            {recentRepoUrls.length === 0 ? (
              <p className="font-mono text-xs text-[#6B6880]">No completed scans in history yet.</p>
            ) : (
              <ul className="space-y-2">
                {recentRepoUrls.map((url) => (
                  <li
                    key={url}
                    className="truncate rounded-lg border border-white/10 bg-[rgba(255,255,255,0.04)] px-3 py-2 font-mono text-[11px] text-[#E9E4FF]"
                    title={url}
                  >
                    {extractRepoDisplayName(url)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {sidebarPanel === "storage" ? (
          <div
            className={`${panelClass} fixed left-3 top-[120px] z-[90] w-[min(320px,calc(100vw-1.5rem))] border border-white/15 p-4 shadow-2xl md:left-[72px] md:top-[88px]`}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="0G Storage snapshot"
          >
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[#9B99B0]">
              0G Storage - scan snapshot
            </p>
            <p className="mb-3 text-xs leading-relaxed text-[#9B99B0]">
              Repository chunks and the aggregated findings report are uploaded to 0G Storage during each
              scan (serial uploads per file plus a JSON summary).
            </p>
            <div className="space-y-2 rounded-lg border border-white/10 bg-[rgba(255,255,255,0.04)] p-3 font-mono text-[11px]">
              <div className="flex justify-between gap-2 text-[#9B99B0]">
                <span>Files processed (session)</span>
                <span className="text-[#F0EEF8]">
                  {scannedFiles}/{totalFiles || "-"}
                </span>
              </div>
              <div className="flex justify-between gap-2 text-[#9B99B0]">
                <span>Summary report hash</span>
                <span className="max-w-[140px] truncate text-[#A78BFA]" title={latestScanData?.reportHash ?? ""}>
                  {latestScanData?.reportHash
                    ? `${latestScanData.reportHash.slice(0, 10)}…${latestScanData.reportHash.slice(-8)}`
                    : "-"}
                </span>
              </div>
              <div className="flex justify-between gap-2 text-[#9B99B0]">
                <span>Findings in report</span>
                <span className="text-[#F0EEF8]">{latestScanData?.totalFindings ?? "-"}</span>
              </div>
            </div>
          </div>
        ) : null}

        <section className="flex min-w-0 flex-1 flex-col overflow-hidden px-4 py-4 pb-6 md:p-3 md:pb-3 md:pl-0">
          <div className={`${panelClass} sticky top-0 z-10 mb-4 shrink-0 p-4 md:mb-3 md:p-3`}>
            <div className="flex flex-col gap-3 md:flex-row md:gap-2">
              <div className="relative flex-1">
                <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9B99B0]" />
                <input
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  disabled={isScanning}
                  placeholder="Paste GitHub repo URL to begin scan..."
                  className="w-full min-h-[48px] rounded-full border border-white/10 bg-[rgba(255,255,255,0.05)] py-3 pl-10 pr-4 text-sm text-[#F0EEF8] outline-none ring-purple/0 transition placeholder:text-[#9B99B0] focus:border-[#A78BFA]/50 focus:ring-2 focus:ring-[#7C3AED]/40 disabled:cursor-not-allowed disabled:opacity-60 md:min-h-0 md:py-2"
                />
              </div>
              <button
                type="button"
                onClick={() => void startScan()}
                disabled={isScanning}
                className="w-full min-h-[48px] rounded-full border border-[rgba(167,139,250,0.5)] bg-[rgba(124,58,237,0.3)] px-5 py-2.5 font-mono text-xs uppercase tracking-[0.06em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_0_20px_rgba(124,58,237,0.2)] backdrop-blur-[10px] transition hover:bg-[rgba(124,58,237,0.45)] disabled:cursor-not-allowed disabled:opacity-60 md:min-h-0 md:w-auto md:py-2"
              >
                {isScanning ? "Scanning..." : "Start Scan"}
              </button>
            </div>
            <p className="mt-3 flex items-start justify-center gap-2 px-1 text-center font-mono text-[11px] leading-relaxed text-[var(--text-3)] sm:mt-2 sm:items-center">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#6B6880] sm:mt-0" />
              <span className="text-left sm:text-center">
                Supports public GitHub repositories only - Results may vary by codebase - AI-generated
                findings - always verify with your security team
              </span>
            </p>
            {scanCompleted && latestScanData && !hasMinted ? (
              <div
                className="mt-3 rounded-xl border border-[rgba(167,139,250,0.45)] bg-[rgba(124,58,237,0.1)] px-4 py-3 text-[#E6DBFF]"
                style={{ animation: "borderPulse 2s ease-in-out infinite" }}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2 text-xs">
                    <ShieldCheck className="h-4 w-4 animate-pulse text-[#A78BFA]" />
                    <span className="font-medium">
                      {mintStatusMessage ?? "Scan complete. Mint your security certificate from your wallet."}
                    </span>
                  </div>
                  <div className="flex flex-col items-start sm:items-end">
                    <button
                      type="button"
                      onClick={handleMintCertificate}
                      disabled={
                        mintStatus === "awaiting_wallet" ||
                        mintStatus === "minting" ||
                        !isConnected
                      }
                      className="rounded-full border border-[rgba(167,139,250,0.55)] bg-[rgba(124,58,237,0.45)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-white shadow-[0_0_18px_rgba(124,58,237,0.5)] transition disabled:cursor-not-allowed disabled:opacity-60"
                      style={{ animation: "glowBreath 2.4s ease-in-out infinite" }}
                    >
                      {mintStatus === "awaiting_wallet"
                        ? "Waiting for wallet confirmation..."
                        : mintStatus === "minting"
                          ? "Minting certificate..."
                          : "MINT SECURITY CERTIFICATE"}
                    </button>
                    <span className="mt-1 font-mono text-[10px] text-[#B6A7E6]">
                      Sign with your wallet to claim ownership
                    </span>
                  </div>
                </div>
              </div>
            ) : null}
            {scanCompleted && latestScanData && hasMinted ? (
              <div
                className={`mt-3 flex flex-col gap-2 rounded-lg border px-3 py-2 sm:flex-row sm:items-center sm:justify-between ${
                  mintStatus === "success"
                    ? "border-[rgba(16,185,129,0.25)] bg-[rgba(16,185,129,0.08)] text-[#6EE7B7]"
                    : mintStatus === "cancelled"
                      ? "border-white/10 bg-white/5 text-[#9B99B0]"
                      : "border-[rgba(239,68,68,0.25)] bg-[rgba(239,68,68,0.08)] text-[#FCA5A5]"
                }`}
              >
                <div className="flex items-center gap-2 text-xs">
                  {mintStatus === "success" ? (
                    <Sparkles className="h-4 w-4 shrink-0" />
                  ) : mintStatus === "cancelled" ? (
                    <Info className="h-4 w-4 shrink-0" />
                  ) : (
                    <TriangleAlert className="h-4 w-4 shrink-0" />
                  )}
                  <span>
                    {mintStatus === "success"
                      ? mintedTokenId
                        ? `Security certificate minted - Token #${mintedTokenId}`
                        : mintStatusMessage ?? "Certificate minted"
                      : (mintStatusMessage ?? "Mint attempt finished.")}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {mintStatus === "success" && certificateExplorerUrl ? (
                    <a
                      href={certificateExplorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-[10px] uppercase tracking-[0.06em] text-[#A78BFA] hover:underline"
                    >
                      Explorer
                    </a>
                  ) : null}
                  {mintStatus === "success" ? (
                    <Link
                      href={
                        mintedTokenId
                          ? `/agent-id?tokenId=${encodeURIComponent(mintedTokenId)}`
                          : "/agent-id"
                      }
                      onClick={guardNavigation}
                      className="rounded-full border border-[rgba(167,139,250,0.4)] bg-[rgba(124,58,237,0.35)] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.06em] text-white"
                    >
                      View Certificate
                    </Link>
                  ) : null}
                </div>
              </div>
            ) : null}
            {scanError ? (
              <p className="mt-2 font-mono text-[11px] text-[#EF4444]">{scanError}</p>
            ) : null}
          </div>

          {activeTab === "scanner" ? (
            <div
              className={`grid h-full min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden md:gap-3 lg:grid-cols-[1.2fr_0.9fr_280px] ${
                isScanning
                  ? "rounded-2xl border border-transparent bg-[linear-gradient(rgba(0,0,0,0.75),rgba(0,0,0,0.75))_padding-box,linear-gradient(120deg,#A78BFA,#7C3AED,#EC4899)_border-box] p-[1px] animate-pulse"
                  : ""
              }`}
            >
              <LiveScanFeed findings={findings} notices={scanNotices} isScanning={isScanning} />
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
                mintedTokenId={mintedTokenId}
              />
            </div>
          ) : null}
          {activeTab === "findings" ? (
            <FindingsTab
              findings={mostRecentFindings}
              latestScanData={latestScanData}
              hasScanData={mostRecentFindings.length > 0}
              canView={isConnected}
            />
          ) : null}
          {activeTab === "history" ? (
            <HistoryTab history={scanHistory} canView={isConnected} />
          ) : null}
          {activeTab === "settings" ? (
            <SettingsTab
              address={address ?? null}
              isConnected={isConnected}
              onDisconnect={disconnect}
              contractCopied={contractCopied}
              onCopyContract={async () => {
                try {
                  await navigator.clipboard.writeText(INFT_CONTRACT_ADDRESS);
                  setContractCopied(true);
                  window.setTimeout(() => setContractCopied(false), 2000);
                } catch {
                  setContractCopied(false);
                }
              }}
            />
          ) : null}
        </section>
      </div>

      <footer className={`${panelClass} relative z-[5] mx-4 mb-4 mt-0 flex min-h-[44px] shrink-0 flex-wrap items-center gap-x-4 gap-y-2 overflow-x-auto rounded-xl bg-[rgba(255,255,255,0.02)] px-4 py-3 font-mono text-[10px] text-[#9B99B0] md:mx-3 md:mb-3 md:py-2`}>
        <StatusItem iconColor="bg-[#7C3AED]" label="0G Chain" value="0G Galileo" />
        <span className="hidden sm:inline-flex">
          <StatusItem
            iconColor={isConnected ? "bg-[#A78BFA]" : "bg-[#A78BFA]"}
            label="Wallet"
            value={isConnected && address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "Not connected"}
            fallbackValue="Not connected"
            deferUntilMounted
          />
        </span>
        <span className="hidden sm:inline-flex">
          <StatusItem iconColor="bg-[#3B82F6]" label="Storage" value={`${scannedFiles}/${totalFiles}`} />
        </span>
        <span className="hidden sm:inline-flex">
          <StatusItem iconColor="bg-[#10B981]" label="Inference" value={isScanning ? "Running" : "Idle"} />
        </span>
        <StatusItem iconColor="bg-[#EF4444]" label="Critical" value={`${findingsSummary.Critical}`} />
      </footer>
      <style jsx global>{`
        @keyframes borderPulse {
          0%, 100% {
            border-color: rgba(167, 139, 250, 0.35);
            box-shadow: 0 0 0 rgba(124, 58, 237, 0);
          }
          50% {
            border-color: rgba(167, 139, 250, 0.75);
            box-shadow: 0 0 20px rgba(124, 58, 237, 0.25);
          }
        }
        @keyframes glowBreath {
          0%, 100% {
            box-shadow: 0 0 12px rgba(124, 58, 237, 0.35);
          }
          50% {
            box-shadow: 0 0 26px rgba(124, 58, 237, 0.7);
          }
        }
      `}</style>
    </main>
  );
}

function SidebarQuickIcon({
  icon: Icon,
  label,
  active = false,
  onClick,
}: {
  icon: typeof Shield;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`flex h-[36px] w-[36px] items-center justify-center rounded-lg transition ${
        active
          ? "bg-[rgba(124,58,237,0.22)] text-[#A78BFA]"
          : "text-[#9B99B0] hover:bg-white/5 hover:text-[#E9E4FF]"
      }`}
    >
      <Icon className="h-4 w-4" strokeWidth={1.6} />
    </button>
  );
}

function extractRepoDisplayName(repoUrl: string): string {
  try {
    const parts = new URL(repoUrl).pathname.replace(/^\/+/, "").split("/").filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]}/${parts[1].replace(/\.git$/, "")}`;
    }
  } catch {
    /* ignore */
  }
  return repoUrl;
}

function formatScanDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function LiveScanFeed({
  findings,
  notices,
  isScanning,
}: {
  findings: Finding[];
  notices: ScanNotice[];
  isScanning: boolean;
}) {
  return (
    <section className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[rgba(0,0,0,0.4)] shadow-[0_10px_30px_rgba(14,10,30,0.45)] backdrop-blur-[20px] before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent before:content-['']">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3.5 sm:px-5">
        <div className="flex items-center gap-2">
          <ScanSearch className="h-4 w-4 text-[#7C3AED]" />
          <h3 className="text-[15px] font-semibold text-[#E9E4FF] sm:text-base">Live Scan Feed</h3>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#9B99B0]">
          {isScanning ? "Scanning" : "Ready"}
        </span>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 pb-16 sm:p-5 sm:pb-[60px] [scrollbar-width:thin] [scrollbar-color:rgba(139,92,246,0.4)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[rgba(139,92,246,0.4)] [&::-webkit-scrollbar-track]:bg-transparent">
        {notices.map((notice) => (
          <div
            key={notice.id}
            className="rounded-md border border-white/5 bg-[rgba(255,255,255,0.02)] px-3 py-2 font-mono text-[10px] text-[#2E2C3E]"
            title={
              notice.message.includes("timed out")
                ? "Storage uploads may timeout on testnet - this does not affect scan results"
                : undefined
            }
          >
            {notice.message}
          </div>
        ))}
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
    <article className="rounded-lg border border-white/10 bg-[rgba(255,255,255,0.04)] px-4 py-4 shadow-[0_8px_20px_rgba(12,10,24,0.35)] sm:px-5 sm:py-4">
      <div className="flex flex-col gap-3 md:grid md:grid-cols-[72px_1fr_auto] md:items-start md:gap-3">
        <div className="flex items-start justify-between gap-3 md:block md:w-[72px]">
          <span className={`inline-flex rounded-[4px] px-2 py-[3px] font-mono text-[10px] uppercase tracking-[0.06em] ${badgeStyles[finding.severity]}`}>
            {finding.severity}
          </span>
          <span className="truncate font-mono text-[11px] text-[#9B99B0] md:hidden" title={`${finding.file}:${finding.line}`}>
            {finding.file}:{finding.line}
          </span>
        </div>

        <div className="min-w-0">
          <p className="text-[14px] font-medium leading-relaxed text-[#F4F2FF]">{finding.description}</p>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] pt-3 font-mono text-[11px] text-[#9B99B0] md:flex-col md:items-end md:justify-start md:border-t-0 md:pt-0 md:text-right">
          <span className="hidden max-w-full truncate md:inline" title={`${finding.file}:${finding.line}`}>
            {finding.file}:{finding.line}
          </span>
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="ml-auto rounded-[6px] border border-[rgba(167,139,250,0.5)] bg-[rgba(124,58,237,0.3)] px-3 py-1.5 text-[10px] text-[#E9E4FF] shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_0_20px_rgba(124,58,237,0.2)] backdrop-blur-[10px] transition hover:bg-[rgba(124,58,237,0.45)] hover:text-white md:ml-0 md:px-2 md:py-[3px]"
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
    <section className={`${panelClass} flex h-full min-h-0 flex-col overflow-hidden`}>
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3.5 sm:px-5">
        <h3 className="text-[15px] font-semibold text-[#F0EEF8] sm:text-base">Scan Status</h3>
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#9B99B0]">
          {isScanning ? "Running" : scanCompleted ? "Complete" : "Waiting"}
        </span>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:p-5 [scrollbar-width:thin] [scrollbar-color:rgba(139,92,246,0.35)_transparent] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[rgba(139,92,246,0.35)] [&::-webkit-scrollbar-track]:bg-transparent">
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
  mintedTokenId,
}: {
  scannedFiles: number;
  totalFiles: number;
  progressPercent: number;
  findingsSummary: Record<FindingSeverity, number>;
  mintedTokenId: string | null;
}) {
  return (
    <aside className={`${panelClass} hidden h-full min-h-0 flex-col overflow-y-auto xl:flex [scrollbar-width:thin] [scrollbar-color:rgba(139,92,246,0.35)_transparent] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[rgba(139,92,246,0.35)] [&::-webkit-scrollbar-track]:bg-transparent`}>
      <div className="border-b border-white/10 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-[#F0EEF8]">Agent Identity</h3>
          <span
            className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] ${
              mintedTokenId
                ? "border-[rgba(167,139,250,0.25)] bg-[rgba(139,92,246,0.1)] text-[#A78BFA]"
                : "border-white/10 bg-white/5 text-[#4A475C]"
            }`}
          >
            {mintedTokenId ? `Token #${mintedTokenId}` : "Not minted"}
          </span>
        </div>
        <div className="rounded-xl border border-white/10 bg-[rgba(255,255,255,0.04)] p-3">
          <ShieldCheck className="mb-2 h-5 w-5 text-[#A78BFA]" />
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#9B99B0]">
            Agent ID - ERC-7857
          </p>
          <p
            className={`font-mono text-xs ${
              mintedTokenId ? "text-[#F0EEF8]" : "text-[#2E2C3E]"
            }`}
          >
            {mintedTokenId ? `Token #${mintedTokenId}` : "Not minted"}
          </p>
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

function FindingsTab({
  findings,
  latestScanData,
  hasScanData,
  canView,
}: {
  findings: Finding[];
  latestScanData: MintScanData | null;
  hasScanData: boolean;
  canView: boolean;
}) {
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("All");
  const [searchQuery, setSearchQuery] = useState("");

  const counts = useMemo(() => {
    return findings.reduce(
      (acc, f) => {
        acc[f.severity] += 1;
        return acc;
      },
      {
        Critical: 0,
        High: 0,
        Medium: 0,
        Low: 0,
      } as Record<FindingSeverity, number>,
    );
  }, [findings]);

  const filteredFindings = useMemo(() => {
    let list = findings;
    if (severityFilter !== "All") {
      list = list.filter((f) => f.severity === severityFilter);
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (f) =>
          f.file.toLowerCase().includes(q) ||
          f.description.toLowerCase().includes(q) ||
          f.fix.toLowerCase().includes(q),
      );
    }
    return list;
  }, [findings, severityFilter, searchQuery]);

  const repoHeading = latestScanData?.repoUrl
    ? extractRepoDisplayName(latestScanData.repoUrl)
    : "";
  const scanWhen = latestScanData?.scanDate ? formatScanDate(latestScanData.scanDate) : "";

  return (
    <section className={`${panelClass} flex h-full min-h-0 flex-col overflow-hidden`}>
      <div className="min-h-0 flex-1 overflow-y-auto p-5 md:p-6 [scrollbar-width:thin] [scrollbar-color:rgba(139,92,246,0.35)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[rgba(139,92,246,0.35)] [&::-webkit-scrollbar-track]:bg-transparent">
        <div className="mb-8 md:mb-6">
          <h2 className="font-geist text-[22px] font-bold leading-tight tracking-tight text-[#F0EEF8] sm:text-2xl md:text-3xl">
            Security Findings
          </h2>
          {latestScanData ? (
            <>
              <p className="mt-2 font-mono text-sm text-[#A78BFA]" title={latestScanData.repoUrl}>
                {repoHeading}
              </p>
              <p className="mt-1 font-mono text-xs text-[#9B99B0]">Scan date - {scanWhen}</p>
            </>
          ) : (
            <p className="mt-2 font-mono text-xs text-[#6B6880]">No scan metadata loaded yet.</p>
          )}
        </div>

        {!canView ? (
          <div className="rounded-xl border border-white/10 bg-[rgba(255,255,255,0.04)] p-6 text-sm text-[#9B99B0]">
            Connect your wallet to view findings.
          </div>
        ) : !hasScanData ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/15 bg-[rgba(255,255,255,0.02)] px-6 py-16 text-center">
            <Shield className="mb-4 h-12 w-12 text-[#4A475C]" strokeWidth={1.25} />
            <p className="max-w-sm font-mono text-sm text-[#9B99B0]">Run a scan to see findings</p>
          </div>
        ) : (
          <>
            <div className="mb-8 grid grid-cols-2 gap-3 sm:mb-6 sm:grid-cols-4 sm:gap-2">
              <div className="rounded-xl border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.08)] px-3 py-4 text-center sm:py-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#FCA5A5]">Critical</p>
                <p className="font-mono text-2xl font-semibold text-[#F0EEF8]">{counts.Critical}</p>
              </div>
              <div className="rounded-xl border border-[rgba(249,115,22,0.3)] bg-[rgba(249,115,22,0.08)] px-3 py-4 text-center sm:py-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#FDBA74]">High</p>
                <p className="font-mono text-2xl font-semibold text-[#F0EEF8]">{counts.High}</p>
              </div>
              <div className="rounded-xl border border-[rgba(234,179,8,0.3)] bg-[rgba(234,179,8,0.08)] px-3 py-4 text-center sm:py-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#FDE68A]">Medium</p>
                <p className="font-mono text-2xl font-semibold text-[#F0EEF8]">{counts.Medium}</p>
              </div>
              <div className="rounded-xl border border-[rgba(59,130,246,0.3)] bg-[rgba(59,130,246,0.08)] px-3 py-4 text-center sm:py-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#93C5FD]">Low</p>
                <p className="font-mono text-2xl font-semibold text-[#F0EEF8]">{counts.Low}</p>
              </div>
            </div>

            <div className="mb-6 flex flex-col gap-4 sm:mb-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
              <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 p-1.5">
                {(["All", "Critical", "High", "Medium", "Low"] as const).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setSeverityFilter(filter)}
                    className={`rounded px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.06em] transition ${
                      severityFilter === filter
                        ? "bg-[rgba(124,58,237,0.35)] text-white"
                        : "text-[#9B99B0] hover:text-[#F0EEF8]"
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>
              <div className="relative flex min-w-0 flex-1 sm:max-w-xs sm:flex-none">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B6880]" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter by file or issue..."
                  className="w-full rounded-full border border-white/10 bg-[rgba(255,255,255,0.05)] py-2 pl-9 pr-3 font-mono text-xs text-[#F0EEF8] outline-none placeholder:text-[#6B6880] focus:border-[#A78BFA]/40"
                />
              </div>
              <button
                type="button"
                disabled
                title="Coming soon"
                className="shrink-0 rounded-full border border-white/10 bg-[rgba(255,255,255,0.04)] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[#4A475C] cursor-not-allowed"
              >
                Export Report
              </button>
            </div>

            <div className="space-y-[12px] pb-4">
              {filteredFindings.length === 0 ? (
                <p className="rounded-xl border border-white/10 bg-[rgba(255,255,255,0.03)] p-4 font-mono text-sm text-[#9B99B0]">
                  No findings match your filters.
                </p>
              ) : (
                filteredFindings.map((finding, index) => (
                  <FindingCard key={`${finding.file}-${finding.line}-${index}`} finding={finding} />
                ))
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function HistoryTab({
  history,
  canView,
}: {
  history: ScanHistoryEntry[];
  canView: boolean;
}) {
  return (
    <section className={`${panelClass} h-full min-h-0 overflow-y-auto p-5 md:p-6 [scrollbar-width:thin] [scrollbar-color:rgba(139,92,246,0.35)_transparent]`}>
      <h2 className="mb-8 font-geist text-[22px] font-bold leading-tight tracking-tight text-[#F0EEF8] sm:text-2xl md:mb-6">Scan history</h2>
      {!canView ? (
        <div className="rounded-xl border border-white/10 bg-[rgba(255,255,255,0.04)] p-6 text-sm text-[#9B99B0]">
          Connect your wallet to view scan history.
        </div>
      ) : history.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/15 bg-[rgba(255,255,255,0.02)] px-6 py-16 text-center">
          <Timer className="mb-4 h-10 w-10 text-[#4A475C]" strokeWidth={1.25} />
          <p className="max-w-md font-mono text-sm leading-relaxed text-[#9B99B0]">
            No scans yet - your scan history will appear here
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {history.map((item) => {
            const breakdownParts: string[] = [];
            if (item.criticalCount > 0) breakdownParts.push(`${item.criticalCount} Critical`);
            if (item.highCount > 0) breakdownParts.push(`${item.highCount} High`);
            if (item.mediumCount > 0) breakdownParts.push(`${item.mediumCount} Medium`);
            if (item.lowCount > 0) breakdownParts.push(`${item.lowCount} Low`);
            const breakdown =
              breakdownParts.length > 0 ? breakdownParts.join(" - ") : "No findings";

            return (
              <div
                key={item.id}
                className="rounded-xl border border-white/10 bg-[rgba(255,255,255,0.04)] p-5 transition hover:border-[rgba(167,139,250,0.35)] hover:bg-[rgba(124,58,237,0.06)] md:p-4"
              >
                <p className="font-semibold text-[#F4F2FF]">{extractRepoDisplayName(item.repoUrl)}</p>
                <p className="mt-1 font-mono text-[11px] text-[#9B99B0]">{formatScanDate(item.scanDate)}</p>
                <p className="mt-2 font-mono text-xs text-[#C4BDD9]">
                  {item.filesScanned} files scanned - {breakdown}
                </p>
                <div className="mt-3">
                  {item.tokenId ? (
                    <Link
                      href={`/agent-id?tokenId=${encodeURIComponent(item.tokenId)}`}
                      className="inline-flex rounded-full border border-[rgba(167,139,250,0.45)] bg-[rgba(124,58,237,0.25)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-[#E9E4FF] transition hover:bg-[rgba(124,58,237,0.4)]"
                    >
                      View Certificate
                    </Link>
                  ) : (
                    <span className="font-mono text-[10px] text-[#4A475C]" title="Mint a certificate after scan to link">
                      Certificate not linked (mint required)
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function SettingsTab({
  address,
  isConnected,
  onDisconnect,
  contractCopied,
  onCopyContract,
}: {
  address: string | null;
  isConnected: boolean;
  onDisconnect: () => void;
  contractCopied: boolean;
  onCopyContract: () => void | Promise<void>;
}) {
  const explorerContractUrl = `${CHAINSCAN_GALILEO}/address/${INFT_CONTRACT_ADDRESS}`;

  return (
    <section className={`${panelClass} h-full min-h-0 overflow-y-auto p-5 md:p-6`}>
      <h2 className="mb-8 font-geist text-[22px] font-bold leading-tight tracking-tight text-[#F0EEF8] sm:text-2xl md:mb-6">Settings</h2>

      <div className="mb-8 rounded-xl border border-white/10 bg-[rgba(255,255,255,0.04)] p-5 md:mb-6 md:p-4">
        <h3 className="mb-3 font-mono text-[10px] uppercase tracking-[0.12em] text-[#9B99B0]">Network</h3>
        <p className="mb-1 text-sm text-[#F0EEF8]">
          Current network: <span className="font-mono text-[#A78BFA]">0G Galileo Testnet</span>
        </p>
        <p className="mb-4 font-mono text-xs text-[#9B99B0]">Chain ID 16602</p>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] uppercase text-[#9B99B0]">INFT contract</span>
          <code className="max-w-full truncate rounded border border-white/10 bg-black/40 px-2 py-1 font-mono text-[10px] text-[#E9E4FF]">
            {INFT_CONTRACT_ADDRESS}
          </code>
          <button
            type="button"
            onClick={() => void onCopyContract()}
            title="Copy address"
            className="inline-flex items-center gap-1 rounded border border-white/15 px-2 py-1 font-mono text-[10px] uppercase text-[#A78BFA] transition hover:bg-white/5"
          >
            {contractCopied ? (
              <>
                <Check className="h-3 w-3 text-[#6EE7B7]" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                Copy
              </>
            )}
          </button>
          <a
            href={explorerContractUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-mono text-[10px] uppercase text-[#A78BFA] hover:underline"
          >
            Explorer
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        <p className="rounded-lg border border-[rgba(234,179,8,0.2)] bg-[rgba(234,179,8,0.06)] px-3 py-2 font-mono text-[11px] leading-snug text-[#FDE68A]">
          Switch to mainnet before final submission (hackathon / production certificate).
        </p>
      </div>

      <div className="rounded-xl border border-white/10 bg-[rgba(255,255,255,0.04)] p-5 font-mono text-xs md:p-4">
        <p className="text-[#9B99B0]">
          Wallet:{" "}
          <span className="break-all text-[#F0EEF8]">
            {isConnected && address ? address : "Not connected"}
          </span>
        </p>
        <button
          type="button"
          onClick={onDisconnect}
          className="mt-4 rounded-lg border border-[rgba(239,68,68,0.35)] px-3 py-2 text-[10px] uppercase tracking-[0.06em] text-[#FCA5A5] transition hover:bg-[rgba(239,68,68,0.08)]"
        >
          Disconnect wallet
        </button>
      </div>
    </section>
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
  fallbackValue,
  deferUntilMounted = false,
}: {
  iconColor: string;
  label: string;
  value: string;
  fallbackValue?: string;
  deferUntilMounted?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const renderedValue =
    deferUntilMounted && !mounted ? (fallbackValue ?? "Not connected") : value;
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5">
      <span className={`h-1.5 w-1.5 rounded-full ${iconColor}`} />
      {label}: {renderedValue}
    </span>
  );
}
