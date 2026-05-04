import { getAristotleChainId, getGalileoChainId } from "@/lib/og-env";

/** Human-readable label for wagmi `useChainId()` (matches env-driven chain IDs). */
export function ogNetworkLabel(chainId: number): string {
  if (chainId === getAristotleChainId()) return "0G Aristotle Mainnet";
  if (chainId === getGalileoChainId()) return "0G Galileo Testnet";
  return "0G Network";
}
