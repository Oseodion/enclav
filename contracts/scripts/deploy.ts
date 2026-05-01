import hre from "hardhat";
import { ethers } from "ethers";

async function main() {
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("DEPLOYER_PRIVATE_KEY is required in .env.local");
  }

  const provider = new ethers.JsonRpcProvider("https://evmrpc-testnet.0g.ai");
  const signer = new ethers.Wallet(privateKey, provider);
  const artifact = await hre.artifacts.readArtifact("Enclav");
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, signer);
  const contract = await factory.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("Enclav deployed to:", address);
  console.log("Add this to .env.local as:");
  console.log(`INFT_CONTRACT_ADDRESS=${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
