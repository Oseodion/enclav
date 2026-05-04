/**
 * Central 0G defaults: Aristotle mainnet unless env overrides.
 * Galileo testnet URLs are only for optional multi-chain / wallet_addEthereumChain.
 */

export const DEFAULT_OG_RPC_URL = "https://evmrpc.0g.ai";
export const DEFAULT_OG_EXPLORER_URL = "https://chainscan.0g.ai";
export const DEFAULT_OG_STORAGE_INDEXER_URL = "https://indexer-storage-turbo.0g.ai";
export const DEFAULT_GALILEO_RPC_URL = "https://evmrpc-testnet.0g.ai";
export const DEFAULT_GALILEO_EXPLORER_URL = "https://chainscan-galileo.0g.ai";

/** Server + client: `OG_RPC_URL` then `NEXT_PUBLIC_OG_RPC_URL`. */
export function resolveOgRpcUrl(): string {
  return (
    process.env.OG_RPC_URL ??
    process.env.NEXT_PUBLIC_OG_RPC_URL ??
    DEFAULT_OG_RPC_URL
  );
}

export function resolveOgExplorerUrl(): string {
  return (
    process.env.NEXT_PUBLIC_OG_EXPLORER ??
    process.env.OG_EXPLORER ??
    DEFAULT_OG_EXPLORER_URL
  );
}

export function resolveOgStorageIndexerUrl(): string {
  return (
    process.env.OG_STORAGE_INDEXER_URL ??
    process.env.OG_STORAGE_INDEXER ??
    DEFAULT_OG_STORAGE_INDEXER_URL
  );
}

/** Galileo RPC (wagmi + wallet_addEthereumChain for testnet). */
export function resolveGalileoRpcUrl(): string {
  return (
    process.env.NEXT_PUBLIC_OG_GALILEO_RPC_URL ??
    process.env.OG_GALILEO_RPC_URL ??
    DEFAULT_GALILEO_RPC_URL
  );
}

export function resolveGalileoExplorerUrl(): string {
  return (
    process.env.NEXT_PUBLIC_OG_GALILEO_EXPLORER_URL ??
    process.env.OG_GALILEO_EXPLORER_URL ??
    DEFAULT_GALILEO_EXPLORER_URL
  );
}

export function getGalileoChainId(): number {
  const n = Number(
    process.env.NEXT_PUBLIC_OG_GALILEO_CHAIN_ID ??
      process.env.OG_GALILEO_CHAIN_ID ??
      16602,
  );
  return Number.isFinite(n) && n > 0 ? n : 16602;
}

export function getAristotleChainId(): number {
  const n = Number(
    process.env.OG_CHAIN_ID ?? process.env.NEXT_PUBLIC_OG_CHAIN_ID ?? 16661,
  );
  return Number.isFinite(n) && n > 0 ? n : 16661;
}
