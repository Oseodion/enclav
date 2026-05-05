import { ethers } from "ethers";
import { createRequire } from "node:module";
import path from "node:path";

type ComputeBrokerModule = {
  createZGComputeNetworkBroker?: (signer: ethers.Signer) => Promise<unknown>;
  default?: {
    createZGComputeNetworkBroker?: (signer: ethers.Signer) => Promise<unknown>;
  };
};

type LedgerApi = {
  addLedger: (amount: number, gasPrice?: number) => Promise<void>;
  depositFund: (amount: number, gasPrice?: number) => Promise<void>;
  transferFund: (
    provider: string,
    serviceTypeStr: "inference" | "fine-tuning",
    amount: bigint,
    gasPrice?: number,
  ) => Promise<void>;
  getLedger: () => Promise<unknown>;
};

type BrokerWithLedger = {
  ledger?: LedgerApi;
};

const MAINNET_RPC_URL = "https://evmrpc.0g.ai";
const QWEN_PROVIDER = "0x992e6396157Dc4f22E74F2231235D7DE62696db5";
const MAIN_LEDGER_BOOTSTRAP_OG = 3;
const SUB_ACCOUNT_FUND_OG = "1.0";

async function main() {
  const require = createRequire(import.meta.url);
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY?.trim() ?? "";
  if (!privateKey) {
    throw new Error("DEPLOYER_PRIVATE_KEY is required in .env.local");
  }

  const rpcRequest = new ethers.FetchRequest(MAINNET_RPC_URL);
  rpcRequest.timeout = 120_000;
  const provider = new ethers.JsonRpcProvider(rpcRequest);
  const signer = new ethers.Wallet(privateKey, provider);

  // Hardhat runtime in this repo resolves the package ESM entry with incompatible re-exports,
  // so load the verified CommonJS entry directly for this one-off setup script.
  const brokerCjsPath = path.resolve(
    process.cwd(),
    "node_modules/@0glabs/0g-serving-broker/lib.commonjs/index.js",
  );
  const mod = require(brokerCjsPath) as ComputeBrokerModule;
  const createZGComputeNetworkBroker =
    mod.createZGComputeNetworkBroker ??
    mod.default?.createZGComputeNetworkBroker;

  if (typeof createZGComputeNetworkBroker !== "function") {
    throw new Error("createZGComputeNetworkBroker not found on @0glabs/0g-serving-broker");
  }

  const broker = (await createZGComputeNetworkBroker(signer)) as BrokerWithLedger;
  const ledger = broker.ledger;
  if (!ledger?.addLedger || !ledger.depositFund || !ledger.transferFund || !ledger.getLedger) {
    throw new Error("Broker ledger API is unavailable.");
  }

  console.log("[setup-compute] Ensuring main ledger has +3 OG...");
  try {
    await ledger.addLedger(MAIN_LEDGER_BOOTSTRAP_OG);
    console.log("[setup-compute] Main ledger created with 3 OG.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Account already exists")) {
      console.log("[setup-compute] Main ledger already exists; depositing 3 OG instead.");
      await ledger.depositFund(MAIN_LEDGER_BOOTSTRAP_OG);
    } else {
      throw error;
    }
  }

  console.log(
    `[setup-compute] Funding Qwen inference sub-account with ${SUB_ACCOUNT_FUND_OG} OG...`,
  );
  await ledger.transferFund(
    QWEN_PROVIDER,
    "inference",
    ethers.parseEther(SUB_ACCOUNT_FUND_OG),
  );

  const ledgerState = await ledger.getLedger();
  console.log("[setup-compute] Success. Current ledger state:", ledgerState);
}

main().catch((error: unknown) => {
  console.error("[setup-compute] Failed:", error);
  process.exitCode = 1;
});
