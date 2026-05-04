import { ethers, type InterfaceAbi, type TransactionReceipt } from "ethers";
import type { WalletClient } from "viem";
import {
  getAristotleChainId,
  getGalileoChainId,
  resolveGalileoExplorerUrl,
  resolveGalileoRpcUrl,
  resolveOgExplorerUrl,
  resolveOgRpcUrl,
} from "@/lib/og-env";
import EnclavAbi from "./enclav-abi.json";

const INFT_CONTRACT_DEFAULT = "0x0dd0aE98b0e4Dd46cE8B2aa3A2e9a2feAC503EB5";

function resolveInftContractAddress(): string {
  const raw = (process.env.NEXT_PUBLIC_INFT_CONTRACT_ADDRESS ?? "").trim();
  const chosen = raw.length > 0 ? raw : INFT_CONTRACT_DEFAULT;
  try {
    return ethers.getAddress(chosen);
  } catch {
    return ethers.getAddress(INFT_CONTRACT_DEFAULT);
  }
}

export const INFT_CONTRACT_ADDRESS = resolveInftContractAddress();
export const OG_RPC_URL = resolveOgRpcUrl();
const CHAINSCAN_BASE_URL = resolveOgExplorerUrl();
/** Preferred chain when switching from a non-0G network (Galileo or Aristotle). */
const OG_SWITCH_TARGET_CHAIN_ID = Number(
  process.env.NEXT_PUBLIC_OG_CHAIN_ID ?? process.env.OG_CHAIN_ID ?? String(getAristotleChainId()),
);

const VALID_OG_CHAIN_IDS = new Set<number>([
  getGalileoChainId(),
  getAristotleChainId(),
]);

function toEip155ChainIdHex(chainId: number): string {
  return `0x${BigInt(chainId).toString(16)}`;
}

function chainAddParamsFor(chainId: number): {
  chainIdHex: string;
  chainName: string;
  rpcUrl: string;
  explorerUrl: string;
} {
  const galId = getGalileoChainId();
  const arId = getAristotleChainId();
  if (chainId === galId) {
    return {
      chainIdHex: toEip155ChainIdHex(galId),
      chainName: "0G Galileo Testnet",
      rpcUrl: resolveGalileoRpcUrl(),
      explorerUrl: resolveGalileoExplorerUrl(),
    };
  }
  if (chainId === arId) {
    return {
      chainIdHex: toEip155ChainIdHex(arId),
      chainName: "0G Aristotle Mainnet",
      rpcUrl: OG_RPC_URL,
      explorerUrl: CHAINSCAN_BASE_URL,
    };
  }
  return {
    chainIdHex: toEip155ChainIdHex(chainId),
    chainName: "0G Chain",
    rpcUrl: OG_RPC_URL,
    explorerUrl: CHAINSCAN_BASE_URL,
  };
}

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
  /** From wagmi `useChainId()` - used with `eth_chainId` to detect target chain reliably. */
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

async function requestSwitchToChain(
  injectedProvider: ethers.Eip1193Provider,
  targetChainId: number,
): Promise<void> {
  const targetMeta = chainAddParamsFor(targetChainId);
  try {
    await injectedProvider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: targetMeta.chainIdHex }],
    });
  } catch (switchError) {
    const code = getWalletRpcErrorCode(switchError);
    if (code === 4902) {
      await injectedProvider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: targetMeta.chainIdHex,
            chainName: targetMeta.chainName,
            nativeCurrency: {
              name: "0G",
              symbol: "OG",
              decimals: 18,
            },
            rpcUrls: [targetMeta.rpcUrl],
            blockExplorerUrls: [targetMeta.explorerUrl],
          },
        ],
      });
      await injectedProvider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: targetMeta.chainIdHex }],
      });
    } else if (code === 4001) {
      throw new Error(
        `Wallet rejected switching to 0G network (chain ${targetChainId}). Approve the network switch to continue.`,
      );
    } else {
      throw switchError;
    }
  }
}

/**
 * Same chain-add flow as {@link ensureWalletOnOGNetwork}, but always targets **0G Aristotle**
 * (credits / mainnet). Use this when the user must be on mainnet; `ensureWalletOnOGNetwork` also
 * accepts Galileo and will not switch away from it.
 */
