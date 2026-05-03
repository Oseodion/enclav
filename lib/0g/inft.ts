import { ethers, type InterfaceAbi, type TransactionReceipt } from "ethers";
import type { WalletClient } from "viem";
import EnclavAbi from "./enclav-abi.json";

export const INFT_CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_INFT_CONTRACT_ADDRESS ??
  "0x8E2225136CaAf9aD28dDBF86e9280DB326AB2464";
export const OG_RPC_URL = process.env.NEXT_PUBLIC_OG_RPC_URL ?? "https://evmrpc-testnet.0g.ai";
const CHAINSCAN_BASE_URL = "https://chainscan-galileo.0g.ai";
const OG_GALILEO_CHAIN_ID = 16602;
/** EIP-155 chain id for wallet RPC (16602). */
const OG_GALILEO_CHAIN_ID_HEX = "0x40DA";
const GALILEO_HTTP_RPC = "https://evmrpc-testnet.0g.ai";

const ENCLAV_ABI = EnclavAbi as InterfaceAbi;

export type MintScanData = {
  repoUrl: string;
  scanDate: string;
  filesScanned: number;
  totalFindings: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  reportHash: string;
  /** Optional: 0G Storage root hash for cross-scan memory blob (not stored on-chain). */
  memoryRootHash?: string;
};

export type MintCertificateResult = {
  tokenId: string | null;
  txHash: string;
  explorerUrl: string;
  proofLabel: string;
};

export type MintFromWalletOptions = {
  /** From wagmi `useChainId()` - used with `eth_chainId` to detect Galileo reliably. */
  wagmiChainId?: number;
};

function extractMintFailureMessage(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const o = error as {
      reason?: string;
      shortMessage?: string;
      message?: string;
      info?: { error?: { message?: string } };
    };
    if (typeof o.reason === "string" && o.reason.trim()) return o.reason.trim();
    if (typeof o.shortMessage === "string" && o.shortMessage.trim()) return o.shortMessage.trim();
    if (typeof o.info?.error?.message === "string" && o.info.error.message.trim()) {
      return o.info.error.message.trim();
    }
    if (typeof o.message === "string" && o.message.trim()) return o.message.trim();
  }
  return error instanceof Error ? error.message : String(error);
}

function getWalletRpcErrorCode(error: unknown): number | undefined {
  if (error && typeof error === "object" && "code" in error) {
    const c = (error as { code?: number }).code;
    return typeof c === "number" ? c : undefined;
  }
  return undefined;
}

/**
 * Normalizes `eth_chainId` responses (hex string, plain hex, decimal string, or number).
 */
async function readWalletChainIdFromProvider(injectedProvider: ethers.Eip1193Provider): Promise<{
  rawRpcValue: unknown;
  normalizedHex: string;
  decimal: number;
}> {
  const rawRpcValue = await injectedProvider.request({ method: "eth_chainId" });
  let normalizedHex: string;

  if (typeof rawRpcValue === "string") {
    const t = rawRpcValue.trim();
    if (/^0x[0-9a-fA-F]+$/i.test(t)) {
      normalizedHex = `0x${t.slice(2).toLowerCase()}`;
    } else if (/^[0-9a-fA-F]+$/i.test(t) && /[a-fA-F]/.test(t)) {
      normalizedHex = `0x${t.toLowerCase()}`;
    } else if (/^\d+$/.test(t)) {
      normalizedHex = `0x${BigInt(t).toString(16)}`;
    } else {
      normalizedHex = "0x0";
    }
  } else if (typeof rawRpcValue === "number" && Number.isFinite(rawRpcValue)) {
    normalizedHex = `0x${BigInt(Math.trunc(rawRpcValue)).toString(16)}`;
  } else {
    normalizedHex = "0x0";
  }

  let decimal: number;
  try {
    decimal = Number(BigInt(normalizedHex));
  } catch {
    decimal = Number.NaN;
  }

  console.log("[mintFromWallet] eth_chainId raw rpc:", rawRpcValue, "normalized:", normalizedHex, "parsed decimal:", decimal);

  return { rawRpcValue, normalizedHex, decimal };
}

function isGalileoChain(ethDecimal: number, wagmiChainId?: number): boolean {
  const ethOk = ethDecimal === OG_GALILEO_CHAIN_ID;
  const wagmiOk =
    typeof wagmiChainId === "number" &&
    Number.isFinite(wagmiChainId) &&
    wagmiChainId === OG_GALILEO_CHAIN_ID;
  return ethOk || wagmiOk;
}

