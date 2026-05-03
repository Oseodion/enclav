import hre from "hardhat";
import { ethers } from "ethers";

function extractErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object") {
    return String(error);
  }

  const maybe = error as {
    shortMessage?: string;
    message?: string;
    reason?: string;
    data?: unknown;
    info?: { error?: { message?: string; data?: unknown }; payload?: unknown };
  };

  return (
    maybe.shortMessage ??
    maybe.reason ??
    maybe.info?.error?.message ??
    maybe.message ??
    JSON.stringify(maybe)
  );
}

async function main() {
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  const contractAddress = process.env.INFT_CONTRACT_ADDRESS;
  const rpcUrl = process.env.OG_RPC_URL ?? "https://evmrpc-testnet.0g.ai";

  if (!privateKey) {
    throw new Error("DEPLOYER_PRIVATE_KEY is required in .env.local");
  }
  if (!contractAddress) {
    throw new Error("INFT_CONTRACT_ADDRESS is required in .env.local");
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(privateKey, provider);
  const signerAddress = await signer.getAddress();
  const artifact = await hre.artifacts.readArtifact("Enclav");
  const contract = new ethers.Contract(contractAddress, artifact.abi, signer);

  const testPayload = {
    recipient: signerAddress,
    repoUrl: "https://github.com/test/enclav-debug-repo",
    scanDate: new Date().toISOString(),
    filesScanned: 10,
    totalFindings: 3,
    criticalCount: 1,
    highCount: 1,
    mediumCount: 1,
    lowCount: 0,
    reportHash: `debug-report-${Date.now()}`,
  };

  console.log("Testing mintCertificate with:", {
    contractAddress,
    signerAddress,
    rpcUrl,
    chainId: (await provider.getNetwork()).chainId.toString(),
  });

  const args = [
    testPayload.recipient,
    testPayload.repoUrl,
    testPayload.scanDate,
    testPayload.filesScanned,
    testPayload.totalFindings,
    testPayload.criticalCount,
    testPayload.highCount,
    testPayload.mediumCount,
    testPayload.lowCount,
    testPayload.reportHash,
  ] as const;

  try {
    const staticTokenId = await contract.mintCertificate.staticCall(...args);
    console.log("staticCall success, tokenId:", staticTokenId.toString());
  } catch (error) {
    console.error("staticCall revert:", extractErrorMessage(error));
    throw error;
  }

  let gasEstimate: bigint;
  try {
    gasEstimate = await contract.mintCertificate.estimateGas(...args);
    console.log("gas estimate:", gasEstimate.toString());
  } catch (error) {
    console.error("estimateGas failed:", extractErrorMessage(error));
    throw error;
  }

  const tx = await contract.mintCertificate(...args, {
    gasLimit: (gasEstimate * BigInt(140)) / BigInt(100) + BigInt(50000),
  });
  console.log("tx submitted:", tx.hash);

  const receipt = await tx.wait();
  console.log("tx mined:", {
    blockNumber: receipt?.blockNumber,
    status: receipt?.status,
    gasUsed: receipt?.gasUsed?.toString(),
  });
}

main().catch((error) => {
  console.error("test-mint failed:", extractErrorMessage(error));
  process.exitCode = 1;
});
