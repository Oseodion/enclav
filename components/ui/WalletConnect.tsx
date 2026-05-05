"use client";

import { ChevronDown, LogOut, Wallet } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";

function shortenAddress(address?: string) {
  if (!address) return "Not connected";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function WalletConnect() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number; minWidth: number }>({
    top: 0,
    left: 0,
    minWidth: 180,
  });
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  const availableConnectors = useMemo(() => connectors, [connectors]);
  useEffect(() => {
    setMounted(true);
  }, []);

  const updateMenuPosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const width = menuRef.current?.offsetWidth ?? Math.max(180, Math.round(rect.width));
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const padding = 8;
    const nextLeft = Math.min(
      Math.max(padding, rect.right - width),
      Math.max(padding, viewportWidth - width - padding),
    );
    const nextTop = Math.min(rect.bottom + 8, viewportHeight - 12);
    setMenuPosition({
      top: Math.round(nextTop),
      left: Math.round(nextLeft),
      minWidth: Math.max(160, Math.round(rect.width)),
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const rafId = window.requestAnimationFrame(updateMenuPosition);
    const onLayout = () => updateMenuPosition();
    window.addEventListener("resize", onLayout);
    window.addEventListener("scroll", onLayout, true);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onLayout);
      window.removeEventListener("scroll", onLayout, true);
    };
  }, [open, updateMenuPosition]);

  if (mounted && isConnected) {
    return (
      <div className="relative overflow-visible">
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="glass-blur-sm inline-flex items-center gap-1.5 rounded-full border border-purple-bright/30 bg-purple/10 px-2.5 py-1 font-mono text-[11px] text-purple-bright"
        >
          <Wallet className="h-3.5 w-3.5" />
          {shortenAddress(address)}
          <ChevronDown className="h-3 w-3" />
        </button>

        {open ? (
          <div
            ref={menuRef}
            className="fixed z-[9999] min-w-[160px] space-y-1 rounded-xl border border-[var(--glass-border)] bg-[rgba(10,8,18,0.94)] p-2 shadow-[0_8px_30px_rgba(0,0,0,0.45)] backdrop-blur-xl"
            style={{
              top: menuPosition.top,
              left: menuPosition.left,
              minWidth: menuPosition.minWidth,
            }}
          >
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
    <div className="relative overflow-visible">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="glass-blur-sm inline-flex items-center gap-1.5 rounded-full border border-purple-bright/30 bg-purple/10 px-2.5 py-1 font-mono text-[11px] text-purple-bright"
      >
        <Wallet className="h-3.5 w-3.5" />
        Connect wallet
        <ChevronDown className="h-3 w-3" />
      </button>

      {open ? (
        <div
          ref={menuRef}
          className="fixed z-[9999] min-w-[180px] space-y-1 rounded-xl border border-[var(--glass-border)] bg-[rgba(10,8,18,0.94)] p-2 shadow-[0_8px_30px_rgba(0,0,0,0.45)] backdrop-blur-xl"
          style={{
            top: menuPosition.top,
            left: menuPosition.left,
            minWidth: menuPosition.minWidth,
          }}
        >
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
