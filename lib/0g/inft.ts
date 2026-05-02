import { ethers } from "ethers";
import type { WalletClient } from "viem";

export const INFT_CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_INFT_CONTRACT_ADDRESS ??
  "0xE4B6b9f3628990ae769816c7ddE7c7bB33076b7c";
export const OG_RPC_URL = process.env.NEXT_PUBLIC_OG_RPC_URL ?? "https://evmrpc-testnet.0g.ai";
const CHAINSCAN_BASE_URL = "https://chainscan-galileo.0g.ai";
const OG_GALILEO_CHAIN_ID = 16602;
const OG_GALILEO_CHAIN_ID_HEX = "0x40da";

const ENCLAV_ABI = [
  "function mintCertificate(address recipient,string repoUrl,string scanDate,uint256 filesScanned,uint256 totalFindings,uint256 criticalCount,uint256 highCount,uint256 mediumCount,uint256 lowCount,string reportHash) external returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "event CertificateMinted(uint256 indexed tokenId, address indexed recipient, string repoUrl, string reportHash)",
] as const;

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
  console.log("[mintFromWallet] starting", {
    hasWalletClient: Boolean(walletClient),
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

  // Ensure wallet is connected to 0G Galileo before minting.
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

  const tx = await contract.mintCertificate(
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
  );
  console.log("[mintFromWallet] tx submitted", tx.hash);
  onTransactionSubmitted?.(tx.hash);

  const receipt = await Promise.race([
    tx.wait(),
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), 30_000);
    }),
  ]);
  console.log("[mintFromWallet] receipt received", receipt?.hash);

  let tokenId: string | null = null;
  if (receipt) {
    for (const log of receipt.logs) {
      try {
        const parsed = contract.interface.parseLog(log);
        if (parsed?.name === "CertificateMinted") {
          tokenId = parsed.args.tokenId.toString();
          break;
        }
      } catch {
        continue;
      }
    }
  }

  if (!tokenId) {
    try {
      const balance = await contract.balanceOf(walletAddress);
      if (balance && balance > BigInt(0)) {
        tokenId = balance.toString();
      }
    } catch (error) {
      console.log("[mintFromWallet] balanceOf fallback failed", error);
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
