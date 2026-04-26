"use client";

import Link from "next/link";
import {
  Activity,
  Circle,
  Code2,
  Database,
  GitPullRequest,
  Grid2x2,
  Rocket,
  SendHorizonal,
  Settings2,
  ShieldCheck,
  Sparkles,
  User,
} from "lucide-react";
import { useState } from "react";

const codeLines = [
  { n: 1, t: "// Enclav auth flow - 0G + OpenClaw", k: "cm" },
  { n: 2, t: "import { ethers } from 'ethers'", k: "kw" },
  { n: 3, t: "import { ZGServingUserBrokerFactory } from '@0glabs/0g-serving-broker'", k: "kw" },
  { n: 4, t: "import { Indexer } from '@0gfoundation/0g-ts-sdk'", k: "kw" },
  { n: 5, t: "" },
  { n: 6, t: "const broker = await ZGServingUserBrokerFactory.create(signer, rpcUrl)", k: "fn" },
  { n: 7, t: "const indexer = new Indexer(process.env.OG_STORAGE_INDEXER!)", k: "fn" },
  { n: 8, t: "" },
  { n: 9, t: "export async function generateSessionToken(address: string) {", k: "hl" },
  { n: 10, t: "  if (!address) throw new Error('Missing wallet address')", k: "hl" },
  { n: 11, t: "  const response = await broker.inference.chat(provider, {", k: "hl" },
  { n: 12, t: "    model: 'qwen-2.5-7b-instruct',", k: "hl" },
  { n: 13, t: "    messages: [{ role: 'user', content: 'validate agent scope' }]", k: "hl" },
  { n: 14, t: "  })", k: "hl" },
  { n: 15, t: "  return response", k: "hl" },
  { n: 16, t: "}", k: "hl" },
  { n: 17, t: "" },
  { n: 18, t: "export async function getRootHash(path: string) {", k: "fn" },
  { n: 19, t: "  const [tx] = await indexer.upload(fileRef, signer)", k: "fn" },
  { n: 20, t: "  return tx?.rootHash ?? null", k: "fn" },
  { n: 21, t: "}", k: "fn" },
];

