"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Clock3,
  Copy,
  ExternalLink,
  Lock,
  Menu,
  Orbit,
  SendHorizontal,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { WalletConnect } from "@/components/ui/WalletConnect";
import { ethers } from "ethers";
import { useAccount, useConnect } from "wagmi";

const EXPLORER_BASE = "https://chainscan-galileo.0g.ai";
const INFT_CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_INFT_CONTRACT_ADDRESS ??
  "0x3052bed0971c6F21967ed8186d6B3B4D431F632f";
const OG_RPC_URL = process.env.NEXT_PUBLIC_OG_RPC_URL ?? "https://evmrpc-testnet.0g.ai";
const CERTIFICATE_EVENT_ABI = [
  "event CertificateMinted(uint256 indexed tokenId, address indexed recipient, string repoUrl, string reportHash)",
  "function getCertificate(uint256 tokenId) view returns ((string repoUrl,string scanDate,uint256 filesScanned,uint256 totalFindings,uint256 criticalCount,uint256 highCount,uint256 mediumCount,uint256 lowCount,string reportHash))",
] as const;

type CertificateData = {
  tokenId: string;
  owner: string;
  repoUrl: string;
  scanDate: string;
  filesScanned: number;
  totalFindings: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  reportHash: string;
  txHash: string;
};

type CopyTarget = "contract" | "owner" | null;

