import { ethers } from "ethers";
import type { WalletClient } from "viem";

export const INFT_CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_INFT_CONTRACT_ADDRESS ??
  "0xE4B6b9f3628990ae769816c7ddE7c7bB33076b7c";
export const OG_RPC_URL = process.env.NEXT_PUBLIC_OG_RPC_URL ?? "https://evmrpc-testnet.0g.ai";
const CHAINSCAN_BASE_URL = "https://chainscan-galileo.0g.ai";

const ENCLAV_ABI = [
  "function mintCertificate(address recipient,string repoUrl,string scanDate,uint256 filesScanned,uint256 totalFindings,uint256 criticalCount,uint256 highCount,uint256 mediumCount,uint256 lowCount,string reportHash) external returns (uint256)",
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
  tokenId: string;
  txHash: string;
  explorerUrl: string;
};

export async function mintFromWallet(
  walletClient: WalletClient,
  scanData: MintScanData,
  onTransactionSubmitted?: () => void,
): Promise<MintCertificateResult> {
  if (!INFT_CONTRACT_ADDRESS) {
    throw new Error("INFT_CONTRACT_ADDRESS is required to mint certificates.");
  }
  if (!walletClient) {
    throw new Error("Connected wallet client is required.");
  }
  const injectedProvider = (
    globalThis as { ethereum?: ethers.Eip1193Provider }
  ).ethereum;
  if (!injectedProvider) throw new Error("No injected wallet provider found.");

  const provider = new ethers.BrowserProvider(injectedProvider);
  await provider.send("eth_requestAccounts", []);
  const signer = await provider.getSigner();
  const walletAddress = await signer.getAddress();
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
  onTransactionSubmitted?.();

  const receipt = await tx.wait();
  if (!receipt) {
    throw new Error("Mint transaction did not return a receipt.");
  }

  let tokenId = "";
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

  if (!tokenId) {
    throw new Error("Unable to parse minted tokenId from transaction logs.");
  }

  return {
    tokenId,
    txHash: receipt.hash,
    explorerUrl: `${CHAINSCAN_BASE_URL}/tx/${receipt.hash}`,
  };
}