export default function DashboardPage() {
  return (
    <main className="relative flex h-screen flex-col overflow-hidden bg-black font-geist text-text-1">
      <AmbientGlow />

      <header className="glass-blur-nav relative z-10 flex h-[52px] items-center justify-between border-b border-[var(--border)] bg-black/80 px-3 sm:px-5">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="relative flex h-7 w-7 items-center justify-center">
            <div className="absolute h-6 w-6 rotate-45 rounded-md border border-white/20 bg-purple/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_3px_12px_rgba(124,58,237,0.3)]" />
            <div className="absolute h-3 w-3 rotate-45 rounded-[3px] border border-white/20 bg-purple/60" />
            <div className="absolute z-[1] h-1 w-1 rounded-full bg-white shadow-[0_0_6px_white]" />
          </div>
          <span className="text-sm font-bold tracking-tight">
            Encl<span className="text-purple-bright">av</span>
          </span>
          <span className="hidden rounded border border-purple-bright/30 bg-purple/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-purple-bright sm:inline-flex">
            Beta
          </span>
        </Link>

        <nav className="hidden h-full md:flex">
          {["Agent", "Skills", "Memory", "Fine-tune", "Deploy"].map((item, i) => (
            <button
              key={item}
              type="button"
              className={`h-full border-b-2 px-4 font-mono text-[11px] uppercase tracking-[0.08em] ${
                i === 0
                  ? "border-purple bg-purple/5 text-text-1"
                  : "border-transparent text-text-3 hover:text-text-2"
              }`}
            >
              {item}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <div className="glass-blur-sm hidden items-center gap-1.5 rounded-full border border-teal/20 bg-teal/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.06em] text-teal-light sm:flex">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal shadow-[0_0_7px_#10B981]" />
            TEE Active
          </div>
          <button
            type="button"
            className="glass-blur-sm rounded-full border border-purple-bright/30 bg-purple/10 px-2.5 py-1 font-mono text-[11px] text-purple-bright"
          >
            —
          </button>
        </div>
      </header>

      <div className="relative z-[1] flex min-h-0 flex-1">
        <aside className="flex w-[52px] shrink-0 flex-col items-center gap-1 border-r border-[var(--border)] bg-bg1 py-3">
          <SidebarIcon icon={Grid2x2} active />
          <SidebarIcon icon={Code2} />
          <SidebarIcon icon={Database} />
          <div className="my-1 h-px w-6 bg-white/10" />
          <SidebarIcon icon={User} />
          <SidebarIcon icon={Settings2} />
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-[38px] items-center justify-between border-b border-[var(--border)] bg-white/[0.01] pr-3">
            <div className="flex h-full">
              <FileTab active title="auth.service.ts" color="bg-amber-400" />
              <FileTab title="user.model.ts" color="bg-teal" />
              <FileTab title="wallet.ts" />
              <FileTab title="+" />
            </div>
            <div className="hidden gap-1.5 sm:flex">
              <ActionBtn label="Run" />
              <ActionBtn label="Review" />
              <ActionBtn label="Deploy to 0G" primary />
            </div>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[1.15fr_1fr] xl:grid-cols-[1.15fr_0.95fr_260px]">
            <CodePanel />
            <ChatPanel />
            <RightInfoPanel />
          </div>
        </section>
      </div>

      <footer className="relative z-[5] flex h-[28px] items-center gap-4 overflow-x-auto border-t border-[var(--border)] bg-white/[0.01] px-4 font-mono text-[10px] text-text-3">
        <StatusItem iconColor="bg-teal shadow-[0_0_5px_#10B981]" label="0G Chain" value="—" />
        <StatusItem iconColor="bg-purple" label="Agent ID" value="—" />
        <StatusItem iconColor="bg-amber-400" label="Storage" value="—" />
        <StatusItem iconColor="bg-teal shadow-[0_0_5px_#10B981]" label="Inference" value="—" />
        <StatusItem iconColor="bg-purple" label="OpenClaw" value="—" />
      </footer>

    </main>
  );
}

function AmbientGlow() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className="absolute -left-[100px] -top-[150px] h-[500px] w-[500px] animate-drift rounded-full bg-[radial-gradient(circle,rgba(124,58,237,0.15),transparent_65%)]" />
      <div className="absolute -bottom-[80px] -right-[60px] h-[350px] w-[350px] animate-drift-slow rounded-full bg-[radial-gradient(circle,rgba(236,72,153,0.08),transparent_65%)]" />
    </div>
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
      className={`flex h-[34px] w-[34px] items-center justify-center rounded-lg ${
        active ? "bg-purple/15" : "hover:bg-purple/10"
      }`}
    >
      <Icon className={active ? "h-4 w-4 text-purple-bright" : "h-4 w-4 text-text-3"} strokeWidth={1.6} />
    </button>
  );
}

function FileTab({
  title,
  color,
  active = false,
}: {
  title: string;
  color?: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      className={`flex h-full items-center gap-1.5 border-r border-[var(--border)] px-3.5 font-mono text-[11px] ${
        active
          ? "border-b border-b-purple bg-purple/5 text-text-1"
          : "text-text-3 hover:text-text-2"
      }`}
    >
      {color ? <Circle className={`h-[6px] w-[6px] ${color} fill-current`} /> : null}
      {title}
    </button>
  );
}

function ActionBtn({ label, primary = false }: { label: string; primary?: boolean }) {
  return (
    <button
      type="button"
      className={`rounded border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.06em] ${
        primary
          ? "border-purple-bright/30 bg-purple/10 text-purple-bright"
          : "border-[var(--border)] text-text-2 hover:border-purple-bright/30 hover:text-purple-bright"
      }`}
    >
      {label}
    </button>
  );
}

function CodePanel() {
  return (
    <section className="min-h-0 border-r border-[var(--border)] bg-black md:block">
      <div className="h-full overflow-y-auto py-4">
        {codeLines.map((line) => (
          <div
            key={line.n}
            className={`flex border-l-2 font-mono text-[12.5px] leading-[1.65] ${
              line.k === "hl"
                ? "border-l-purple bg-purple/10"
                : "border-l-transparent hover:bg-white/[0.015]"
            }`}
          >
            <span className="w-[52px] shrink-0 select-none pr-4 text-right font-mono text-[11px] text-text-3">
              {line.n}
            </span>
            <code className={`pr-3 ${line.k === "cm" ? "text-text-3 italic" : "text-text-2"}`}>
              <CodeSyntax line={line.t} />
            </code>
          </div>
        ))}
      </div>
    </section>
  );
}

function CodeSyntax({ line }: { line: string }) {
  const replacements: Array<[RegExp, string]> = [
    [/\b(import|export|const|await|return|from|throw|new|async|function|if)\b/g, "text-purple-300"],
    [/\b(string|null)\b/g, "text-blue-400"],
    [/'[^']*'/g, "text-amber-300"],
    [/\b(ZGServingUserBrokerFactory|Indexer|generateSessionToken|getRootHash)\b/g, "text-green-400"],
  ];

  let rendered = line;
  replacements.forEach(([regex]) => {
    rendered = rendered.replace(regex, (m) => `@@${m}@@`);
  });

  return (
    <>
      {rendered.split("@@").map((part, i) => {
        const className =
          /\b(import|export|const|await|return|from|throw|new|async|function|if)\b/.test(part)
            ? "text-purple-300"
            : /\b(string|null)\b/.test(part)
              ? "text-blue-400"
              : /^'[^']*'$/.test(part)
                ? "text-amber-300"
                : /\b(ZGServingUserBrokerFactory|Indexer|generateSessionToken|getRootHash)\b/.test(part)
                  ? "text-green-400"
                  : "";
        return (
          <span key={`${part}-${i}`} className={className}>
            {part}
          </span>
        );
      })}
    </>
  );
}

function ChatPanel() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<
    Array<{ from: "You" | "Enclav"; text: string; agent?: boolean; snippet?: string }>
  >([
    { from: "You", text: "Review auth.service.ts and check token expiry edge cases." },
    {
      from: "Enclav",
      agent: true,
      text: "Analysis ready. Runtime metadata placeholders remain until wallet and 0G providers connect.",
      snippet: "1. Wallet: —\n2. Agent ID: —\n3. TEE attestation hash: —",
    },
    { from: "You", text: "Apply our current 0G security conventions." },
  ]);

  const sendMessage = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setMessages((prev) => [...prev, { from: "You", text: trimmed }]);
    setInput("");
  };

  return (
    <section className="glass relative flex min-h-0 flex-col border-l border-[var(--border)] bg-white/[0.03] md:order-none">
      <div className="border-b border-[var(--border)] bg-white/[0.02] px-4 py-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[13px] font-semibold">Enclav Agent</span>
          <span className="font-mono text-[10px] tracking-[0.04em] text-purple-bright">ERC-7857 - —</span>
        </div>
        <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-text-3">
          OpenClaw - TeeML inference
        </p>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.map((message, index) => (
          <Message
            key={`${message.from}-${index}`}
            from={message.from}
            text={message.text}
            agent={message.agent}
            snippet={message.snippet}
          />
        ))}
      </div>

      <div className="border-t border-[var(--border)] bg-white/[0.02] p-3">
        <div className="mb-1.5 flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") sendMessage();
            }}
            placeholder="Ask your sovereign agent..."
            className="glass-blur-sm w-full rounded-full border border-[var(--border)] bg-white/[0.05] px-3.5 py-2 font-mono text-xs text-text-1 placeholder:text-white/30 focus:border-purple focus:outline-none"
          />
          <button
            type="button"
            onClick={sendMessage}
            className="glass-blur-sm rounded-full border border-purple-bright/30 bg-purple/15 px-3 text-purple-bright"
          >
            <SendHorizonal className="h-4 w-4" />
          </button>
        </div>
        <p className="text-center font-mono text-[10px] text-text-3">
          Sealed via <span className="text-teal-light">0G TeeML</span> - zero exposure
        </p>
      </div>
    </section>
  );
}