/**
 * Forces the injected wallet onto 0G Galileo (16602) before any mint RPC.
 */
export async function ensureWalletOnGalileo(
  injectedProvider: ethers.Eip1193Provider,
  wagmiChainId?: number,
): Promise<void> {
  const snap = await readWalletChainIdFromProvider(injectedProvider);
  console.log("[ensureWalletOnGalileo] chain snapshot", {
    ethChainIdHex: snap.normalizedHex,
    ethChainIdDecimal: snap.decimal,
    wagmiChainId,
    expected: OG_GALILEO_CHAIN_ID,
  });

  if (isGalileoChain(snap.decimal, wagmiChainId)) {
    if (
      typeof wagmiChainId === "number" &&
      Number.isFinite(wagmiChainId) &&
      snap.decimal !== wagmiChainId
    ) {
      console.warn("[ensureWalletOnGalileo] eth_chainId decimal vs wagmi useChainId differ", {
        eth_chainId_decimal: snap.decimal,
        wagmiChainId,
      });
    }
    return;
  }

  try {
    await injectedProvider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: OG_GALILEO_CHAIN_ID_HEX }],
    });
  } catch (switchError) {
    const code = getWalletRpcErrorCode(switchError);
    if (code === 4902) {
      await injectedProvider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: OG_GALILEO_CHAIN_ID_HEX,
            chainName: "0G Galileo Testnet",
            nativeCurrency: {
              name: "0G",
              symbol: "OG",
              decimals: 18,
            },
            rpcUrls: [GALILEO_HTTP_RPC],
            blockExplorerUrls: [CHAINSCAN_BASE_URL],
          },
        ],
      });
      await injectedProvider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: OG_GALILEO_CHAIN_ID_HEX }],
      });
    } else if (code === 4001) {
      throw new Error(
        "Wallet rejected switching to 0G Galileo testnet (chain 16602). Approve the network switch to mint.",
      );
    } else {
      throw switchError;
    }
  }

  const after = await readWalletChainIdFromProvider(injectedProvider);
  if (after.decimal !== OG_GALILEO_CHAIN_ID) {
    throw new Error(
      `Wallet must be on 0G Galileo testnet (chain ID ${OG_GALILEO_CHAIN_ID}) to mint. eth_chainId is ${after.normalizedHex} (decimal ${after.decimal}).`,
    );
  }
}

