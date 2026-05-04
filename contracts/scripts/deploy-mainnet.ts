import hre from "hardhat";
import { ethers } from "ethers";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const ARISTOTLE_RPC_URL = "https://evmrpc.0g.ai";

async function confirmMainnetDeploy(): Promise<void> {
  const rl = readline.createInterface({ input, output });
  try {
    console.log("WARNING: You are about to deploy to 0G Aristotle mainnet.");
    console.log("This action uses real funds and cannot be undone.");
    const response = await rl.question('Type "DEPLOY" to continue: ');
    if (response.trim() !== "DEPLOY") {
      throw new Error("Mainnet deployment cancelled by user.");
    }
  } finally {
    rl.close();
  }
}

async function main() {
  await confirmMainnetDeploy();

  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("DEPLOYER_PRIVATE_KEY is required in .env.local");
  }

  const provider = new ethers.JsonRpcProvider(ARISTOTLE_RPC_URL);
  const signer = new ethers.Wallet(privateKey, provider);
  const artifact = await hre.artifacts.readArtifact("Enclav");
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, signer);
  const contract = await factory.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("Enclav deployed to 0G Aristotle:", address);
  console.log("Add this to .env.local as:");
  console.log(`NEXT_PUBLIC_INFT_CONTRACT_ADDRESS=${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
