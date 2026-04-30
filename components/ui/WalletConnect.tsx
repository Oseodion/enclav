"use client";

import { ChevronDown, LogOut, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";

function shortenAddress(address?: string) {
  if (!address) return "—";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function WalletConnect() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  const availableConnectors = useMemo(() => connectors, [connectors]);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (mounted && isConnected) {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="glass-blur-sm inline-flex items-center gap-1.5 rounded-full border border-purple-bright/30 bg-purple/10 px-2.5 py-1 font-mono text-[11px] text-purple-bright"
        >
          <Wallet className="h-3.5 w-3.5" />
          {shortenAddress(address)}
          <ChevronDown className="h-3 w-3" />
        </button>

        {open ? (
          <div className="absolute right-0 top-full mt-2 z-[120] min-w-[160px] space-y-1 rounded-xl border border-[var(--glass-border)] bg-[rgba(10,8,18,0.94)] p-2 shadow-[0_8px_30px_rgba(0,0,0,0.45)] backdrop-blur-xl">
            <button
              type="button"
              onClick={() => {
                disconnect();
                setOpen(false);
              }}
              className="w-full rounded-lg border border-[var(--border)] bg-white/[0.02] px-2.5 py-1.5 text-left font-mono text-[11px] text-text-2 transition hover:border-purple-bright/30 hover:text-text-1"
            >
              <span className="inline-flex items-center gap-1.5">
                <LogOut className="h-3 w-3" />
                Disconnect
              </span>
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="glass-blur-sm inline-flex items-center gap-1.5 rounded-full border border-purple-bright/30 bg-purple/10 px-2.5 py-1 font-mono text-[11px] text-purple-bright"
      >
        <Wallet className="h-3.5 w-3.5" />
        Connect wallet
        <ChevronDown className="h-3 w-3" />
      </button>

      {open ? (
        <div className="absolute right-0 top-full mt-2 z-[120] min-w-[180px] space-y-1 rounded-xl border border-[var(--glass-border)] bg-[rgba(10,8,18,0.94)] p-2 shadow-[0_8px_30px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          {availableConnectors.map((connector, index) => (
            <button
              key={`${connector.name}-${index}`}
              type="button"
              onClick={() => {
                connect({ connector });
                setOpen(false);
              }}
              className="w-full rounded-lg border border-[var(--border)] bg-white/[0.02] px-2.5 py-1.5 text-left font-mono text-[11px] text-text-2 transition hover:border-purple-bright/30 hover:text-text-1"
            >
              {connector.name}
              {isPending ? " (connecting...)" : ""}
            </button>
          ))}
          {availableConnectors.length === 0 ? (
            <div className="px-2 py-1.5 font-mono text-[11px] text-text-3">No wallets found</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
