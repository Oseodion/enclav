import { QueryClient } from "@tanstack/react-query";
import { http, defineChain } from "viem";
import { createConfig } from "wagmi";
import { injected } from "wagmi/connectors";

export const ogGalileo = defineChain({
  id: 16602,
  name: "0G Galileo",
  nativeCurrency: {
    name: "0G",
    symbol: "0G",
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ["https://evmrpc-testnet.0g.ai"] },
    public: { http: ["https://evmrpc-testnet.0g.ai"] },
  },
  blockExplorers: {
    default: {
      name: "0G Galileo Explorer",
      url: "https://chainscan-galileo.0g.ai",
    },
  },
  testnet: true,
});

export const wagmiConfig = createConfig({
  chains: [ogGalileo],
  connectors: [injected()],
  transports: {
    [ogGalileo.id]: http("https://evmrpc-testnet.0g.ai"),
  },
});

export const queryClient = new QueryClient();
