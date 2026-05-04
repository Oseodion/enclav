import hre from "hardhat";
import { ethers } from "ethers";
import { resolveOgRpcUrl } from "../../lib/og-env";

async function main() {
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("DEPLOYER_PRIVATE_KEY is required in .env.local");
  }

  const networkName = process.env.HARDHAT_NETWORK ?? "unknown";
  const networkConfig = hre.config.networks[networkName] as { url?: string } | undefined;
  const rpcUrl = networkConfig?.url ?? process.env.OG_RPC_URL ?? resolveOgRpcUrl();
  if (!rpcUrl) {
    throw new Error(`RPC URL missing for network "${networkName}".`);
  }
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(privateKey, provider);
  const artifact = await hre.artifacts.readArtifact("EnclavCredits");
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, signer);
  const contract = await factory.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log(`EnclavCredits deployed to (${networkName}):`, address);
  console.log("Add to .env.local:");
  console.log(`CREDITS_CONTRACT_ADDRESS=${address}`);
  console.log(`NEXT_PUBLIC_CREDITS_CONTRACT_ADDRESS=${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