function Message({
  from,
  text,
  snippet,
  agent = false,
}: {
  from: string;
  text: string;
  snippet?: string;
  agent?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className={`font-mono text-[10px] uppercase tracking-[0.1em] ${agent ? "text-purple-bright" : "text-text-3"}`}>
        {from}
      </span>
      <p className={`text-sm leading-6 ${agent ? "text-[#D4D0EA]" : "text-text-2"}`}>{text}</p>
      {snippet ? (
        <pre className="glass-blur-sm overflow-x-auto rounded-md border border-[var(--border)] bg-black/40 p-3 font-mono text-[11px] leading-6 text-text-2">
          {snippet}
        </pre>
      ) : null}
      {agent ? (
        <span className="glass-blur-sm mt-1 inline-flex w-fit items-center gap-1.5 rounded-full border border-teal/20 bg-teal/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.06em] text-teal-light">
          <span className="h-1.5 w-1.5 rounded-full bg-teal shadow-[0_0_7px_#10B981]" />
          TEE attested - —
        </span>
      ) : null}
    </div>
  );
}

function RightInfoPanel() {
  return (
    <aside className="glass hidden min-h-0 flex-col border-l border-[var(--border)] bg-white/[0.025] xl:flex">
      <div className="border-b border-[var(--border)] p-4">
        <div className="mb-3 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.12em] text-text-3">
          <span>Agent Identity</span>
          <Link href="/agent-id" className="rounded border border-purple-bright/30 bg-purple/10 px-1.5 py-0.5 text-purple-bright">
            View INFT
          </Link>
        </div>
        <div className="rounded-xl border border-purple-bright/30 bg-purple/10 p-3">
          <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-purple-bright/40 to-pink/30">
            <ShieldCheck className="h-4 w-4 text-white" />
          </div>
          <p className="mb-1 font-mono text-[9px] uppercase tracking-[0.1em] text-text-3">Agent ID - ERC-7857</p>
          <p className="mb-3 font-mono text-xs text-purple-bright">—</p>
          <div className="grid grid-cols-3 gap-2">
            <MiniStat label="Epoch" value="—" />
            <MiniStat label="Chain" value="—" />
            <MiniStat label="Size" value="—" />
          </div>
        </div>
      </div>

      <div className="border-b border-[var(--border)] p-4">
        <p className="mb-3 font-mono text-[9px] uppercase tracking-[0.12em] text-text-3">Fine-tune status</p>
        <ProgressRow label="Indexing" value="—" />
        <ProgressRow label="Training epochs" value="—" />
        <ProgressRow label="INFT minted" value="—" />
      </div>

      <div className="min-h-0 flex-1 p-4">
        <p className="mb-3 font-mono text-[9px] uppercase tracking-[0.12em] text-text-3">OpenClaw Skills</p>
        <SkillRow icon={Rocket} name="0g-deploy" status="Active" />
        <SkillRow icon={GitPullRequest} name="code-review" status="Ready" />
        <SkillRow icon={Sparkles} name="test-gen" status="Ready" />
        <SkillRow icon={Activity} name="audit-scan" status="Soon" />
      </div>
    </aside>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-text-3">{label}</p>
      <p className="font-mono text-xs">{value}</p>
    </div>
  );
}

function ProgressRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="mb-1 flex items-center justify-between font-mono text-[10px] text-text-2">
        <span>{label}</span>
        <span className="text-text-3">{value}</span>
      </div>
      <div className="h-[3px] overflow-hidden rounded bg-white/10">
        <div className="h-full w-0 rounded bg-gradient-to-r from-purple to-purple-bright" />
      </div>
    </div>
  );
}

function SkillRow({
  icon: Icon,
  name,
  status,
}: {
  icon: typeof Rocket;
  name: string;
  status: "Active" | "Ready" | "Soon";
}) {
  const style =
    status === "Active"
      ? "border-teal/30 bg-teal/10 text-teal-light"
      : status === "Ready"
        ? "border-purple-bright/30 bg-purple/10 text-purple-bright"
        : "border-[var(--border)] text-text-3";

  return (
    <div className="flex items-center gap-2 border-b border-white/5 py-2 last:border-none">
      <Icon className="h-3.5 w-3.5 text-text-3" />
      <span className="flex-1 font-mono text-[11px] text-text-2">{name}</span>
      <span className={`rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.06em] ${style}`}>
        {status}
      </span>
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
      <span className={`h-1 w-1 rounded-full ${iconColor}`} />
      {label}: {value}
    </span>
  );
}
