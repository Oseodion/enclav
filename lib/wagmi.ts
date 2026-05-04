import { QueryClient } from "@tanstack/react-query";
import { http, defineChain } from "viem";
import { createConfig } from "wagmi";
import { injected } from "wagmi/connectors";
import {
  getAristotleChainId,
  getGalileoChainId,
  resolveGalileoRpcUrl,
  resolveOgRpcUrl,
} from "./og-env";

const galileoRpc = resolveGalileoRpcUrl();
const aristotleRpc = resolveOgRpcUrl();

export const ogGalileo = defineChain({
  id: getGalileoChainId(),
  name: "0G Galileo",
  nativeCurrency: {
    name: "0G",
    symbol: "0G",
    decimals: 18,
  },
  rpcUrls: {
    default: { http: [galileoRpc] },
    public: { http: [galileoRpc] },
  },
  blockExplorers: {
    default: {
      name: "0G Galileo Explorer",
      url:
        process.env.NEXT_PUBLIC_OG_GALILEO_EXPLORER_URL ??
        process.env.OG_GALILEO_EXPLORER_URL ??
        "https://chainscan-galileo.0g.ai",
    },
  },
  testnet: true,
});

export const ogAristotle = defineChain({
  id: getAristotleChainId(),
  name: "0G Aristotle",
  nativeCurrency: {
    name: "0G",
    symbol: "0G",
    decimals: 18,
  },
  rpcUrls: {
    default: { http: [aristotleRpc] },
    public: { http: [aristotleRpc] },
  },
  blockExplorers: {
    default: {
      name: "0G Explorer",
      url:
        process.env.NEXT_PUBLIC_OG_EXPLORER ??
        process.env.OG_EXPLORER ??
        "https://chainscan.0g.ai",
    },
  },
  testnet: false,
});

/** Aristotle first so injected wallets default to mainnet when applicable. */
export const wagmiConfig = createConfig({
  chains: [ogAristotle, ogGalileo],
  connectors: [injected()],
  transports: {
    [ogAristotle.id]: http(aristotleRpc),
    [ogGalileo.id]: http(galileoRpc),
  },
});

export const queryClient = new QueryClient();
