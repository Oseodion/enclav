"use client";

import { useAccount } from "wagmi";

export function useWallet() {
  const { address, isConnected, chainId } = useAccount();

  return {
    address,
    isConnected,
    chainId,
  };
}