export async function mintFromWallet(
  walletClient: WalletClient | null | undefined,
  scanData: MintScanData,
  onTransactionSubmitted?: (txHash: string) => void,
  options?: MintFromWalletOptions,
): Promise<MintCertificateResult> {
  void walletClient;
  const wagmiChainId = options?.wagmiChainId;
  console.log("[mintFromWallet] starting", {
    contract: INFT_CONTRACT_ADDRESS,
    repoUrl: scanData.repoUrl,
    wagmiChainId,
  });
  if (!INFT_CONTRACT_ADDRESS) {
    throw new Error("INFT_CONTRACT_ADDRESS is required to mint certificates.");
  }
  const injectedProvider = (
    globalThis as { ethereum?: ethers.Eip1193Provider }
  ).ethereum;
  if (!injectedProvider) throw new Error("No injected wallet provider found.");

  await ensureWalletOnGalileo(injectedProvider, wagmiChainId);

  const provider = new ethers.BrowserProvider(injectedProvider);
  await provider.send("eth_requestAccounts", []);
  const signer = await provider.getSigner();
  const walletAddress = await signer.getAddress();

  const chainSnap = await readWalletChainIdFromProvider(injectedProvider);
  const chainIdHex = chainSnap.normalizedHex;
  const chainIdDec = chainSnap.decimal;

  const codeHex = (await injectedProvider.request({
    method: "eth_getCode",
    params: [INFT_CONTRACT_ADDRESS, "latest"],
  })) as string;
  const hasContractBytecode = typeof codeHex === "string" && codeHex.length > 2 && codeHex !== "0x";

  console.log("[mintFromWallet] preflight", {
    contractAddress: INFT_CONTRACT_ADDRESS,
    walletChainIdHex: chainIdHex,
    walletChainIdDecimal: chainIdDec,
    wagmiChainId,
    signerAddress: walletAddress,
    ethGetCodeLengthChars: typeof codeHex === "string" ? codeHex.length : 0,
    contractBytecodePresent: hasContractBytecode,
  });

  if (!hasContractBytecode) {
    throw new Error(
      `No contract bytecode at ${INFT_CONTRACT_ADDRESS} on this network. Check NEXT_PUBLIC_INFT_CONTRACT_ADDRESS and that the wallet is on 0G Galileo.`,
    );
  }

  const contract = new ethers.Contract(INFT_CONTRACT_ADDRESS, ENCLAV_ABI, signer);

  const mintArgs = [
    walletAddress,
    scanData.repoUrl,
    scanData.scanDate,
    scanData.filesScanned,
    scanData.totalFindings,
    scanData.criticalCount,
    scanData.highCount,
    scanData.mediumCount,
    scanData.lowCount,
    scanData.reportHash,
  ] as const;

  try {
    const previewTokenId = await contract.mintCertificate.staticCall(...mintArgs);
    console.log("[mintFromWallet] staticCall ok, would mint tokenId:", previewTokenId.toString());
  } catch (staticErr) {
    const msg = extractMintFailureMessage(staticErr);
    console.error("[mintFromWallet] staticCall revert", msg, staticErr);
    throw new Error(msg);
  }

  let gasLimit: bigint | undefined;
  try {
    const gasEstimate = await contract.mintCertificate.estimateGas(...mintArgs);
    gasLimit = (gasEstimate * BigInt(135)) / BigInt(100) + BigInt(25_000);
    console.log("[mintFromWallet] estimateGas", gasEstimate.toString(), "using gasLimit", gasLimit.toString());
  } catch (estimateErr) {
    gasLimit = BigInt(1_800_000);
    console.warn(
      "[mintFromWallet] estimateGas failed, using fallback gasLimit",
      gasLimit.toString(),
      extractMintFailureMessage(estimateErr),
    );
  }

  let tx: ethers.ContractTransactionResponse;
  try {
    tx = await contract.mintCertificate(...mintArgs, { gasLimit });
  } catch (sendErr) {
    const msg = extractMintFailureMessage(sendErr);
    console.error("[mintFromWallet] send transaction failed", msg, sendErr);
    throw new Error(msg);
  }
  console.log("[mintFromWallet] tx submitted", tx.hash);
  onTransactionSubmitted?.(tx.hash);

  let receipt: TransactionReceipt | null =
    (await Promise.race([
      tx.wait(),
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), 30_000);
      }),
    ])) ?? null;

  if (!receipt) {
    receipt = await provider.getTransactionReceipt(tx.hash).catch(() => null);
  }

  console.log("[mintFromWallet] receipt received", receipt?.hash, "status", receipt?.status);

  if (receipt && receipt.status === 0) {
    throw new Error(
      "Mint transaction was mined but reverted (status 0). Check explorer for details or try staticCall output above.",
    );
  }

  let tokenId: string | null = null;
  const iface = contract.interface;

  if (receipt) {
    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });
        if (parsed?.name === "CertificateMinted") {
          const id = parsed.args.tokenId ?? parsed.args[0];
          tokenId =
            typeof id === "bigint"
              ? id.toString()
              : id !== undefined && id !== null
                ? String(id)
                : null;
          if (tokenId) break;
        }
      } catch {
        continue;
      }
    }

    if (!tokenId) {
      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog({
            topics: log.topics as string[],
            data: log.data,
          });
          if (parsed?.name === "Transfer") {
            const from = (parsed.args.from ?? parsed.args[0]) as string;
            const id = parsed.args.tokenId ?? parsed.args[2];
            if (from?.toLowerCase() === ethers.ZeroAddress.toLowerCase()) {
              tokenId =
                typeof id === "bigint"
                  ? id.toString()
                  : id !== undefined && id !== null
                    ? String(id)
                    : null;
              if (tokenId) break;
            }
          }
        } catch {
          continue;
        }
      }
    }
  }

  return {
    tokenId,
    txHash: tx.hash,
    explorerUrl: `${CHAINSCAN_BASE_URL}/tx/${tx.hash}`,
    proofLabel: tokenId
      ? `Token #${tokenId}`
      : `Certificate minted. Tx: ${tx.hash.slice(0, 10)}...`,
  };
}
