import { ethers, type InterfaceAbi } from "ethers";
import type { WalletClient } from "viem";
import EnclavAbi from "./enclav-abi.json";

export const INFT_CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_INFT_CONTRACT_ADDRESS ??
  "0x8E2225136CaAf9aD28dDBF86e9280DB326AB2464";
export const OG_RPC_URL = process.env.NEXT_PUBLIC_OG_RPC_URL ?? "https://evmrpc-testnet.0g.ai";
const CHAINSCAN_BASE_URL = "https://chainscan-galileo.0g.ai";
const OG_GALILEO_CHAIN_ID = 16602;
const OG_GALILEO_CHAIN_ID_HEX = "0x40da";

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
};

export type MintCertificateResult = {
  tokenId: string | null;
  txHash: string;
  explorerUrl: string;
  proofLabel: string;
};

export async function mintFromWallet(
  walletClient: WalletClient | null | undefined,
  scanData: MintScanData,
  onTransactionSubmitted?: (txHash: string) => void,
): Promise<MintCertificateResult> {
  void walletClient;
  console.log("[mintFromWallet] starting", {
    contract: INFT_CONTRACT_ADDRESS,
    repoUrl: scanData.repoUrl,
  });
  if (!INFT_CONTRACT_ADDRESS) {
    throw new Error("INFT_CONTRACT_ADDRESS is required to mint certificates.");
  }
  const injectedProvider = (
    globalThis as { ethereum?: ethers.Eip1193Provider }
  ).ethereum;
  if (!injectedProvider) throw new Error("No injected wallet provider found.");

  const currentChainHex = (await injectedProvider.request({
    method: "eth_chainId",
  })) as string;
  if (Number.parseInt(currentChainHex, 16) !== OG_GALILEO_CHAIN_ID) {
    try {
      await injectedProvider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: OG_GALILEO_CHAIN_ID_HEX }],
      });
    } catch (switchError) {
      const switchCode =
        switchError && typeof switchError === "object" && "code" in switchError
          ? Number((switchError as { code?: number }).code)
          : undefined;
      if (switchCode === 4902) {
        await injectedProvider.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: OG_GALILEO_CHAIN_ID_HEX,
              chainName: "0G Galileo Testnet",
              nativeCurrency: {
                name: "OG",
                symbol: "OG",
                decimals: 18,
              },
              rpcUrls: [OG_RPC_URL],
              blockExplorerUrls: [CHAINSCAN_BASE_URL],
            },
          ],
        });
        await injectedProvider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: OG_GALILEO_CHAIN_ID_HEX }],
        });
      } else {
        throw switchError;
      }
    }
  }

  const provider = new ethers.BrowserProvider(injectedProvider);
  await provider.send("eth_requestAccounts", []);
  const signer = await provider.getSigner();
  const walletAddress = await signer.getAddress();
  console.log("[mintFromWallet] signer address", walletAddress);
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

  let gasLimit: bigint | undefined;
  try {
    const gasEstimate = await contract.mintCertificate.estimateGas(...mintArgs);
    gasLimit = (gasEstimate * BigInt(135)) / BigInt(100) + BigInt(25_000);
  } catch {
    gasLimit = BigInt(1_800_000);
  }

  const tx = await contract.mintCertificate(...mintArgs, { gasLimit });
  console.log("[mintFromWallet] tx submitted", tx.hash);
  onTransactionSubmitted?.(tx.hash);

  let receipt =
    (await Promise.race([
      tx.wait(),
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), 30_000);
      }),
    ])) ?? null;

  if (!receipt) {
    receipt =
      (await provider.getTransactionReceipt(tx.hash).catch(() => null)) ?? null;
  }

  console.log("[mintFromWallet] receipt received", receipt?.hash);

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
