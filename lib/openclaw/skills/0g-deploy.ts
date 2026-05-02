import { ethers } from "ethers";

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

const CHAINSCAN_BASE = "https://chainscan-galileo.0g.ai";

function getRuntimeConfig() {
  return {
    privateKey: process.env.DEPLOYER_PRIVATE_KEY ?? "",
    rpcUrl: process.env.OG_RPC_URL ?? "https://evmrpc-testnet.0g.ai",
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
        explorerUrl: `${CHAINSCAN_BASE}/tx/${context.txHash}`,
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
