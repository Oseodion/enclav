"use client";

import Link from "next/link";
import {
  Activity,
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  ExternalLink,
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
import { ethers } from "ethers";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { WalletConnect } from "@/components/ui/WalletConnect";
import {
  depositCredits,
  formatOgFromWei,
  getCreditsBalance,
  getCreditsContractAddress,
  SCAN_CREDIT_COST_WEI,
  withdrawCredits,
  withdrawCreditsAmount,
} from "@/lib/0g/credits";
import {
  ensureWalletOnAristotleMainnet,
  INFT_CONTRACT_ADDRESS,
  mintFromWallet,
  type MintScanData,
} from "@/lib/0g/inft";
import { normalizeRepoUrlForMemory } from "@/lib/0g/memory";
import { getAristotleChainId, resolveOgExplorerUrl } from "@/lib/og-env";
import { ogNetworkLabel } from "@/lib/og-network-label";
import { useWallet } from "@/lib/wallet";
import { useAccount, useChainId, useDisconnect, useWalletClient } from "wagmi";

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
  /** Large-repo info — muted line in Live Scan Feed */
  variant?: "info";
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
  /** 0G Storage root hash of long-context memory blob after this scan. */
  memoryRootHash?: string | null;
  tokenId?: string | null;
  txHash?: string | null;
  explorerUrl?: string | null;
};

const panelClass =
  "relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-[0_4px_24px_rgba(0,0,0,0.35)] backdrop-blur-[20px] before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent before:content-['']";
/** Display strings aligned with on-chain SCAN_CREDIT_COST_WEI (0.05 OG) and typical mint gas. */
const COST_LABEL_SCAN_OG = "0.05";
const COST_LABEL_MINT_GAS_OG = "0.001";

function scansRemainingCount(balanceWei: bigint): bigint {
  return balanceWei / SCAN_CREDIT_COST_WEI;
}

function CreditsDepositModal({
  open,
  onClose,
  balanceLabel,
  depositOg,
  onDepositOgChange,
  onDeposit,
  depositBusy,
  errorMessage,
}: {
  open: boolean;
  onClose: () => void;
  balanceLabel: string;
  depositOg: string;
  onDepositOgChange: (value: string) => void;
  onDeposit: () => void;
  depositBusy: boolean;
  errorMessage: string | null;
}) {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const networkName = ogNetworkLabel(chainId);
  const aristotleChainId = useMemo(() => getAristotleChainId(), []);
  const onAristotleMainnet = chainId === aristotleChainId;
  const [switchNetworkBusy, setSwitchNetworkBusy] = useState(false);
  const [switchNetworkError, setSwitchNetworkError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      console.log("[CreditsDepositModal] wagmi chainId", chainId);
    }
  }, [open, chainId]);

  useEffect(() => {
    if (open) {
      setSwitchNetworkError(null);
    }
  }, [open]);

  const handleSwitchToAristotle = async () => {
    setSwitchNetworkError(null);
    const injected =
      typeof window !== "undefined"
        ? (window as Window & { ethereum?: ethers.Eip1193Provider }).ethereum
        : undefined;
    if (!injected) {
      setSwitchNetworkError("No injected wallet found.");
      return;
    }
    setSwitchNetworkBusy(true);
    try {
      await ensureWalletOnAristotleMainnet(injected);
    } catch (e) {
      setSwitchNetworkError(e instanceof Error ? e.message : "Could not switch network.");
    } finally {
      setSwitchNetworkBusy(false);
    }
  };

  const depositDisabled =
    depositBusy || !isConnected || !onAristotleMainnet || switchNetworkBusy;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/70 p-4 pb-8 backdrop-blur-sm sm:items-center sm:pb-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="credits-modal-title"
      onClick={() => onClose()}
    >
      <div
        className="max-h-[min(90dvh,640px)] w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-[#0c0a12] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.65)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id="credits-modal-title" className="font-geist text-lg font-semibold text-[#F0EEF8]">
            Add scan credits
          </h2>
          <button
            type="button"
            onClick={() => onClose()}
            className="rounded-lg border border-white/10 p-1.5 text-[#9B99B0] transition hover:bg-white/5 hover:text-[#F0EEF8]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mb-3 font-mono text-[10px] text-[#6B6880]">
          Deposit native OG on {networkName}
        </p>
        <p className="mb-3 font-mono text-[10px] text-[#9B99B0]">
          1 scan = {COST_LABEL_SCAN_OG} OG · ~10 scans per 0.5 OG
        </p>
        <p className="mb-3 font-mono text-xs text-[#9B99B0]">
          Current balance: <span className="text-[#6EE7B7]">{balanceLabel} OG</span>
        </p>
        {isConnected && !onAristotleMainnet ? (
          <div className="mb-4 rounded-lg border border-[rgba(251,191,36,0.35)] bg-[rgba(251,191,36,0.08)] px-3 py-2.5">
            <p className="mb-2 font-mono text-[11px] leading-relaxed text-[#FDE68A]">
              You are on {networkName}. Switch to 0G Aristotle Mainnet to deposit credits.
            </p>
            <button
              type="button"
              onClick={() => void handleSwitchToAristotle()}
              disabled={switchNetworkBusy}
              className="rounded-full border border-[rgba(251,191,36,0.5)] bg-[rgba(245,158,11,0.2)] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.06em] text-[#FDE68A] transition hover:bg-[rgba(245,158,11,0.3)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {switchNetworkBusy ? "Confirm in wallet…" : "Switch Network"}
            </button>
            {switchNetworkError ? (
              <p className="mt-2 font-mono text-[10px] text-[#FCA5A5]">{switchNetworkError}</p>
            ) : null}
          </div>
        ) : null}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label
              htmlFor="deposit-og-amount"
              className="mb-1 block font-mono text-[10px] uppercase tracking-[0.08em] text-[#9B99B0]"
            >
              Amount (OG)
            </label>
            <input
              id="deposit-og-amount"
              type="text"
              inputMode="decimal"
              value={depositOg}
              onChange={(e) => onDepositOgChange(e.target.value)}
              disabled={depositBusy}
              className="w-full rounded-lg border border-white/10 bg-[rgba(255,255,255,0.05)] px-3 py-2 font-mono text-sm text-[#F0EEF8] outline-none focus:border-[#A78BFA]/50 disabled:opacity-60"
            />
          </div>
          <button
            type="button"
            onClick={() => void onDeposit()}
            disabled={depositDisabled}
            className="min-h-[44px] shrink-0 rounded-full border border-[rgba(167,139,250,0.55)] bg-[rgba(124,58,237,0.45)] px-5 py-2.5 font-mono text-xs uppercase tracking-[0.06em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] transition hover:bg-[rgba(124,58,237,0.6)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {depositBusy ? "Confirm in wallet…" : "DEPOSIT OG"}
          </button>
        </div>
        {!isConnected ? (
          <p className="mt-2 font-mono text-[11px] text-[#9B99B0]">Connect a wallet first.</p>
        ) : null}
        {errorMessage ? (
          <p className="mt-2 font-mono text-[11px] text-[#FCA5A5]">{errorMessage}</p>
        ) : null}
        <p className="mt-4 font-mono text-[10px] text-[#5A5768]">
          AI-assisted findings · Always verify with your security team
        </p>
      </div>
    </div>
  );
}
const SCAN_HISTORY_KEY = "enclav-scan-history-v1";
const getWalletHistoryKey = (walletAddress?: string) =>
  walletAddress ? `${SCAN_HISTORY_KEY}:${walletAddress.toLowerCase()}` : null;