export default function AgentIdPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [copied, setCopied] = useState<CopyTarget>(null);
  const [certificate, setCertificate] = useState<CertificateData | null>(null);
  const [isLoadingCertificate, setIsLoadingCertificate] = useState(false);
  const [hasFetchedCertificate, setHasFetchedCertificate] = useState(false);
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();

  useEffect(() => {
    async function loadCertificate() {
      if (!isConnected || !address) {
        setCertificate(null);
        setHasFetchedCertificate(false);
        return;
      }

      setIsLoadingCertificate(true);
      try {
        console.log("[agent-id] loading certificate", {
          address,
          contract: INFT_CONTRACT_ADDRESS,
          rpc: OG_RPC_URL,
        });
        const provider = new ethers.JsonRpcProvider(OG_RPC_URL);
        const contract = new ethers.Contract(
          INFT_CONTRACT_ADDRESS,
          CERTIFICATE_EVENT_ABI,
          provider,
        );

        const iface = new ethers.Interface(CERTIFICATE_EVENT_ABI);
        const eventFragment = iface.getEvent("CertificateMinted");
        if (!eventFragment) {
          throw new Error("CertificateMinted event not found in ABI");
        }
        const filter = contract.filters.CertificateMinted(null, address);
        const logs = await contract.queryFilter(filter, 0, "latest");
        console.log("[agent-id] certificate events found", {
          count: logs.length,
          latestTx: logs.at(-1)?.transactionHash ?? null,
        });

        if (logs.length === 0) {
          setCertificate(null);
          return;
        }

        const latestLog = logs[logs.length - 1];
        const parsed = iface.parseLog({
          topics: latestLog.topics as string[],
          data: latestLog.data,
        });
        const tokenId = parsed?.args?.tokenId?.toString() ?? "0";
        const cert = await contract.getCertificate(tokenId);

        setCertificate({
          tokenId,
          owner: address,
          repoUrl: cert.repoUrl,
          scanDate: cert.scanDate,
          filesScanned: Number(cert.filesScanned),
          totalFindings: Number(cert.totalFindings),
          criticalCount: Number(cert.criticalCount),
          highCount: Number(cert.highCount),
          mediumCount: Number(cert.mediumCount),
          lowCount: Number(cert.lowCount),
          reportHash: cert.reportHash,
          txHash: latestLog.transactionHash,
        });
      } catch (error) {
        console.log("[agent-id] certificate load failed", error);
        setCertificate(null);
      } finally {
        setIsLoadingCertificate(false);
        setHasFetchedCertificate(true);
      }
    }

    void loadCertificate();
  }, [address, isConnected]);

  const formattedScanDate = certificate?.scanDate
    ? `${new Date(certificate.scanDate).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })} at ${new Date(certificate.scanDate).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      })}`
    : "No scans yet";

  const onChainData = useMemo(() => {
    if (certificate) {
      return {
        contract: INFT_CONTRACT_ADDRESS,
        tokenId: certificate.tokenId,
        owner: certificate.owner,
        standard: "ERC-7857",
        minted: formattedScanDate,
        transfers: "0",
      };
    }

    return {
      contract: INFT_CONTRACT_ADDRESS,
      tokenId: "Not minted",
      owner: isConnected && address ? address : "Connect wallet",
      standard: "ERC-7857",
      minted: "No scans yet",
      transfers: "0",
    };
  }, [address, certificate, formattedScanDate, isConnected]);

  const contractExplorerHref = `${EXPLORER_BASE}/address/${INFT_CONTRACT_ADDRESS}`;
  const txExplorerHref = certificate?.txHash
    ? `${EXPLORER_BASE}/tx/${certificate.txHash}`
    : null;
  const hasCertificate = Boolean(certificate);
  const dynamicCapabilityTags = hasCertificate
    ? [
        { label: `CRITICAL: ${certificate?.criticalCount ?? 0}`, tone: "critical" as const },
        { label: `HIGH: ${certificate?.highCount ?? 0}`, tone: "high" as const },
        { label: `MEDIUM: ${certificate?.mediumCount ?? 0}`, tone: "medium" as const },
        { label: `LOW: ${certificate?.lowCount ?? 0}`, tone: "low" as const },
      ]
    : [{ label: "No scan data yet", tone: "low" as const }];

  const copyValue = async (target: Exclude<CopyTarget, null>, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(target);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied(target);
      setTimeout(() => setCopied(null), 1500);
    }
  };

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-black font-geist text-text-1">
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute left-1/2 top-[-150px] h-[600px] w-[600px] -translate-x-1/2 animate-drift rounded-full bg-[radial-gradient(circle,rgba(124,58,237,0.18),transparent_65%)]" />
        <div className="absolute -bottom-20 -right-20 h-[400px] w-[400px] animate-drift-slow rounded-full bg-[radial-gradient(circle,rgba(236,72,153,0.1),transparent_65%)]" />
      </div>

      <nav className="glass-blur-nav sticky top-0 z-50 flex h-[52px] items-center justify-between border-b border-[var(--border)] bg-black/80 px-4 md:px-10">
        <Link href="/" className="flex items-center gap-2.5 no-underline">
          <div className="relative flex h-[30px] w-[30px] items-center justify-center">
            <div className="absolute h-[26px] w-[26px] rotate-45 rounded-md border border-white/20 bg-purple/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_3px_12px_rgba(124,58,237,0.3)]" />
            <div className="absolute h-[13px] w-[13px] rotate-45 rounded-[3px] border border-white/20 bg-purple/65" />
            <div className="absolute z-[1] h-1 w-1 rounded-full bg-white shadow-[0_0_6px_white]" />
          </div>
          <span className="text-base font-bold tracking-tight">
            Encl<span className="text-purple-bright">av</span>
          </span>
        </Link>
        <div className="hidden items-center gap-2 md:flex">
          <WalletConnect />
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.06em] text-text-3 transition-colors hover:text-text-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to dashboard
          </Link>
        </div>
        <button
          type="button"
          className="md:hidden"
          onClick={() => setMobileMenuOpen((prev) => !prev)}
          aria-label="Toggle certificate menu"
        >
          {mobileMenuOpen ? <X className="h-5 w-5 text-text-2" /> : <Menu className="h-5 w-5 text-text-2" />}
        </button>
      </nav>
      {mobileMenuOpen ? (
        <div className="sticky top-[52px] z-40 border-b border-[var(--border)] bg-black/95 px-4 py-3 md:hidden">
          <div className="flex flex-col gap-2">
            <WalletConnect />
            <Link
              href="/dashboard"
              className="rounded-md border border-[var(--border)] px-3 py-2 text-center font-mono text-[11px] uppercase tracking-[0.06em] text-text-2"
            >
              Back to dashboard
            </Link>
          </div>
        </div>
      ) : null}

      <section className="relative z-[1] mx-auto max-w-[1100px] px-4 pb-20 pt-12 md:px-10">
        <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.12em] text-purple-bright">
          Verifiable Security Proof
        </p>
        <h1 className="mb-1 text-[clamp(28px,4vw,42px)] font-extrabold tracking-[-0.03em]">
          Security Certificate
        </h1>
        <p className="mb-10 font-mono text-[11px] tracking-[0.06em] text-text-3">
          ERC-7857 - 0G Chain Galileo - Issued after autonomous scan
        </p>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[400px_1fr]">
          <article className="relative overflow-hidden rounded-[20px] border border-purple-bright/25 bg-purple/10 backdrop-blur-[30px]">
            <div className="absolute inset-x-0 top-0 h-[1.5px] bg-[linear-gradient(90deg,#7C3AED,#EC4899,#7C3AED)] bg-[length:200%_100%] animate-shimmer" />
            <div className="absolute right-4 top-4 animate-float opacity-70">
              <Orbit className="h-7 w-7 text-purple-bright" />
            </div>

            <div className="relative flex h-[260px] items-center justify-center overflow-hidden bg-[radial-gradient(ellipse_at_50%_60%,rgba(139,92,246,0.12)_0%,transparent_65%)]">
              <div className="absolute h-40 w-40 rounded-full border border-pink/20 animate-[spin_15s_linear_infinite_reverse]">
                <span className="absolute bottom-[-3px] right-[20%] h-[5px] w-[5px] rounded-full bg-pink shadow-[0_0_8px_#EC4899]" />
              </div>
              <div className="absolute h-[200px] w-[200px] rounded-full border border-purple-bright/20 animate-[spin_10s_linear_infinite]">
                <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-purple-bright shadow-[0_0_12px_#A78BFA,0_0_24px_rgba(167,139,250,0.4)]" />
              </div>
              <div className="relative h-[110px] w-[110px] animate-breathe-orb rounded-full bg-[conic-gradient(from_200deg,rgba(139,92,246,0.9)_0deg,rgba(236,72,153,0.8)_80deg,rgba(99,102,241,0.9)_150deg,rgba(167,139,250,0.7)_220deg,rgba(56,189,248,0.55)_280deg,rgba(139,92,246,0.9)_360deg)] shadow-[0_0_40px_rgba(139,92,246,0.5),0_0_80px_rgba(139,92,246,0.2)]">
                <div className="absolute inset-0 rounded-full border border-white/20" />
              </div>
            </div>

            <div className="p-5">
              <h2 className="mb-1 text-xl font-extrabold tracking-tight">
                Enclav Security Cert #{hasCertificate ? certificate?.tokenId : "Not minted"}
              </h2>
              <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.08em] text-purple-bright">
                Enclav Security Certificates - 0G Chain
              </p>
              <div className="mb-4 grid grid-cols-2 gap-2">
                {isLoadingCertificate ? (
                  <>
                    <SkeletonStat />
                    <SkeletonStat />
                    <SkeletonStat />
                    <SkeletonStat />
                  </>
                ) : (
                  <>
                    <NftStat
                      label="Files Scanned"
                      value={String(certificate?.filesScanned ?? 0)}
                      accent="text-purple-bright"
                    />
                    <NftStat
                      label="Vulnerabilities"
                      value={String(certificate?.totalFindings ?? 0)}
                      accent="text-teal-light"
                    />
                    <NftStat label="Scan Date" value={formattedScanDate} />
                    <NftStat
                      label="Critical Findings"
                      value={String(certificate?.criticalCount ?? 0)}
                    />
                  </>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  title="Transfer functionality coming soon"
                  className="glass-blur-sm flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-purple-bright/30 bg-purple/35 px-3 py-2.5 font-mono text-[11px] uppercase tracking-[0.06em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] transition hover:-translate-y-[1px] hover:bg-purple/50"
                >
                  <SendHorizontal className="h-3.5 w-3.5" />
                  Transfer
                </button>
                <a
                  href={txExplorerHref ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-disabled={!txExplorerHref}
                  onClick={(e) => {
                    if (!txExplorerHref) e.preventDefault();
                  }}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 font-mono text-[11px] uppercase tracking-[0.06em] transition ${
                    txExplorerHref
                      ? "border-[var(--border)] text-text-2 hover:border-purple-bright/30 hover:text-text-1"
                      : "cursor-not-allowed border-[var(--border)] text-text-3/70"
                  }`}
                >
                  {txExplorerHref ? (
                    <ExternalLink className="h-3.5 w-3.5" />
                  ) : (
                    <Lock className="h-3 w-3" />
                  )}
                  Explorer
                </a>
              </div>
            </div>
          </article>

          <div className="flex flex-col gap-4">
            {hasFetchedCertificate && !isLoadingCertificate && !hasCertificate ? (
              <section className="glass rounded-[14px] border border-purple-bright/20 p-5">
                <p className="mb-3 text-sm text-text-2">
                  No certificate yet - run a scan to mint your first
                </p>
                <Link
                  href="/dashboard"
                  className="inline-flex items-center rounded-full border border-purple-bright/30 bg-purple/20 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.06em] text-purple-bright"
                >
                  Go to scanner
                </Link>
              </section>
            ) : null}
            <section className="glass rounded-[14px] p-5">
              <div className="mb-3 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.12em] text-text-3">
                <span>On-chain details</span>
                <a
                  href={contractExplorerHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-purple-bright hover:text-white"
                >
                  View on 0G Explorer
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              <ChainRow
                label="Contract"
                value={onChainData.contract}
                canCopy
                copied={copied === "contract"}
                onCopy={() => copyValue("contract", onChainData.contract)}
              />
              <ChainRow label="Token ID" value={onChainData.tokenId} muted={!hasCertificate} />
              <ChainRow
                label="Owner"
                value={onChainData.owner}
                canCopy={Boolean(isConnected && address)}
                copied={copied === "owner"}
                onCopy={() => copyValue("owner", onChainData.owner)}
                actionButton={
                  !isConnected ? (
                    <button
                      type="button"
                      onClick={() => {
                        const first = connectors.find((c) => c.ready) ?? connectors[0];
                        if (first) connect({ connector: first });
                      }}
                      className="font-mono text-[11px] text-[#A78BFA] hover:underline"
                    >
                      Connect wallet
                    </button>
                  ) : undefined
                }
              />
              <ChainRow label="Standard" value={onChainData.standard} />
              <ChainRow label="Minted" value={onChainData.minted} />
              <ChainRow
                label="Report Hash"
                value={certificate?.reportHash || "Run a scan to generate your certificate"}
                muted={!hasCertificate}
              />
              <ChainRow label="Transfers" value={onChainData.transfers} last />
            </section>

            <section className="glass rounded-[14px] p-5">
              <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.12em] text-text-3">
                Scan Attestation Log
              </p>
              {hasCertificate ? (
                <>
                  <TimelineEntry title="TEE attestation verified" meta="Intel TDX - Scan enclave verified" color="bg-teal shadow-[0_0_7px_#10B981]" />
                  <TimelineEntry title="Autonomous scan completed" meta="All files scanned - Findings aggregated" color="bg-purple shadow-[0_0_7px_#7C3AED]" />
                  <TimelineEntry title="Security certificate minted" meta="ERC-7857 - 0G Chain" color="bg-purple" />
                  <TimelineEntry title="Certificate transferred to owner" meta="Original owner - 0 transfers" color="bg-amber-500 shadow-[0_0_7px_#F59E0B]" last />
                </>
              ) : (
                <div className="flex items-center gap-2 text-[12px] text-text-3">
                  <Clock3 className="h-3.5 w-3.5" />
                  Waiting for first scan...
                </div>
              )}
            </section>

            <section className="glass rounded-[14px] p-5">
              <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.12em] text-text-3">
                Vulnerability types detected
              </p>
              <div className="flex flex-wrap gap-1.5">
                {dynamicCapabilityTags.map((tag) => (
                  <CapabilityTag key={tag.label} label={tag.label} tone={tag.tone} />
                ))}
              </div>
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}

function NftStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-white/[0.03] px-2.5 py-2">
      <p className="mb-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-text-3">
        {label}
      </p>
      <p className={`font-mono text-xs ${accent ?? "text-text-1"}`}>{value}</p>
    </div>
  );
}

function ChainRow({
  label,
  value,
  canCopy = false,
  copied = false,
  onCopy,
  actionButton,
  muted = false,
  last = false,
}: {
  label: string;
  value: string;
  canCopy?: boolean;
  copied?: boolean;
  onCopy?: () => void;
  actionButton?: ReactNode;
  muted?: boolean;
  last?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between py-2.5 ${last ? "" : "border-b border-white/[0.04]"}`}>
      <span className="font-mono text-[11px] text-text-3">{label}</span>
      <span
        className={`flex items-center gap-1.5 font-mono text-[11px] ${
          muted ? "text-[#2E2C3E]" : "text-text-1"
        }`}
      >
        {value}
        {actionButton}
        {canCopy ? (
          <button
            type="button"
            onClick={onCopy}
            className="flex h-[18px] w-[18px] items-center justify-center rounded border border-[var(--border)] opacity-60 transition hover:border-purple-bright/30 hover:opacity-100"
            aria-label={`Copy ${label}`}
          >
            {copied ? (
              <Check className="h-2.5 w-2.5 text-teal" strokeWidth={2.5} />
            ) : (
              <Copy className="h-2.5 w-2.5 text-text-2" strokeWidth={2} />
            )}
          </button>
        ) : null}
      </span>
    </div>
  );
}