export async function ensureWalletOnAristotleMainnet(
  injectedProvider: ethers.Eip1193Provider,
): Promise<void> {
  const arId = getAristotleChainId();
  const snap = await readWalletChainIdFromProvider(injectedProvider);
  if (Number.isFinite(snap.decimal) && snap.decimal === arId) {
    return;
  }
  console.log("[ensureWalletOnAristotleMainnet] switching to Aristotle", {
    ethChainIdDecimal: snap.decimal,
    target: arId,
  });
  await requestSwitchToChain(injectedProvider, arId);
  const after = await readWalletChainIdFromProvider(injectedProvider);
  if (!Number.isFinite(after.decimal) || after.decimal !== arId) {
    throw new Error(`Wallet must be on 0G Aristotle Mainnet (chain ${arId}).`);
  }
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

function isOnAllowedOGNetwork(ethDecimal: number, wagmiChainId?: number): boolean {
  if (Number.isFinite(ethDecimal) && VALID_OG_CHAIN_IDS.has(ethDecimal)) {
    return true;
  }
  if (
    typeof wagmiChainId === "number" &&
    Number.isFinite(wagmiChainId) &&
    VALID_OG_CHAIN_IDS.has(wagmiChainId)
  ) {
    return true;
  }
  return false;
}

/**
 * Ensures the wallet is on configured Galileo or Aristotle chain IDs (see `og-env`).
 * Does not switch if already on either network. If on another chain, switches toward
 * `NEXT_PUBLIC_OG_CHAIN_ID` / `OG_CHAIN_ID` (default Aristotle mainnet).
 */
export async function ensureWalletOnOGNetwork(
  injectedProvider: ethers.Eip1193Provider,
  wagmiChainId?: number,
): Promise<void> {
  const snap = await readWalletChainIdFromProvider(injectedProvider);
  const switchTarget = VALID_OG_CHAIN_IDS.has(OG_SWITCH_TARGET_CHAIN_ID)
    ? OG_SWITCH_TARGET_CHAIN_ID
    : getAristotleChainId();

  console.log("[ensureWalletOnOGNetwork] chain snapshot", {
    ethChainIdHex: snap.normalizedHex,
    ethChainIdDecimal: snap.decimal,
    wagmiChainId,
    allowedChains: [...VALID_OG_CHAIN_IDS],
    switchTargetIfNeeded: switchTarget,
  });

  if (isOnAllowedOGNetwork(snap.decimal, wagmiChainId)) {
    if (
      typeof wagmiChainId === "number" &&
      Number.isFinite(wagmiChainId) &&
      snap.decimal !== wagmiChainId
    ) {
      console.warn("[ensureWalletOnOGNetwork] eth_chainId decimal vs wagmi useChainId differ", {
        eth_chainId_decimal: snap.decimal,
        wagmiChainId,
      });
    }
    return;
  }

  await requestSwitchToChain(injectedProvider, switchTarget);

  const after = await readWalletChainIdFromProvider(injectedProvider);
  if (!isOnAllowedOGNetwork(after.decimal, wagmiChainId)) {
    throw new Error(
      `Wallet must be on 0G Galileo (${getGalileoChainId()}) or Aristotle (${getAristotleChainId()}). eth_chainId is ${after.normalizedHex} (decimal ${after.decimal}).`,
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

  await ensureWalletOnOGNetwork(injectedProvider, wagmiChainId);

  const provider = new ethers.BrowserProvider(injectedProvider);
  await provider.send("eth_requestAccounts", []);
  const signer = await provider.getSigner();
  const walletAddress = ethers.getAddress(await signer.getAddress());

  const chainSnap = await readWalletChainIdFromProvider(injectedProvider);
  const chainIdHex = chainSnap.normalizedHex;
  const chainIdDec = chainSnap.decimal;

  const codeHex = (await injectedProvider.request({
    method: "eth_getCode",
    params: [ethers.getAddress(INFT_CONTRACT_ADDRESS), "latest"],
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
      `No contract bytecode at ${INFT_CONTRACT_ADDRESS} on this network. Check NEXT_PUBLIC_INFT_CONTRACT_ADDRESS and that the wallet is on the configured 0G chain.`,
    );
  }

  const contract = new ethers.Contract(
    ethers.getAddress(INFT_CONTRACT_ADDRESS),
    ENCLAV_ABI,
    signer,
  );

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
