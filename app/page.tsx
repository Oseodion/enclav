"use client";

import {
  Activity,
  AlertTriangle,
  Clock,
  Database,
  Lock,
  Menu,
  Zap,
  Shield,
} from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

const DOCS_URL = "https://docs.0g.ai";

export default function Home() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setMobileOpen(false);
      }
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-black font-geist text-text-1">
      {/* Ambient orbs */}
      <div
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
        aria-hidden
      >
        <div
          className="bg-orb absolute -left-[150px] -top-[200px] h-[700px] w-[700px] animate-drift rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(124,58,237,0.2) 0%, transparent 65%)",
          }}
        />
        <div
          className="bg-orb absolute -bottom-[100px] -right-[100px] h-[500px] w-[500px] animate-drift-slow rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(236,72,153,0.12) 0%, transparent 65%)",
          }}
        />
        <div
          className="bg-orb absolute left-[60%] top-[50vh] h-[300px] w-[300px] animate-drift-delayed rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(56,189,248,0.08) 0%, transparent 65%)",
          }}
        />
      </div>

      <nav
        ref={navRef}
        className="glass-blur-nav fixed left-0 right-0 top-0 z-[100] flex items-center justify-between border-b border-[var(--border)] bg-black/70 px-6 py-3.5 md:px-12"
      >
        <Link href="/" className="flex items-center gap-[11px] no-underline">
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
          <span className="text-[17px] font-bold tracking-tight text-text-1">
            Encl<span className="text-purple-bright">av</span>
          </span>
        </Link>

        <ul className="hidden list-none gap-8 md:flex">
          <li>
            <Link
              href="#how-it-works"
              className="font-mono text-[12px] uppercase tracking-[0.06em] text-text-3 transition-colors hover:text-text-2"
            >
              How it works
            </Link>
          </li>
          <li>
            <Link
              href="#agent-id"
              className="font-mono text-[12px] uppercase tracking-[0.06em] text-text-3 transition-colors hover:text-text-2"
            >
              Certificate
            </Link>
          </li>
          <li>
            <Link
              href="#skills"
              className="font-mono text-[12px] uppercase tracking-[0.06em] text-text-3 transition-colors hover:text-text-2"
            >
              Security Report
            </Link>
          </li>
          <li>
            <a
              href={DOCS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[12px] uppercase tracking-[0.06em] text-text-3 transition-colors hover:text-text-2"
            >
              Docs
            </a>
          </li>
        </ul>

        <div className="hidden items-center gap-2.5 md:flex">
          <div className="glass-blur-sm flex items-center gap-1.5 rounded-full border border-teal/20 bg-teal/[0.08] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.06em] text-teal-light">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal shadow-[0_0_8px_#10B981]" />
            TEE Active
          </div>
          <Link
            href="/dashboard"
            className="glass-blur-sm rounded-full border border-purple-bright/40 bg-purple/40 px-5 py-2 font-mono text-[12px] uppercase tracking-[0.06em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_0_20px_rgba(124,58,237,0.2)] transition-all hover:bg-purple/60 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_0_30px_rgba(124,58,237,0.4)]"
          >
            Scan Your Repo
          </Link>
        </div>

        <button
          type="button"
          className="flex flex-col gap-1.5 p-1 md:hidden"
          aria-expanded={mobileOpen}
          aria-label="Open menu"
          onClick={(e) => {
            e.stopPropagation();
            setMobileOpen((o) => !o);
          }}
        >
          <Menu className="h-6 w-6 text-text-2" strokeWidth={1.5} />
        </button>
      </nav>

      <div
        className={`glass-blur-nav fixed left-0 right-0 top-[57px] z-[99] flex flex-col gap-0 border-b border-[var(--border)] bg-black/95 px-6 py-4 transition-transform duration-300 ease-out md:hidden ${
          mobileOpen ? "translate-y-0" : "-translate-y-[110%]"
        }`}
      >
        <Link
          href="#how-it-works"
          onClick={closeMobile}
          className="border-b border-[var(--border)] py-3.5 font-mono text-[13px] uppercase tracking-[0.06em] text-text-2"
        >
          How it works
        </Link>
        <Link
          href="#agent-id"
          onClick={closeMobile}
          className="border-b border-[var(--border)] py-3.5 font-mono text-[13px] uppercase tracking-[0.06em] text-text-2"
        >
          Certificate
        </Link>
        <Link
          href="#skills"
          onClick={closeMobile}
          className="border-b border-[var(--border)] py-3.5 font-mono text-[13px] uppercase tracking-[0.06em] text-text-2"
        >
          Security Report
        </Link>
        <a
          href={DOCS_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={closeMobile}
          className="border-b border-[var(--border)] py-3.5 font-mono text-[13px] uppercase tracking-[0.06em] text-text-2"
        >
          Docs
        </a>
        <Link
          href="/dashboard"
          onClick={closeMobile}
          className="mt-4 block rounded-full border border-purple-bright/40 bg-purple/40 py-3 text-center font-mono text-[12px] uppercase tracking-[0.06em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_0_20px_rgba(124,58,237,0.2)]"
        >
          Scan Your Repo
        </Link>
      </div>

      {/* Hero */}
      <section className="relative z-[1] flex min-h-screen flex-col items-center justify-center px-6 pb-20 pt-[120px] text-center md:px-12">
        <div className="glass-blur-sm mb-9 inline-flex animate-fade-up items-center gap-2 rounded-full border border-[rgba(139,92,246,0.25)] bg-[rgba(139,92,246,0.1)] px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-purple-bright">
          <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-purple-bright" />
          Autonomous Security Agent · Built on 0G
        </div>

        <h1 className="animate-fade-up-d1 mb-7 max-w-[min(100%,920px)] text-[clamp(36px,12vw,96px)] font-extrabold leading-[0.93] tracking-[-0.04em] md:text-[clamp(40px,10vw,72px)] lg:text-[clamp(48px,8vw,96px)]">
          Scan your code.
          <br />
          <span className="bg-purple-pink bg-clip-text text-transparent">
            Scanned privately.
          </span>
          <br />
          <span
            className="text-transparent [text-shadow:none]"
            style={{
              WebkitTextStroke: "1.5px rgba(167,139,250,0.6)",
            }}
          >
            Certified on-chain.
          </span>
        </h1>

        <p className="animate-fade-up-d2 mb-12 font-mono text-[13px] uppercase tracking-[0.1em] text-text-3">
          Autonomous security · Zero exposure · Verifiable proof
        </p>

        <div className="animate-fade-up-d3 mb-20 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/dashboard"
            className="glass-blur-md flex w-full max-w-[280px] items-center justify-center gap-2 rounded-full border border-purple-bright/45 bg-purple/45 px-8 py-3.5 font-mono text-[13px] uppercase tracking-[0.06em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_0_30px_rgba(124,58,237,0.3)] transition-all hover:-translate-y-0.5 hover:bg-purple/65 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_0_40px_rgba(124,58,237,0.45)] sm:w-auto sm:max-w-none"
          >
            <Zap className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
            Scan Your Repo
          </Link>
          <a
            href={DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="glass-blur-md flex w-full max-w-[280px] items-center justify-center gap-2 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)] px-8 py-3.5 font-mono text-[13px] uppercase tracking-[0.06em] text-text-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] transition-all hover:border-border-purple hover:text-text-1 sm:w-auto sm:max-w-none"
          >
            <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            Read the docs
          </a>
        </div>

        {/* Liquid orb */}
        <div className="animate-fade-up-d4 relative mx-auto flex h-[320px] w-full max-w-[320px] items-center justify-center">
          <div className="absolute flex h-[230px] w-[230px] items-center justify-center rounded-full border border-pink/20 animate-[spin_18s_linear_infinite_reverse]">
            <span className="absolute bottom-[-3px] right-[22%] h-1.5 w-1.5 rounded-full bg-pink shadow-[0_0_10px_#EC4899]" />
          </div>
          <div className="absolute flex h-[280px] w-[280px] items-center justify-center rounded-full border border-purple-bright/20 animate-[spin_12s_linear_infinite]">
            <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-purple-bright shadow-[0_0_14px_#A78BFA,0_0_28px_rgba(167,139,250,0.5)]" />
          </div>
          <div
            className="relative h-40 w-40 animate-breathe-orb rounded-full shadow-[0_0_50px_rgba(139,92,246,0.5),0_0_100px_rgba(139,92,246,0.2),inset_0_0_30px_rgba(255,255,255,0.08)]"
            style={{
              background:
                "conic-gradient(from 200deg, rgba(139,92,246,0.9) 0deg, rgba(236,72,153,0.8) 80deg, rgba(99,102,241,0.9) 150deg, rgba(167,139,250,0.7) 220deg, rgba(56,189,248,0.55) 280deg, rgba(139,92,246,0.9) 360deg)",
            }}
          >
            <div className="pointer-events-none absolute left-[18%] top-[12%] h-[28%] w-[38%] -rotate-[25deg] rounded-full bg-[radial-gradient(ellipse,rgba(255,255,255,0.5)_0%,transparent_70%)] blur-[4px]" />
            <div className="pointer-events-none absolute inset-0 rounded-full border border-white/20 shadow-[inset_0_2px_4px_rgba(255,255,255,0.15)]" />
          </div>
          <p className="absolute -bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.1em] text-text-3">
            Enclav TeeML Runtime
          </p>
        </div>
      </section>

      {/* Stats */}
      <div className="relative z-[1] grid grid-cols-2 border-y border-[var(--border)] md:grid-cols-4">
        {[
          { n: "100%", d: "scans run inside TEE" },
          { n: "0", d: "bytes of code exposed" },
          { n: "ERC-7857", d: "verifiable security certificate" },
          { n: "Real-time", d: "vulnerability detection" },
        ].map((s, i) => (
          <div
            key={s.d}
            className={`border-[var(--border)] bg-white/[0.02] px-6 py-7 backdrop-blur-[10px] md:px-8 ${
              i < 2 ? "border-b md:border-b-0" : ""
            } ${i % 2 === 0 ? "border-r" : ""} ${i < 3 ? "md:border-r" : ""}`}
          >
            <div className="mb-1 bg-gradient-to-br from-purple-bright to-pink bg-clip-text text-[28px] font-extrabold tracking-[-0.03em] text-transparent">
              {s.n}
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-3">
              {s.d}
            </div>
          </div>
        ))}
      </div>

      {/* Features */}
      <div
        id="how-it-works"
        className="relative z-[1] mx-auto max-w-[1200px] px-6 py-[60px] md:px-12 md:py-[100px]"
      >
        <div className="mb-4 flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[0.12em] text-purple-bright before:h-px before:w-3 before:bg-purple-bright">
          How it works
        </div>
        <h2 className="mb-14 max-w-[560px] text-[clamp(28px,4vw,48px)] font-extrabold leading-[1.05] tracking-[-0.03em] md:mb-[60px]">
          Autonomous security from repo to certificate
        </h2>

        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-[18px] border border-[var(--border)] bg-[var(--border)] md:grid-cols-3">
          <FeatureCard
            icon={<Shield className="h-[18px] w-[18px] stroke-purple-bright" strokeWidth={1.8} />}
            tag="OpenClaw Agent"
            title="Fully autonomous"
            description="Paste your repo URL. Enclav scans every file automatically with zero manual steps."
          />
          <FeatureCard
            icon={<Lock className="h-[18px] w-[18px] stroke-purple-bright" strokeWidth={1.8} />}
            tag="0G TeeML"
            title="Hardware-sealed privacy"
            description="Every file runs inside an Intel TDX enclave. Cryptographic attestation on every finding."
          />
          <FeatureCard
            id="agent-id"
            icon={<AlertTriangle className="h-[18px] w-[18px] stroke-purple-bright" strokeWidth={1.8} />}
            tag="Structured findings"
            title="Severity-ranked results"
            description="Critical, High, Medium, Low findings with exact file names, line numbers, and suggested fixes."
          />
          <FeatureCard
            icon={<Database className="h-[18px] w-[18px] stroke-purple-bright" strokeWidth={1.8} />}
            tag="0G Storage"
            title="Permanent scan history"
            description="Full scan results stored on 0G decentralized storage. Every scan permanently archived."
          />
          <FeatureCard
            id="skills"
            icon={<Activity className="h-[18px] w-[18px] stroke-purple-bright" strokeWidth={1.8} />}
            tag="INFT ERC-7857"
            title="Verifiable certificate"
            description="Scan completion mints a security certificate on 0G Chain. Proof your code was audited privately."
          />
          <FeatureCard
            icon={<Zap className="h-[18px] w-[18px] stroke-purple-bright" strokeWidth={1.8} />}
            tag="0g-deploy Skill"
            title="OpenClaw powered"
            description="Built on OpenClaw runtime with a custom 0g-deploy Skill contributed back to the ecosystem."
          />
        </div>
      </div>

      {/* CTA */}
      <div className="relative z-[1] px-6 pb-[60px] pt-0 md:px-12 md:pb-[100px]" id="cta">
        <div className="glass-heavy relative overflow-hidden rounded-3xl px-6 py-12 text-center md:px-12 md:py-20">
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_80%_at_50%_0%,rgba(124,58,237,0.2)_0%,transparent_60%)]"
            aria-hidden
          />
          <h2 className="relative mb-3.5 text-[clamp(28px,4vw,52px)] font-extrabold tracking-[-0.03em]">
            Scan your codebase privately.
          </h2>
          <p className="relative mb-9 font-mono text-[12px] uppercase tracking-[0.08em] text-text-3">
            Built on 0G Infrastructure · Autonomous Security Agent
          </p>
          <Link
            href="/dashboard"
            className="glass-blur-md relative inline-flex items-center gap-2 rounded-full border border-purple-bright/45 bg-purple/45 px-9 py-3.5 font-mono text-sm uppercase tracking-[0.06em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_0_30px_rgba(124,58,237,0.3)] transition-all hover:-translate-y-0.5 hover:bg-purple/65"
          >
            <Zap className="h-3.5 w-3.5" strokeWidth={2.5} />
            Scan Your Repo
          </Link>
        </div>
      </div>

      <footer className="relative z-[1] flex flex-wrap items-center justify-between gap-4 border-t border-[var(--border)] px-6 py-7 md:px-12">
        <div className="font-mono text-[11px] tracking-[0.06em] text-text-3">
          © 2026 Enclav - Autonomous security on 0G
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[
            "0G Compute",
            "TeeML",
            "INFT Certificate",
            "OpenClaw",
            "0G Storage",
          ].map((t) => (
            <span
              key={t}
              className="rounded border border-purple/20 bg-[rgba(139,92,246,0.06)] px-2 py-0.5 font-mono text-[10px] tracking-[0.06em] text-purple-bright/60"
            >
              {t}
            </span>
          ))}
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  id,
  icon,
  tag,
  title,
  description,
}: {
  id?: string;
  icon: ReactNode;
  tag: string;
  title: string;
  description: string;
}) {
  return (
    <article
      id={id}
      className="group relative scroll-mt-24 overflow-hidden bg-bg1 p-7 transition-colors hover:bg-[rgba(139,92,246,0.05)] md:px-7 md:py-8"
    >
      <div className="absolute left-0 top-0 h-0.5 w-full origin-left scale-x-0 bg-gradient-to-r from-purple to-pink transition-transform duration-[350ms] group-hover:scale-x-100" />
      <div className="mb-[18px] flex h-[38px] w-[38px] items-center justify-center rounded-[10px] border border-purple/20 bg-[rgba(139,92,246,0.1)]">
        {icon}
      </div>
      <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.1em] text-purple-bright/70">
        {tag}
      </p>
      <h3 className="mb-2.5 text-base font-bold tracking-[-0.01em]">{title}</h3>
      <p className="text-[13px] leading-[1.65] text-text-2">{description}</p>
    </article>
  );
}