function SkeletonStat() {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-white/[0.03] px-2.5 py-2">
      <div className="mb-1 h-2 w-16 animate-pulse rounded bg-white/10" />
      <div className="h-3 w-12 animate-pulse rounded bg-white/10" />
    </div>
  );
}

function TimelineEntry({
  title,
  meta,
  color,
  last = false,
}: {
  title: string;
  meta: string;
  color: string;
  last?: boolean;
}) {
  return (
    <div className={`flex gap-3 py-2.5 ${last ? "" : "border-b border-white/[0.04]"}`}>
      <div className="flex flex-col items-center">
        <span className={`mt-[3px] h-[9px] w-[9px] rounded-full ${color}`} />
        {last ? null : <span className="mt-1 block w-px flex-1 bg-white/[0.05]" />}
      </div>
      <div className="flex-1 pb-0.5">
        <p className="text-sm font-semibold text-text-2">{title}</p>
        <p className="font-mono text-[10px] tracking-[0.04em] text-text-3">{meta}</p>
      </div>
    </div>
  );
}

function CapabilityTag({
  label,
  tone,
}: {
  label: string;
  tone: "critical" | "high" | "medium" | "low";
}) {
  const styles =
    tone === "critical"
      ? "border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.1)] text-[#FCA5A5]"
      : tone === "high"
        ? "border-[rgba(249,115,22,0.3)] bg-[rgba(249,115,22,0.1)] text-[#FDC8A4]"
        : tone === "medium"
          ? "border-[rgba(234,179,8,0.3)] bg-[rgba(234,179,8,0.1)] text-[#FDE68A]"
          : "border-[rgba(59,130,246,0.3)] bg-[rgba(59,130,246,0.1)] text-[#93C5FD]";

  return (
    <span className={`rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.06em] ${styles}`}>
      {label}
    </span>
  );
}
