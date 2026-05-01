import { ethers } from "ethers";

const OG_RPC_URL = process.env.OG_RPC_URL ?? "https://evmrpc-testnet.0g.ai";
const INFT_CONTRACT_ADDRESS = process.env.INFT_CONTRACT_ADDRESS ?? "";
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

export async function mintCertificate(
  walletAddress: string,
  scanData: MintScanData,
): Promise<MintCertificateResult> {
  if (!INFT_CONTRACT_ADDRESS) {
    throw new Error("INFT_CONTRACT_ADDRESS is required to mint certificates.");
  }

  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("DEPLOYER_PRIVATE_KEY is required to mint certificates.");
  }

  const provider = new ethers.JsonRpcProvider(OG_RPC_URL);
  const signer = new ethers.Wallet(privateKey, provider);
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