export default function DashboardPage() {
  const { address, isConnected } = useWallet();
  const [clientWalletMounted, setClientWalletMounted] = useState(false);
  useEffect(() => {
    setClientWalletMounted(true);
  }, []);
  const walletUiReady = clientWalletMounted;
  const effectiveConnected = walletUiReady && isConnected;
  const effectiveAddress = walletUiReady ? (address ?? null) : null;
  const chainId = useChainId();
  const connectedChainName = ogNetworkLabel(chainId);
  const { data: walletClient } = useWalletClient();
  const { disconnect } = useDisconnect();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("scanner");
  const [contractCopied, setContractCopied] = useState(false);
  const [repoUrl, setRepoUrl] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [scanNoticeDismissed, setScanNoticeDismissed] = useState(false);
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

  useEffect(() => {
    if (!isScanning) {
      setScanNoticeDismissed(false);
    }
  }, [isScanning]);
  const [scanNotices, setScanNotices] = useState<ScanNotice[]>([]);
  const [latestScanData, setLatestScanData] = useState<MintScanData | null>(null);
  const [scanHistory, setScanHistory] = useState<ScanHistoryEntry[]>([]);
  const [scannedFiles, setScannedFiles] = useState(0);
  const [totalFiles, setTotalFiles] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [mintedTokenId, setMintedTokenId] = useState<string | null>(null);
  const [hasMinted, setHasMinted] = useState(false);
  const [certificateExplorerUrl, setCertificateExplorerUrl] = useState<string | null>(null);
  const [mintStatus, setMintStatus] = useState<
    "idle" | "awaiting_wallet" | "minting" | "success" | "cancelled" | "error"
  >("idle");
  const [mintStatusMessage, setMintStatusMessage] = useState<string | null>(null);
  const scanLocked = isScanning;

  const creditsContractConfigured = getCreditsContractAddress().length > 0;
  const [scanCreditsWei, setScanCreditsWei] = useState<bigint | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(false);
  const [creditsError, setCreditsError] = useState<string | null>(null);
  const [creditsActionError, setCreditsActionError] = useState<string | null>(null);
  const [depositCreditsOg, setDepositCreditsOg] = useState("0.5");
  const [depositBusy, setDepositBusy] = useState(false);
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  const [creditsModalOpen, setCreditsModalOpen] = useState(false);
  const [withdrawCreditsOg, setWithdrawCreditsOg] = useState("");

  const refreshCredits = useCallback(async () => {
    if (!address || !isConnected) {
      setScanCreditsWei(null);
      setCreditsError(null);
      return;
    }
    const contractAddr = getCreditsContractAddress();
    if (!contractAddr) {
      setScanCreditsWei(null);
      setCreditsError(null);
      return;
    }
    setCreditsLoading(true);
    setCreditsError(null);
    try {
      const b = await getCreditsBalance(address);
      setScanCreditsWei(b);
    } catch (e) {
      setCreditsError(e instanceof Error ? e.message : "Failed to load scan credits.");
      setScanCreditsWei(null);
    } finally {
      setCreditsLoading(false);
    }
  }, [address, isConnected]);

  useEffect(() => {
    if (!walletUiReady) return;
    void refreshCredits();
  }, [walletUiReady, refreshCredits]);

  useEffect(() => {
    if (!walletUiReady) return;
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
        setScanHistory(Array.isArray(parsed) ? parsed.slice(0, 15) : []);
        return;
      }

      // One-time migration from legacy global key.
      const legacyRaw = localStorage.getItem(SCAN_HISTORY_KEY);
      if (legacyRaw) {
        const parsedLegacy = JSON.parse(legacyRaw) as ScanHistoryEntry[];
        const migrated = Array.isArray(parsedLegacy) ? parsedLegacy.slice(0, 15) : [];
        localStorage.setItem(walletHistoryKey, JSON.stringify(migrated));
        setScanHistory(migrated);
        return;
      }

      setScanHistory([]);
    } catch {
      setScanHistory([]);
    }
  }, [walletUiReady, address, isConnected]);

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

  const progressPercent =
    totalFiles > 0 ? Math.round((scannedFiles / totalFiles) * 100) : 0;
  const estimatedSeconds =
    totalFiles > 0 ? Math.round((totalFiles / 3) * 45 + 30) : null;
  const estimatedMinutes =
    estimatedSeconds !== null ? Math.max(1, Math.round(estimatedSeconds / 60)) : null;

  useEffect(() => {
    if (!isScanning) {
      setElapsedSeconds(0);
      return;
    }
    const id = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [isScanning]);

  const needsCreditsDeposit =
    effectiveConnected &&
    creditsContractConfigured &&
    !creditsLoading &&
    scanCreditsWei !== null &&
    scanCreditsWei === BigInt(0);
  const creditsReadFailed =
    effectiveConnected && creditsContractConfigured && !creditsLoading && creditsError !== null;
  const showScanInputRow =
    !effectiveConnected || !creditsContractConfigured || !creditsReadFailed;

  const handleDepositCredits = async () => {
    if (!effectiveConnected || !address) {
      setCreditsActionError("Connect a wallet first.");
      return;
    }
    setCreditsActionError(null);
    setDepositBusy(true);
    try {
      const raw = depositCreditsOg.trim() || "0";
      const wei = ethers.parseEther(raw);
      if (wei <= BigInt(0)) {
        setCreditsActionError("Enter a positive OG amount.");
        return;
      }
      await depositCredits(walletClient, wei, { wagmiChainId: chainId });
      await refreshCredits();
      setCreditsModalOpen(false);
    } catch (e) {
      setCreditsActionError(e instanceof Error ? e.message : "Deposit failed.");
    } finally {
      setDepositBusy(false);
    }
  };

  const handleWithdrawCreditsAll = async () => {
    if (!effectiveConnected || !address) {
      setCreditsActionError("Connect a wallet first.");
      return;
    }
    setCreditsActionError(null);
    setWithdrawBusy(true);
    try {
      await withdrawCredits(walletClient, { wagmiChainId: chainId });
      setWithdrawCreditsOg("");
      await refreshCredits();
    } catch (e) {
      setCreditsActionError(e instanceof Error ? e.message : "Withdraw failed.");
    } finally {
      setWithdrawBusy(false);
    }
  };

  const handleWithdrawCreditsPartial = async () => {
    if (!effectiveConnected || !address) {
      setCreditsActionError("Connect a wallet first.");
      return;
    }
    setCreditsActionError(null);
    setWithdrawBusy(true);
    try {
      const raw = withdrawCreditsOg.trim() || "0";
      const wei = ethers.parseEther(raw);
      if (wei <= BigInt(0)) {
        setCreditsActionError("Enter a positive OG amount to withdraw.");
        return;
      }
      if (scanCreditsWei !== null && wei > scanCreditsWei) {
        setCreditsActionError("Amount exceeds your credit balance.");
        return;
      }
      await withdrawCreditsAmount(walletClient, wei, { wagmiChainId: chainId });
      setWithdrawCreditsOg("");
      await refreshCredits();
    } catch (e) {
      setCreditsActionError(e instanceof Error ? e.message : "Withdraw failed.");
    } finally {
      setWithdrawBusy(false);
    }
  };

  const mostRecentFindings = effectiveConnected
    ? findings.length > 0
      ? findings
      : (scanHistory[0]?.findings ?? [])
    : [];

  const saveCompletedScanToHistory = (scanData: MintScanData, scanFindings: Finding[]) => {
    const walletHistoryKey = getWalletHistoryKey(address);
    if (!walletHistoryKey) return;
    const entry: ScanHistoryEntry = {
      id: `scan-${scanData.scanDate}-${encodeURIComponent(scanData.repoUrl)}`,
      repoUrl: scanData.repoUrl,
      scanDate: scanData.scanDate,
      filesScanned: scanData.filesScanned,
      totalFindings: scanData.totalFindings,
      criticalCount: scanData.criticalCount,
      highCount: scanData.highCount,
      mediumCount: scanData.mediumCount,
      lowCount: scanData.lowCount,
      reportHash: scanData.reportHash,
      findings: scanFindings.map((f) => ({ ...f })),
      memoryRootHash: scanData.memoryRootHash ?? null,
      tokenId: null,
      txHash: null,
      explorerUrl: null,
    };
    setScanHistory((prev) => {
      const filtered = prev.filter(
        (e) => !(e.repoUrl === entry.repoUrl && e.scanDate === entry.scanDate),
      );
      const next = [entry, ...filtered].slice(0, 15);
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
    setElapsedSeconds(0);
    setIsScanning(true);

    const normRepo = normalizeRepoUrlForMemory(trimmedRepoUrl);
    const priorMemory = scanHistory
      .filter(
        (e) =>
          normalizeRepoUrlForMemory(e.repoUrl) === normRepo &&
          typeof e.memoryRootHash === "string" &&
          e.memoryRootHash.length > 0,
      )
      .sort(
        (a, b) =>
          new Date(b.scanDate).getTime() - new Date(a.scanDate).getTime(),
      )[0];
    const previousMemoryRootHash = priorMemory?.memoryRootHash ?? undefined;

    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoUrl: trimmedRepoUrl,
          walletAddress: address,
          ...(previousMemoryRootHash
            ? { previousMemoryRootHash }
            : {}),
        }),
      });

      if (response.status === 402) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        await refreshCredits();
        throw new Error(
          payload.error ?? "Insufficient scan credits — add credits to continue",
        );
      }

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
            | {
                type: "memory";
                previousFindingCount: number;
                message: string;
              }
            | { type: "error"; message: string }
            | { type: "notice"; message: string };

          if (event.type === "notice") {
            setScanNotices((prev) => [
              {
                id: `notice-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                message: event.message,
                variant: "info",
              },
              ...prev.slice(0, 8),
            ]);
          }

          if (event.type === "memory") {
            setScanLogs((prev) => [event.message, ...prev.slice(0, 8)]);
            setScanNotices((prev) => [
              {
                id: `memory-${Date.now()}`,
                message: event.message,
              },
              ...prev.slice(0, 8),
            ]);
          }

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
            saveCompletedScanToHistory(event.scanData, streamedFindings);
            void refreshCredits();
            setScanLogs((prev) => [
              `Scan complete. ${event.totalFindings} findings detected.`,
              ...prev.slice(0, 6),
            ]);
          }

          if (event.type === "error") {
            const lowerMessage = event.message.toLowerCase();
            const isRateLimitNotice =
              event.message.includes(":") &&
              (lowerMessage.includes("rate") ||
                event.message.includes("Scan failed for this file"));
            if (isRateLimitNotice) {
              const [filePath] = event.message.split(":");
              setScanNotices((prev) => [
                {
                  id: `${Date.now()}-${filePath}`,
                  message: `⚠ ${filePath} - rate limited, skipped`,
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
      setMintStatusMessage(
        `Minting costs ~${COST_LABEL_MINT_GAS_OG} OG in gas fees. Confirm in MetaMask…`,
      );
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
          setCertificateExplorerUrl(`${resolveOgExplorerUrl()}/tx/${txHash}`);
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
        const walletHistoryKey = getWalletHistoryKey(address);
        if (walletHistoryKey) {
          setScanHistory((prev) => {
            const idx = prev.findIndex(
              (e) =>
                e.repoUrl === latestScanData.repoUrl &&
                e.scanDate === latestScanData.scanDate,
            );
            let next: ScanHistoryEntry[];
            if (idx >= 0) {
              next = [...prev];
              next[idx] = {
                ...next[idx],
                tokenId: result.tokenId,
                txHash: result.txHash,
                explorerUrl: result.explorerUrl,
              };
            } else {
              next = [
                {
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
                  memoryRootHash: latestScanData.memoryRootHash ?? null,
                  tokenId: result.tokenId,
                  txHash: result.txHash,
                  explorerUrl: result.explorerUrl,
                },
                ...prev,
              ].slice(0, 15);
            }
            localStorage.setItem(walletHistoryKey, JSON.stringify(next.slice(0, 15)));
            return next;
          });
        }
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
    <main className="relative flex min-h-dvh h-[100dvh] flex-col overflow-x-hidden overflow-y-visible bg-black pb-[calc(env(safe-area-inset-bottom,0px)+5.5rem)] font-geist text-[#F0EEF8]">
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

        <div className="ml-auto flex shrink-0 items-center gap-2 overflow-visible">
          {effectiveConnected && creditsContractConfigured ? (
            <div
              className="hidden max-w-[8.5rem] truncate rounded-full border border-[rgba(167,139,250,0.25)] bg-[rgba(124,58,237,0.12)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.06em] text-[#D4C4FF] sm:inline-flex sm:max-w-none sm:px-2.5 sm:py-1 sm:text-[10px]"
              title="On-chain scan credit balance"
            >
              Credits:{" "}
              {creditsLoading
                ? "…"
                : scanCreditsWei !== null
                  ? `${formatOgFromWei(scanCreditsWei, 2)} OG`
                  : "—"}
            </div>
          ) : null}
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
        <div className="flex max-w-full items-center gap-2.5 overflow-x-auto overflow-y-hidden whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button type="button" disabled={scanLocked} onClick={() => handleTabChange("scanner")} className={`min-h-[44px] shrink-0 rounded-lg border px-4 py-2.5 text-xs disabled:cursor-not-allowed disabled:opacity-50 ${activeTab === "scanner" ? "border-[rgba(124,58,237,0.55)] bg-[rgba(124,58,237,0.24)] text-[#F0EEF8]" : "border-white/10 text-[#9B99B0]"}`}>Scanner</button>
          <button type="button" disabled={scanLocked} onClick={() => handleTabChange("findings")} className={`min-h-[44px] shrink-0 rounded-lg border px-4 py-2.5 text-xs disabled:cursor-not-allowed disabled:opacity-50 ${activeTab === "findings" ? "border-[rgba(124,58,237,0.55)] bg-[rgba(124,58,237,0.24)] text-[#F0EEF8]" : "border-white/10 text-[#9B99B0]"}`}>Findings</button>
          <button type="button" disabled={scanLocked} onClick={() => handleTabChange("history")} className={`min-h-[44px] shrink-0 rounded-lg border px-4 py-2.5 text-xs disabled:cursor-not-allowed disabled:opacity-50 ${activeTab === "history" ? "border-[rgba(124,58,237,0.55)] bg-[rgba(124,58,237,0.24)] text-[#F0EEF8]" : "border-white/10 text-[#9B99B0]"}`}>History</button>
          <button type="button" disabled={scanLocked} onClick={() => handleTabChange("settings")} className={`min-h-[44px] shrink-0 rounded-lg border px-4 py-2.5 text-xs disabled:cursor-not-allowed disabled:opacity-50 ${activeTab === "settings" ? "border-[rgba(124,58,237,0.55)] bg-[rgba(124,58,237,0.24)] text-[#F0EEF8]" : "border-white/10 text-[#9B99B0]"}`}>Settings</button>
          <Link onClick={guardNavigation} href="/agent-id" className={`inline-flex min-h-[44px] shrink-0 items-center rounded-lg border px-4 py-2.5 text-xs ${scanLocked ? "cursor-not-allowed border-white/5 text-[#4A475C]" : "border-white/10 text-[#F0EEF8]"}`}>Certificate</Link>
        </div>
      </div>
      {mobileMenuOpen ? (
        <div className="relative z-20 overflow-visible border-b border-white/10 bg-black/95 px-4 py-3 md:hidden">
          <div className="flex items-center justify-between gap-3 overflow-visible">
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

      <div className="relative z-[1] flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-4 pb-2 pt-4 md:px-3 md:pb-2 md:pt-3">
          <div className={`${panelClass} sticky top-0 z-10 mb-4 max-w-full shrink-0 overflow-hidden p-4 md:mb-3 md:p-3`}>
            {effectiveConnected && creditsContractConfigured && creditsReadFailed ? (
              <div className="mb-3 rounded-lg border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.08)] p-3">
                <p className="font-mono text-[11px] text-[#FCA5A5]">{creditsError}</p>
                <button
                  type="button"
                  onClick={() => void refreshCredits()}
                  className="mt-2 rounded-full border border-white/15 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.06em] text-[#E9E4FF] hover:bg-white/5"
                >
                  Retry
                </button>
              </div>
            ) : null}
            {effectiveConnected && !creditsContractConfigured ? (
              <p className="mb-3 font-mono text-[11px] text-[#FDE68A]">
                Scan credits contract is not configured (set NEXT_PUBLIC_CREDITS_CONTRACT_ADDRESS).
              </p>
            ) : null}
            {showScanInputRow ? (
              <>
                <div
                  className={
                    isScanning
                      ? "rounded-2xl p-[1px] animate-shimmer [background:linear-gradient(120deg,rgba(167,139,250,0.55),rgba(124,58,237,0.38),rgba(236,72,153,0.42),rgba(167,139,250,0.55))] bg-[length:200%_200%]"
                      : "rounded-2xl border border-white/[0.09]"
                  }
                >
                  <div
                    className={`rounded-2xl bg-[rgba(6,4,12,0.92)] p-1.5 md:p-1 ${
                      isScanning ? "md:rounded-[14px]" : ""
                    }`}
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:gap-2">
                      <div className="relative min-w-0 flex-1">
                        <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9B99B0]" />
                        <input
                          value={repoUrl}
                          onChange={(e) => setRepoUrl(e.target.value)}
                          disabled={isScanning}
                          placeholder="Paste GitHub repo URL to begin scan..."
                          className="w-full min-h-[48px] min-w-0 rounded-full border border-white/10 bg-[rgba(255,255,255,0.05)] py-3 pl-10 pr-4 text-sm text-[#F0EEF8] outline-none ring-purple/0 transition placeholder:text-[#9B99B0] focus:border-[#A78BFA]/50 focus:ring-2 focus:ring-[#7C3AED]/40 disabled:cursor-not-allowed disabled:opacity-60 md:min-h-0 md:py-2"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => void startScan()}
                        disabled={
                          isScanning ||
                          creditsReadFailed ||
                          (Boolean(effectiveConnected && creditsContractConfigured && creditsLoading)) ||
                          (needsCreditsDeposit && creditsContractConfigured && effectiveConnected)
                        }
                        className="flex w-full min-h-[48px] shrink-0 items-center justify-center gap-2 rounded-full border border-[rgba(167,139,250,0.5)] bg-[rgba(124,58,237,0.3)] px-5 py-2.5 font-mono text-xs uppercase tracking-[0.06em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_0_20px_rgba(124,58,237,0.2)] backdrop-blur-[10px] transition hover:bg-[rgba(124,58,237,0.45)] disabled:cursor-not-allowed disabled:opacity-60 md:min-h-0 md:w-auto md:py-2"
                      >
                        {isScanning ? (
                          <>
                            <span
                              className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-[#C4B5FD] shadow-[0_0_10px_rgba(167,139,250,0.9)]"
                              aria-hidden
                            />
                            <span>Scanning...</span>
                          </>
                        ) : (
                          "Start Scan"
                        )}
                      </button>
                    </div>
                  </div>
                </div>
                {effectiveConnected && creditsContractConfigured && creditsLoading ? (
                  <p className="mt-2 truncate font-mono text-[10px] text-[#6B6880] sm:text-[11px]">
                    Loading credit balance…
                  </p>
                ) : needsCreditsDeposit ? (
                  <div className="mt-2 flex min-w-0 flex-wrap items-center justify-between gap-2">
                    <p className="min-w-0 truncate font-mono text-[10px] text-[#6B6880] sm:text-[11px]">
                      No credits - add OG to scan
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setCreditsActionError(null);
                        setCreditsModalOpen(true);
                      }}
                      className="shrink-0 rounded-full border border-[rgba(167,139,250,0.45)] bg-[rgba(124,58,237,0.25)] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.06em] text-[#E9E4FF] transition hover:bg-[rgba(124,58,237,0.4)]"
                    >
                      Add Credits
                    </button>
                  </div>
                ) : (
                  <p className="mt-2 font-mono text-[10px] leading-snug text-[#6B6880] sm:text-[11px]">
                    Scan: {COST_LABEL_SCAN_OG} OG · Mint: ~{COST_LABEL_MINT_GAS_OG} OG · Credits refundable · Supports
                    public GitHub repos
                  </p>
                )}
              </>
            ) : null}
            {scanCompleted && latestScanData && !hasMinted ? (
              <div
                className="mt-3 rounded-xl border border-[rgba(167,139,250,0.45)] bg-[rgba(124,58,237,0.1)] px-4 py-3 text-[#E6DBFF]"
                style={{ animation: "borderPulse 2s ease-in-out infinite" }}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2 text-xs">
                    <ShieldCheck className="h-4 w-4 animate-pulse text-[#A78BFA]" />
                    <span className="break-words font-medium">
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
                        !effectiveConnected
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
                  <span className="min-w-0 break-words">
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
              <p className="mt-2 break-words font-mono text-[11px] text-[#EF4444]">{scanError}</p>
            ) : null}
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {activeTab === "scanner" ? (
            <div
              className={`grid h-full min-h-0 min-w-0 flex-1 auto-rows-[minmax(0,1fr)] grid-cols-1 gap-4 overflow-hidden md:gap-3 lg:grid-cols-[1.2fr_0.9fr_280px] ${
                isScanning
                  ? "rounded-2xl border border-transparent bg-[linear-gradient(rgba(0,0,0,0.75),rgba(0,0,0,0.75))_padding-box,linear-gradient(120deg,#A78BFA,#7C3AED,#EC4899)_border-box] p-[1px] animate-pulse"
                  : ""
              }`}
            >
              <LiveScanFeed findings={findings} notices={scanNotices} isScanning={isScanning} />
              <ScanStatus
                className="max-md:hidden"
                currentFile={currentFile}
                scannedFiles={scannedFiles}
                totalFiles={totalFiles}
                progressPercent={progressPercent}
                logs={scanLogs}
                isScanning={isScanning}
                scanCompleted={scanCompleted}
                estimatedMinutes={estimatedMinutes}
                elapsedSeconds={elapsedSeconds}
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
              canView={effectiveConnected}
            />
          ) : null}
          {activeTab === "history" ? (
            <HistoryTab
              history={scanHistory}
              canView={effectiveConnected}
              onGoToScanner={() => handleTabChange("scanner")}
            />
          ) : null}
          {activeTab === "settings" ? (
            <SettingsTab
              address={effectiveAddress}
              isConnected={effectiveConnected}
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
              creditsContractConfigured={creditsContractConfigured}
              scanCreditsWei={scanCreditsWei}
              creditsLoading={creditsLoading}
              creditsError={creditsError}
              depositCreditsOg={depositCreditsOg}
              onDepositCreditsOgChange={setDepositCreditsOg}
              onRefreshCredits={() => void refreshCredits()}
              depositBusy={depositBusy}
              withdrawBusy={withdrawBusy}
              onDepositCredits={() => void handleDepositCredits()}
              withdrawCreditsOg={withdrawCreditsOg}
              onWithdrawCreditsOgChange={setWithdrawCreditsOg}
              onWithdrawCreditsPartial={() => void handleWithdrawCreditsPartial()}
              onWithdrawCreditsAll={() => void handleWithdrawCreditsAll()}
              creditsActionError={creditsActionError}
            />
          ) : null}
          </div>
        </section>
      </div>

      <div className="pointer-events-none fixed bottom-0 left-0 right-0 z-[15] px-4 pb-4 md:px-3 md:pb-3">
        <div className="pointer-events-none relative mx-auto w-full max-w-[calc(100vw-2rem)] md:max-w-none">
          {isScanning && !scanNoticeDismissed ? (
            <div
              className="pointer-events-auto absolute bottom-full left-1/2 z-[20] mb-2 w-[min(100%,24rem)] -translate-x-1/2"
              role="dialog"
              aria-labelledby="scan-notice-title"
              aria-live="polite"
            >
              <div className="scan-notice-enter relative rounded-2xl border border-[rgba(234,179,8,0.45)] bg-[rgba(35,28,10,0.97)] px-3.5 py-3 pr-11 font-mono text-[11px] leading-snug text-[#FDE68A] shadow-[0_8px_40px_rgba(0,0,0,0.55)] backdrop-blur-md">
                <button
                  type="button"
                  onClick={() => setScanNoticeDismissed(true)}
                  className="absolute right-2 top-2 rounded-lg p-1 text-[#FDE68A]/75 transition hover:bg-white/10 hover:text-[#FDE68A]"
                  aria-label="Dismiss scan notice"
                >
                  <X className="h-4 w-4" strokeWidth={2} />
                </button>
                <div className="flex gap-2.5">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#FBBF24]" strokeWidth={2} aria-hidden />
                  <p id="scan-notice-title" className="min-w-0 text-balance">
                    Scan in progress - do not navigate away or the scan will stop
                  </p>
                </div>
              </div>
            </div>
          ) : null}
          <footer
            className={`${panelClass} pointer-events-auto relative z-[5] mx-auto flex min-h-[44px] w-full flex-wrap items-center gap-x-4 gap-y-2 overflow-hidden rounded-xl bg-[rgba(255,255,255,0.02)] px-4 py-3 font-mono text-[10px] text-[#9B99B0] md:py-2`}
          >
            <StatusItem iconColor="bg-[#7C3AED]" label="0G Chain" value={connectedChainName} />
            <StatusItem
              iconColor={isScanning ? "bg-[#10B981]" : "bg-[#6B7280]"}
              label="Inference"
              value={isScanning ? "Running" : "Idle"}
            />
          </footer>
        </div>
      </div>
      <CreditsDepositModal
        open={creditsModalOpen}
        onClose={() => setCreditsModalOpen(false)}
        balanceLabel={scanCreditsWei !== null ? formatOgFromWei(scanCreditsWei) : "0"}
        depositOg={depositCreditsOg}
        onDepositOgChange={setDepositCreditsOg}
        onDeposit={() => void handleDepositCredits()}
        depositBusy={depositBusy}
        errorMessage={creditsActionError}
      />
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
        @keyframes scanNoticeSlideUp {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .scan-notice-enter {
          animation: scanNoticeSlideUp 0.22s ease-out both;
        }
      `}</style>
    </main>
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

/** e.g. "May 3, 2026 · 9:35 PM · 21 files scanned" */
function formatHistoryCardMeta(iso: string, filesScanned: number): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return `${iso} · ${filesScanned} files scanned`;
    const datePart = d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const timePart = d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    return `${datePart} · ${timePart} · ${filesScanned} files scanned`;
  } catch {
    return `${iso} · ${filesScanned} files scanned`;
  }
}

function HistorySeverityBadges({ item }: { item: ScanHistoryEntry }) {
  const hasAnyFinding =
    item.criticalCount > 0 ||
    item.highCount > 0 ||
    item.mediumCount > 0 ||
    item.lowCount > 0;

  if (!hasAnyFinding) {
    return (
      <span className="inline-flex rounded-full border border-[rgba(16,185,129,0.35)] bg-[rgba(16,185,129,0.12)] px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.04em] text-[#6EE7B7]">
        No issues found
      </span>
    );
  }

  const pills: { label: string; count: number; className: string }[] = [];
  if (item.criticalCount > 0) {
    pills.push({
      label: "Critical",
      count: item.criticalCount,
      className: "border-[rgba(248,113,113,0.4)] bg-[rgba(239,68,68,0.15)] text-[#FCA5A5]",
    });
  }
  if (item.highCount > 0) {
    pills.push({
      label: "High",
      count: item.highCount,
      className: "border-[rgba(251,146,60,0.45)] bg-[rgba(249,115,22,0.14)] text-[#FDBA74]",
    });
  }
  if (item.mediumCount > 0) {
    pills.push({
      label: "Medium",
      count: item.mediumCount,
      className: "border-[rgba(250,204,21,0.35)] bg-[rgba(234,179,8,0.12)] text-[#FDE68A]",
    });
  }
  if (item.lowCount > 0) {
    pills.push({
      label: "Low",
      count: item.lowCount,
      className: "border-[rgba(96,165,250,0.4)] bg-[rgba(59,130,246,0.14)] text-[#93C5FD]",
    });
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {pills.map((p) => (
        <span
          key={p.label}
          className={`inline-flex rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.04em] ${p.className}`}
        >
          {p.label} {p.count}
        </span>
      ))}
    </div>
  );
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
    <section className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[rgba(0,0,0,0.4)] shadow-[0_10px_30px_rgba(14,10,30,0.45)] backdrop-blur-[20px] before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent before:content-['']">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3.5 sm:px-5">
        <div className="flex items-center gap-2">
          <ScanSearch className="h-4 w-4 text-[#7C3AED]" />
          <h3 className="text-[15px] font-semibold text-[#E9E4FF] sm:text-base">Live Scan Feed</h3>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#9B99B0]">
          {isScanning ? "Scanning" : "Ready"}
        </span>
      </div>

      <div className="flex shrink-0 items-start gap-2 border-b border-white/[0.06] px-4 py-2 sm:px-5">
        <Info className="mt-0.5 h-3 w-3 shrink-0 text-[#5A5768]" strokeWidth={1.5} aria-hidden />
        <p className="font-mono text-[10px] leading-snug text-[#6B6880]">
          AI-assisted findings · Always verify with your security team
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 pb-24 sm:p-5 sm:pb-28 [scrollbar-width:thin] [scrollbar-color:rgba(139,92,246,0.4)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[rgba(139,92,246,0.4)] [&::-webkit-scrollbar-track]:bg-transparent">
        {notices.map((notice) => (
          <div
            key={notice.id}
            className={
              notice.variant === "info"
                ? "break-words px-1 py-1 font-mono text-[10px] leading-snug text-[#9B99B0]"
                : "break-words rounded-md border border-white/5 bg-[rgba(255,255,255,0.02)] px-3 py-2 font-mono text-[10px] text-[#2E2C3E]"
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
    <article className="max-w-full overflow-hidden rounded-lg border border-white/10 bg-[rgba(255,255,255,0.04)] px-4 py-4 shadow-[0_8px_20px_rgba(12,10,24,0.35)] sm:px-5 sm:py-4">
      <div className="hidden gap-3 md:grid md:grid-cols-[72px_1fr_auto] md:items-start">
        <div className="w-[72px]">
          <span className={`inline-flex rounded-[4px] px-2 py-[3px] font-mono text-[10px] uppercase tracking-[0.06em] ${badgeStyles[finding.severity]}`}>
            {finding.severity}
          </span>
        </div>

        <div className="min-w-0">
          <p className="break-words text-[14px] font-medium leading-relaxed text-[#F4F2FF]">{finding.description}</p>
        </div>

        <div className="flex flex-col items-end gap-1.5 font-mono text-[11px] text-[#9B99B0] md:text-right">
          <span className="max-w-full truncate" title={`${finding.file}:${finding.line}`}>
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

      <div className="flex flex-col gap-3 md:hidden">
        <span className={`w-fit rounded-[4px] px-2 py-[3px] font-mono text-[10px] uppercase tracking-[0.06em] ${badgeStyles[finding.severity]}`}>
          {finding.severity}
        </span>
        <p className="break-words text-[14px] font-medium leading-relaxed text-[#F4F2FF]">{finding.description}</p>
        <p className="break-all font-mono text-[11px] leading-snug text-[#9B99B0]" title={`${finding.file}:${finding.line}`}>
          {finding.file}:{finding.line}
        </p>
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="w-fit rounded-[6px] border border-[rgba(167,139,250,0.5)] bg-[rgba(124,58,237,0.3)] px-3 py-1.5 text-[10px] text-[#E9E4FF] shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_0_20px_rgba(124,58,237,0.2)] backdrop-blur-[10px] transition hover:bg-[rgba(124,58,237,0.45)] hover:text-white"
        >
          View Fix
        </button>
      </div>

      <div
        className={`overflow-hidden transition-[max-height] duration-300 ease-in-out ${
          expanded ? "max-h-[320px] pt-4" : "max-h-0"
        }`}
      >
        <div className="rounded-md border border-white/10 bg-[rgba(255,255,255,0.03)] p-3">
          <p className="mb-2 break-words text-[12px] leading-[1.6] text-[#9B99B0]">
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
  className,
  currentFile,
  scannedFiles,
  totalFiles,
  progressPercent,
  logs,
  isScanning,
  scanCompleted,
  estimatedMinutes,
  elapsedSeconds,
}: {
  className?: string;
  currentFile: string;
  scannedFiles: number;
  totalFiles: number;
  progressPercent: number;
  logs: string[];
  isScanning: boolean;
  scanCompleted: boolean;
  estimatedMinutes: number | null;
  elapsedSeconds: number;
}) {
  const elapsedLabel = `${Math.floor(elapsedSeconds / 60)
    .toString()
    .padStart(2, "0")}:${(elapsedSeconds % 60).toString().padStart(2, "0")}`;
  return (
    <section className={`${panelClass} flex h-full min-h-0 min-w-0 flex-col overflow-hidden ${className ?? ""}`}>
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3.5 sm:px-5">
        <h3 className="text-[15px] font-semibold text-[#F0EEF8] sm:text-base">Scan Status</h3>
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#9B99B0]">
          {isScanning ? "Running" : scanCompleted ? "Complete" : "Waiting"}
        </span>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 pb-24 sm:p-5 sm:pb-28 [scrollbar-width:thin] [scrollbar-color:rgba(139,92,246,0.35)_transparent] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[rgba(139,92,246,0.35)] [&::-webkit-scrollbar-track]:bg-transparent">
        <div className="rounded-xl border border-white/10 bg-[rgba(255,255,255,0.04)] p-3">
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[#9B99B0]">
            Time
          </p>
          <p className="font-mono text-xs text-[#F0EEF8]">
            {estimatedMinutes ? `Est. ~${estimatedMinutes} min` : "Estimating..."} · Elapsed{" "}
            {elapsedLabel}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-[rgba(255,255,255,0.04)] p-3">
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[#9B99B0]">
            Current file
          </p>
          <p className="break-words font-mono text-xs text-[#F0EEF8]">{currentFile}</p>
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
            <div key={`${log}-${index}`} className="flex min-w-0 items-start gap-2 text-xs text-[#9B99B0]">
              <Timer className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#A78BFA]" />
              <span className="min-w-0 break-words">{log}</span>
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
    <aside className={`${panelClass} hidden h-full min-h-0 min-w-0 flex-col overflow-hidden xl:flex`}>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto [scrollbar-width:thin] [scrollbar-color:rgba(139,92,246,0.35)_transparent] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[rgba(139,92,246,0.35)] [&::-webkit-scrollbar-track]:bg-transparent">
        <div className="shrink-0 border-b border-white/10 p-4">
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

        <div className="shrink-0 border-b border-white/10 p-4">
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

        <div className="shrink-0 p-4">
          <h4 className="mb-3 font-mono text-[10px] uppercase tracking-[0.08em] text-[#9B99B0]">
            Findings Summary
          </h4>
          <SummaryRow label="Critical" count={findingsSummary.Critical} color="bg-[#EF4444]" icon={Siren} />
          <SummaryRow label="High" count={findingsSummary.High} color="bg-[#F97316]" icon={ShieldAlert} />
          <SummaryRow label="Medium" count={findingsSummary.Medium} color="bg-[#EAB308]" icon={TriangleAlert} />
          <SummaryRow label="Low" count={findingsSummary.Low} color="bg-[#3B82F6]" icon={Activity} />
        </div>
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
    <section className={`${panelClass} flex h-full min-h-0 min-w-0 max-w-full flex-col overflow-hidden`}>
      <div className="min-h-0 min-w-0 max-w-full flex-1 overflow-y-auto overflow-x-hidden px-5 pb-24 pt-5 md:px-6 md:pb-28 md:pt-6 [scrollbar-width:thin] [scrollbar-color:rgba(139,92,246,0.35)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[rgba(139,92,246,0.35)] [&::-webkit-scrollbar-track]:bg-transparent">
        <div className="mb-8 min-w-0 max-w-full md:mb-6">
          <h2 className="break-words font-geist text-[22px] font-bold leading-tight tracking-tight text-[#F0EEF8] sm:text-2xl md:text-3xl">
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
  onGoToScanner,
}: {
  history: ScanHistoryEntry[];
  canView: boolean;
  onGoToScanner: () => void;
}) {
  const sortedHistory = useMemo(
    () =>
      [...history].sort(
        (a, b) => new Date(b.scanDate).getTime() - new Date(a.scanDate).getTime(),
      ),
    [history],
  );

  return (
    <section className={`${panelClass} h-full min-h-0 min-w-0 max-w-full overflow-x-hidden overflow-y-auto px-5 pb-24 pt-5 md:px-6 md:pb-28 md:pt-6 [scrollbar-width:thin] [scrollbar-color:rgba(139,92,246,0.35)_transparent]`}>
      <h2 className="mb-8 break-words font-geist text-[22px] font-bold leading-tight tracking-tight text-[#F0EEF8] sm:text-2xl md:mb-6">Scan history</h2>
      {!canView ? (
        <div className="rounded-xl border border-white/10 bg-[rgba(255,255,255,0.04)] p-6 text-sm text-[#9B99B0]">
          Connect your wallet to view scan history.
        </div>
      ) : history.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/15 bg-[rgba(255,255,255,0.02)] px-6 py-16 text-center">
          <Shield className="mb-4 h-10 w-10 text-[#4A475C]" strokeWidth={1.25} />
          <p className="mb-1 max-w-md font-mono text-sm text-[#9B99B0]">Your scan history will appear here</p>
          <button
            type="button"
            onClick={onGoToScanner}
            className="mt-3 inline-flex rounded-full border border-[rgba(167,139,250,0.45)] bg-[rgba(124,58,237,0.25)] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.06em] text-[#E9E4FF] transition hover:bg-[rgba(124,58,237,0.4)]"
          >
            Run a scan to get started
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedHistory.map((item) => {
            const certHref = item.tokenId?.trim()
              ? `/agent-id?tokenId=${encodeURIComponent(item.tokenId.trim())}`
              : "/agent-id";

            return (
              <div
                key={item.id}
                className="flex flex-col gap-3 rounded-2xl border border-white/[0.09] bg-[rgba(255,255,255,0.03)] p-4 transition hover:border-[rgba(167,139,250,0.28)] hover:bg-[rgba(124,58,237,0.06)] md:flex-row md:items-start md:justify-between md:gap-5 md:p-4"
              >
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="truncate font-geist text-[15px] font-semibold tracking-tight text-[#F4F2FF]">
                    {extractRepoDisplayName(item.repoUrl)}
                  </p>
                  <p className="font-mono text-[11px] leading-relaxed text-[#9B99B0]">
                    {formatHistoryCardMeta(item.scanDate, item.filesScanned)}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <HistorySeverityBadges item={item} />
                    {item.tokenId?.trim() ? (
                      <span className="inline-flex rounded-full border border-[rgba(167,139,250,0.45)] bg-[rgba(124,58,237,0.2)] px-2.5 py-0.5 font-mono text-[10px] tracking-tight text-[#DDD6FE]">
                        Token #{item.tokenId.trim()} · ENCLAV
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 md:items-start md:pt-0.5">
                  <Link
                    href={certHref}
                    className="inline-flex w-full items-center justify-center gap-0.5 rounded-full border border-[rgba(167,139,250,0.4)] bg-[rgba(124,58,237,0.18)] px-4 py-2 font-mono text-[11px] text-[#E9E4FF] transition hover:bg-[rgba(124,58,237,0.32)] md:w-auto"
                  >
                    View Certificate
                    <ChevronRight className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
                  </Link>
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
  creditsContractConfigured,
  scanCreditsWei,
  creditsLoading,
  creditsError,
  depositCreditsOg,
  onDepositCreditsOgChange,
  onRefreshCredits,
  depositBusy,
  withdrawBusy,
  onDepositCredits,
  withdrawCreditsOg,
  onWithdrawCreditsOgChange,
  onWithdrawCreditsPartial,
  onWithdrawCreditsAll,
  creditsActionError,
}: {
  address: string | null;
  isConnected: boolean;
  onDisconnect: () => void;
  contractCopied: boolean;
  onCopyContract: () => void | Promise<void>;
  creditsContractConfigured: boolean;
  scanCreditsWei: bigint | null;
  creditsLoading: boolean;
  creditsError: string | null;
  depositCreditsOg: string;
  onDepositCreditsOgChange: (value: string) => void;
  onRefreshCredits: () => void;
  depositBusy: boolean;
  withdrawBusy: boolean;
  onDepositCredits: () => void;
  withdrawCreditsOg: string;
  onWithdrawCreditsOgChange: (value: string) => void;
  onWithdrawCreditsPartial: () => void;
  onWithdrawCreditsAll: () => void;
  creditsActionError: string | null;
}) {
  const settingsChainId = useChainId();
  const settingsNetworkLabel = ogNetworkLabel(settingsChainId);
  const explorerBase = resolveOgExplorerUrl();
  const explorerContractUrl = `${explorerBase}/address/${INFT_CONTRACT_ADDRESS}`;
  const creditsAddr = getCreditsContractAddress();
  const creditsExplorerUrl =
    creditsAddr.length > 0 ? `${explorerBase}/address/${creditsAddr}` : "";

  return (
    <section className={`${panelClass} h-full min-h-0 min-w-0 max-w-full overflow-x-hidden overflow-y-auto px-5 pb-24 pt-5 md:px-6 md:pb-28 md:pt-6`}>
      <h2 className="mb-8 break-words font-geist text-[22px] font-bold leading-tight tracking-tight text-[#F0EEF8] sm:text-2xl md:mb-6">Settings</h2>

      <div className="mb-8 rounded-xl border border-white/10 bg-[rgba(255,255,255,0.04)] p-5 md:mb-6 md:p-4">
        <h3 className="mb-3 font-mono text-[10px] uppercase tracking-[0.12em] text-[#9B99B0]">Scan credits</h3>
        {!creditsContractConfigured ? (
          <p className="font-mono text-[11px] text-[#FDE68A]">
            Set NEXT_PUBLIC_CREDITS_CONTRACT_ADDRESS to enable on-chain credits.
          </p>
        ) : !isConnected ? (
          <p className="font-mono text-[11px] text-[#9B99B0]">Connect your wallet to view or manage credits.</p>
        ) : creditsLoading ? (
          <p className="font-mono text-[11px] text-[#9B99B0]">Loading balance…</p>
        ) : creditsError ? (
          <div>
            <p className="font-mono text-[11px] text-[#FCA5A5]">{creditsError}</p>
            <button
              type="button"
              onClick={onRefreshCredits}
              className="mt-2 rounded-full border border-white/15 px-3 py-1 font-mono text-[10px] uppercase text-[#E9E4FF] hover:bg-white/5"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            <p className="mb-1 font-mono text-xs text-[#C4BDD9]">
              Balance:{" "}
              <span className="text-[#6EE7B7]">
                {scanCreditsWei !== null ? `${formatOgFromWei(scanCreditsWei)} OG` : "—"}
              </span>
            </p>
            <p className="mb-2 font-mono text-[11px] text-[#9B99B0]">
              {scanCreditsWei !== null ? (
                <>
                  ~{scansRemainingCount(scanCreditsWei).toString()} scans remaining (at {COST_LABEL_SCAN_OG} OG each)
                </>
              ) : (
                "— scans remaining"
              )}
            </p>
            <p className="mb-3 font-mono text-[10px] leading-relaxed text-[#6B6880]">
              Each scan: {COST_LABEL_SCAN_OG} OG · Minting: ~{COST_LABEL_MINT_GAS_OG} OG gas
            </p>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="font-mono text-[10px] uppercase text-[#9B99B0]">Credits contract</span>
              <code className="max-w-full truncate rounded border border-white/10 bg-black/40 px-2 py-1 font-mono text-[10px] text-[#E9E4FF]">
                {creditsAddr || "—"}
              </code>
              {creditsExplorerUrl ? (
                <a
                  href={creditsExplorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-mono text-[10px] uppercase text-[#A78BFA] hover:underline"
                >
                  Explorer
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : null}
            </div>
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label
                  htmlFor="settings-deposit-og"
                  className="mb-1 block font-mono text-[10px] uppercase tracking-[0.08em] text-[#9B99B0]"
                >
                  Deposit (OG)
                </label>
                <input
                  id="settings-deposit-og"
                  type="text"
                  inputMode="decimal"
                  value={depositCreditsOg}
                  onChange={(e) => onDepositCreditsOgChange(e.target.value)}
                  disabled={depositBusy}
                  className="w-full rounded-lg border border-white/10 bg-[rgba(255,255,255,0.05)] px-3 py-2 font-mono text-sm text-[#F0EEF8] outline-none focus:border-[#A78BFA]/50 disabled:opacity-60"
                />
              </div>
              <button
                type="button"
                onClick={onDepositCredits}
                disabled={depositBusy}
                className="rounded-full border border-[rgba(167,139,250,0.5)] bg-[rgba(124,58,237,0.35)] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.06em] text-white hover:bg-[rgba(124,58,237,0.5)] disabled:opacity-60"
              >
                {depositBusy ? "Wallet…" : "Deposit OG"}
              </button>
            </div>
            <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="min-w-[8rem] flex-1 sm:max-w-[12rem]">
                <label
                  htmlFor="settings-withdraw-og"
                  className="mb-1 block font-mono text-[10px] uppercase tracking-[0.08em] text-[#9B99B0]"
                >
                  Withdraw (OG)
                </label>
                <div className="flex gap-2">
                  <input
                    id="settings-withdraw-og"
                    type="text"
                    inputMode="decimal"
                    value={withdrawCreditsOg}
                    onChange={(e) => onWithdrawCreditsOgChange(e.target.value)}
                    disabled={withdrawBusy || scanCreditsWei === null || scanCreditsWei === BigInt(0)}
                    placeholder="0"
                    className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[rgba(255,255,255,0.05)] px-3 py-2 font-mono text-sm text-[#F0EEF8] outline-none focus:border-[#A78BFA]/50 disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      onWithdrawCreditsOgChange(
                        scanCreditsWei !== null && scanCreditsWei > BigInt(0)
                          ? formatOgFromWei(scanCreditsWei)
                          : "",
                      )
                    }
                    disabled={
                      withdrawBusy || scanCreditsWei === null || scanCreditsWei === BigInt(0)
                    }
                    className="shrink-0 rounded-lg border border-white/15 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.06em] text-[#A78BFA] hover:bg-white/5 disabled:opacity-40"
                  >
                    Max
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={onWithdrawCreditsPartial}
                disabled={
                  withdrawBusy ||
                  scanCreditsWei === null ||
                  scanCreditsWei === BigInt(0) ||
                  withdrawCreditsOg.trim() === ""
                }
                className="rounded-full border border-white/15 bg-white/5 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.06em] text-[#C4BDD9] hover:bg-white/10 disabled:opacity-40"
              >
                {withdrawBusy ? "Wallet…" : "Withdraw"}
              </button>
            </div>
            <button
              type="button"
              onClick={onWithdrawCreditsAll}
              disabled={withdrawBusy || scanCreditsWei === null || scanCreditsWei === BigInt(0)}
              className="mb-1 rounded-full border border-white/10 bg-transparent px-4 py-2 font-mono text-[10px] uppercase tracking-[0.06em] text-[#9B99B0] hover:border-white/20 hover:bg-white/5 disabled:opacity-40"
            >
              {withdrawBusy ? "Wallet…" : "Withdraw all"}
            </button>
            {creditsActionError ? (
              <p className="font-mono text-[11px] text-[#FCA5A5]">{creditsActionError}</p>
            ) : null}
          </>
        )}
      </div>

      <div className="mb-8 rounded-xl border border-white/10 bg-[rgba(255,255,255,0.04)] p-5 md:mb-6 md:p-4">
        <h3 className="mb-3 font-mono text-[10px] uppercase tracking-[0.12em] text-[#9B99B0]">Network</h3>
        <p className="mb-1 text-sm text-[#F0EEF8]">
          Current network:{" "}
          <span className="font-mono text-[#A78BFA]">{settingsNetworkLabel}</span>
        </p>
        <p className="mb-4 font-mono text-xs text-[#9B99B0]">Chain ID {settingsChainId}</p>

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
      </div>

      <div className="rounded-xl border border-white/10 bg-[rgba(255,255,255,0.04)] p-5 font-mono text-xs md:p-4">
        {isConnected && address ? (
          <>
            <p className="text-[#9B99B0]">
              Wallet: <span className="break-all text-[#F0EEF8]">{address}</span>
            </p>
            <button
              type="button"
              onClick={onDisconnect}
              className="mt-4 rounded-lg border border-[rgba(239,68,68,0.35)] px-3 py-2 text-[10px] uppercase tracking-[0.06em] text-[#FCA5A5] transition hover:bg-[rgba(239,68,68,0.08)]"
            >
              Disconnect wallet
            </button>
          </>
        ) : (
          <p className="text-[#6B6880]">No wallet connected</p>
        )}
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
    <span className="inline-flex max-w-[min(100%,11rem)] min-w-0 shrink items-center gap-1.5 overflow-hidden md:max-w-none">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${iconColor}`} />
      <span className="min-w-0 truncate font-mono">
        {label}: {renderedValue}
      </span>
    </span>
  );
}
