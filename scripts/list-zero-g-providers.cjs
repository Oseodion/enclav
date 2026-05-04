/**
 * Run: node scripts/list-zero-g-providers.cjs
 * Loads .env.local and lists broker.inference.listService() rows (mainnet).
 */
const { readFileSync, existsSync } = require("node:fs");
const { resolve } = require("node:path");
const { ethers } = require("ethers");

function loadEnvLocal() {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) throw new Error("Missing .env.local");
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

async function main() {
  loadEnvLocal();
  const pk =
    process.env.ZERO_G_CHAIN_PRIVATE_KEY?.trim() ||
    process.env.DEPLOYER_PRIVATE_KEY?.trim();
  if (!pk) throw new Error("ZERO_G_CHAIN_PRIVATE_KEY or DEPLOYER_PRIVATE_KEY required");

  const rpc =
    process.env.ZERO_G_CHAIN_RPC_URL?.trim() ||
    process.env.OG_RPC_URL?.trim() ||
    "https://evmrpc.0g.ai";

  const wallet = new ethers.Wallet(pk, new ethers.JsonRpcProvider(rpc));
  const mod = await import("@0glabs/0g-serving-broker");
  const createZGComputeNetworkBroker =
    mod.createZGComputeNetworkBroker ??
    mod.default?.createZGComputeNetworkBroker;
  if (typeof createZGComputeNetworkBroker !== "function") {
    throw new Error("createZGComputeNetworkBroker not found on broker package");
  }
  const broker = await createZGComputeNetworkBroker(wallet);
  const rows = await broker.inference.listService(0, 20, true);
  console.log("Total services:", rows.length);
  for (const row of rows) {
    const label = `${row.model ?? ""} ${row.name ?? ""} ${row.serviceName ?? ""}`.toLowerCase();
    let tag = "";
    if (/qwen/i.test(label)) tag = "qwen";
    else if (/glm|zhipu/i.test(label)) tag = "glm";
    else if (/deepseek/i.test(label)) tag = "deepseek";
    console.log(
      `${row.provider ?? "?"}  [${tag || "other"}]  model=${row.model ?? ""} name=${row.name ?? ""}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
