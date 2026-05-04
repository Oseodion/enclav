import { ethers } from "ethers";
import { resolveOgExplorerUrl, resolveOgRpcUrl } from "@/lib/og-env";

type DeployAction =
  | {
      action: "deployContract";
      abi: string[];
      bytecode: string;
      constructorArgs?: unknown[];
    }
  | {
      action: "readContract";
      contractAddress: string;
      abi: string[];
      method: string;
      args?: unknown[];
    }
  | {
      action: "buildExplorerTxLink";
      txHash: string;
    };

type SkillContext = DeployAction;

function getRuntimeConfig() {
  return {
    privateKey: process.env.DEPLOYER_PRIVATE_KEY ?? "",
    rpcUrl: resolveOgRpcUrl(),
  };
}

async function getSigner() {
  const { privateKey, rpcUrl } = getRuntimeConfig();
  if (!privateKey) {
    throw new Error("DEPLOYER_PRIVATE_KEY is required for 0g-deploy skill.");
  }
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  return new ethers.Wallet(privateKey, provider);
}

export const zeroGDeploySkill = {
  name: "0g-deploy",
  description:
    "Deploy and interact with 0G Chain smart contracts from chat using a wallet-backed execution context.",
  async execute(context: SkillContext) {
    if (context.action === "buildExplorerTxLink") {
      return {
        explorerUrl: `${resolveOgExplorerUrl()}/tx/${context.txHash}`,
      };
    }

    const signer = await getSigner();

    if (context.action === "deployContract") {
      const factory = new ethers.ContractFactory(
        context.abi,
        context.bytecode,
        signer,
      );
      const contract = await factory.deploy(...(context.constructorArgs ?? []));
      await contract.waitForDeployment();
      const address = await contract.getAddress();
      return {
        contractAddress: address,
      };
    }

    const contract = new ethers.Contract(
      context.contractAddress,
      context.abi,
      signer.provider,
    );
    const method = contract.getFunction(context.method);
    const result = await method(...(context.args ?? []));
    return { result };
  },
};
