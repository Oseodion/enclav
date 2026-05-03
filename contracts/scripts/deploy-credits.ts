import hre from "hardhat";
import { ethers } from "ethers";

async function main() {
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("DEPLOYER_PRIVATE_KEY is required in .env.local");
  }

  const provider = new ethers.JsonRpcProvider("https://evmrpc-testnet.0g.ai");
  const signer = new ethers.Wallet(privateKey, provider);
  const artifact = await hre.artifacts.readArtifact("EnclavCredits");
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, signer);
  const contract = await factory.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("EnclavCredits deployed to:", address);
  console.log("Add to .env.local:");
  console.log(`CREDITS_CONTRACT_ADDRESS=${address}`);
  console.log(`NEXT_PUBLIC_CREDITS_CONTRACT_ADDRESS=${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
