"use client";

import { ShieldCheck } from "lucide-react";

type TeeBadgeProps = {
  attestationHash: string;
};

function shortenHash(hash: string) {
  if (hash.length <= 14) return hash;
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

export function TeeBadge({ attestationHash }: TeeBadgeProps) {
  return (
    <span className="glass-blur-sm mt-1 inline-flex w-fit items-center gap-1.5 rounded-full border border-teal/20 bg-teal/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.06em] text-teal-light">
      <ShieldCheck className="h-3 w-3" />
      TeeML - {shortenHash(attestationHash)}
    </span>
  );
}
