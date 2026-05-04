import { config as loadEnv } from "dotenv";
import { HardhatUserConfig } from "hardhat/config";
import {
  getAristotleChainId,
  getGalileoChainId,
  resolveGalileoRpcUrl,
  resolveOgRpcUrl,
} from "./lib/og-env";

loadEnv({ path: ".env.local" });

if (!process.env.DEPLOYER_PRIVATE_KEY) {
  throw new Error("DEPLOYER_PRIVATE_KEY not set in environment");
}

const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY ?? "";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  networks: {
    ogGalileo: {
      type: "http",
      url: resolveGalileoRpcUrl(),
      chainId: getGalileoChainId(),
      accounts: deployerPrivateKey ? [deployerPrivateKey] : [],
    },
    ogAristotle: {
      type: "http",
      url: resolveOgRpcUrl(),
      chainId: getAristotleChainId(),
      accounts: deployerPrivateKey ? [deployerPrivateKey] : [],
    },
  },
};

export default config;
