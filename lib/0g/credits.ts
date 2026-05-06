import { ethers, type InterfaceAbi } from "ethers";
import type { WalletClient } from "viem";
import { ensureWalletOnOGNetwork, OG_RPC_URL } from "@/lib/0g/inft";

/** Default EnclavCredits deployment (override with env in production). */
const DEFAULT_CREDITS_CONTRACT =
  "0xD0ad553838F8b8ac5CFdccA33588c7723d6Bc073";

/** Resolved credits contract (server may set CREDITS_CONTRACT_ADDRESS; client needs NEXT_PUBLIC_*). */
export function getCreditsContractAddress(): string {
  const raw =
    process.env.CREDITS_CONTRACT_ADDRESS?.trim() ??
    process.env.NEXT_PUBLIC_CREDITS_CONTRACT_ADDRESS?.trim() ??
    DEFAULT_CREDITS_CONTRACT;
  try {
    return ethers.getAddress(raw);
  } catch {
    return ethers.getAddress(DEFAULT_CREDITS_CONTRACT);
  }
}

export const CREDITS_CONTRACT_ADDRESS = getCreditsContractAddress();

/** Cost per completed scan (native OG, 18 decimals). */
export const SCAN_CREDIT_COST_WEI = ethers.parseEther("0.05");

const ENCLAV_CREDITS_ABI = [
  "function credits(address user) view returns (uint256)",
  "function deposit() payable",
  "function withdraw()",
  "function withdrawAmount(uint256 amount)",
  "function owner() view returns (address)",
  "function deductCredits(address user, uint256 amount)",
  "event Deposited(address indexed user, uint256 amount)",
  "event Credited(address indexed user, uint256 amount)",
] as const satisfies readonly string[];

const ABI = ENCLAV_CREDITS_ABI as unknown as InterfaceAbi;

function requireCreditsAddress(): string {
  const addr = getCreditsContractAddress();
  if (!addr) {
    throw new Error(
      "Set CREDITS_CONTRACT_ADDRESS or NEXT_PUBLIC_CREDITS_CONTRACT_ADDRESS to the EnclavCredits contract.",
    );
  }
  return ethers.getAddress(addr);
}

export async function getCreditsBalance(walletAddress: string): Promise<bigint> {
  const addr = requireCreditsAddress();
  if (!ethers.isAddress(walletAddress)) {
    throw new Error("Invalid wallet address for credit balance.");
  }
  const user = ethers.getAddress(walletAddress);
  const provider = new ethers.JsonRpcProvider(OG_RPC_URL);
  const c = new ethers.Contract(addr, ABI, provider);
  const bal: bigint = await c.credits(user);
  return bal;
}

function extractErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const o = error as {
      reason?: string;
      shortMessage?: string;
      message?: string;
    };
    if (typeof o.reason === "string" && o.reason.trim()) return o.reason.trim();
    if (typeof o.shortMessage === "string" && o.shortMessage.trim()) return o.shortMessage.trim();
    if (typeof o.message === "string" && o.message.trim()) return o.message.trim();
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * Deposit native OG into scan credits (wallet must confirm in MetaMask).
 * @param amountWei full wei amount (e.g. from parseEther)
 */
export async function depositCredits(
  walletClient: WalletClient | null | undefined,
  amountWei: bigint,
  options?: { wagmiChainId?: number },
): Promise<{ txHash: string }> {
  void walletClient;
  if (amountWei <= BigInt(0)) {
    throw new Error("Deposit amount must be positive.");
  }
  const contractAddr = requireCreditsAddress();
  const injectedProvider = (globalThis as { ethereum?: ethers.Eip1193Provider }).ethereum;
  if (!injectedProvider) throw new Error("No injected wallet provider found.");

  await ensureWalletOnOGNetwork(injectedProvider, options?.wagmiChainId);

  const provider = new ethers.BrowserProvider(injectedProvider);
  await provider.send("eth_requestAccounts", []);
  const signer = await provider.getSigner();
  const c = new ethers.Contract(contractAddr, ABI, signer);
  const tx = await c.deposit({ value: amountWei });
  const receipt = await tx.wait();
  if (!receipt) throw new Error("Deposit transaction receipt missing.");
  return { txHash: receipt.hash };
}

export async function withdrawCredits(
  walletClient: WalletClient | null | undefined,
  options?: { wagmiChainId?: number },
): Promise<{ txHash: string }> {
  void walletClient;
  const contractAddr = requireCreditsAddress();
  const injectedProvider = (globalThis as { ethereum?: ethers.Eip1193Provider }).ethereum;
  if (!injectedProvider) throw new Error("No injected wallet provider found.");

  await ensureWalletOnOGNetwork(injectedProvider, options?.wagmiChainId);

  const provider = new ethers.BrowserProvider(injectedProvider);
  await provider.send("eth_requestAccounts", []);
  const signer = await provider.getSigner();
  const c = new ethers.Contract(contractAddr, ABI, signer);
  try {
    const tx = await c.withdraw();
    const receipt = await tx.wait();
    if (!receipt) throw new Error("Withdraw transaction receipt missing.");
    return { txHash: receipt.hash };
  } catch (e) {
    throw new Error(extractErrorMessage(e));
  }
}

/** Withdraw a partial credit balance (requires contract with withdrawAmount). */
export async function withdrawCreditsAmount(
  walletClient: WalletClient | null | undefined,
  amountWei: bigint,
  options?: { wagmiChainId?: number },
): Promise<{ txHash: string }> {
  void walletClient;
  if (amountWei <= BigInt(0)) {
    throw new Error("Withdraw amount must be positive.");
  }
  const contractAddr = requireCreditsAddress();
  const injectedProvider = (globalThis as { ethereum?: ethers.Eip1193Provider }).ethereum;
  if (!injectedProvider) throw new Error("No injected wallet provider found.");

  await ensureWalletOnOGNetwork(injectedProvider, options?.wagmiChainId);

  const provider = new ethers.BrowserProvider(injectedProvider);
  await provider.send("eth_requestAccounts", []);
  const signer = await provider.getSigner();
  const c = new ethers.Contract(contractAddr, ABI, signer);
  try {
    const tx = await c.withdrawAmount(amountWei);
    const receipt = await tx.wait();
    if (!receipt) throw new Error("Withdraw transaction receipt missing.");
    return { txHash: receipt.hash };
  } catch (e) {
    throw new Error(extractErrorMessage(e));
  }
}

/**
 * Server-only: owner wallet deducts user credits after a successful scan.
 */
export async function deductCreditsFromServer(
  userAddress: string,
  amountWei: bigint,
  deployerPrivateKey: string,
): Promise<{ txHash: string }> {
  const addr = requireCreditsAddress();
  if (!ethers.isAddress(userAddress)) {
    throw new Error("Invalid user address for deductCredits.");
  }
  const normalizedUser = ethers.getAddress(userAddress);
  const pk = deployerPrivateKey.trim();
  if (!pk.startsWith("0x") || pk.length < 60) {
    throw new Error("Invalid deployer private key for deductCredits.");
  }
  const provider = new ethers.JsonRpcProvider(OG_RPC_URL);
  const signer = new ethers.Wallet(pk, provider);
  const cOwner = new ethers.Contract(addr, ABI, signer);
  const tx = await cOwner.deductCredits(normalizedUser, amountWei);
  const receipt = await tx.wait();
  if (!receipt) throw new Error("deductCredits receipt missing.");
  return { txHash: receipt.hash };
}

/** Server-only: owner wallet withdraws its own credits to native OG balance. */
export async function withdrawOwnerCreditsFromServer(
  deployerPrivateKey: string,
): Promise<{ txHash: string; withdrawnWei: bigint }> {
  const addr = requireCreditsAddress();
  const pk = deployerPrivateKey.trim();
  if (!pk.startsWith("0x") || pk.length < 60) {
    throw new Error("Invalid deployer private key for withdraw.");
  }
  const provider = new ethers.JsonRpcProvider(OG_RPC_URL);
  const signer = new ethers.Wallet(pk, provider);
  const cOwner = new ethers.Contract(addr, ABI, signer);
  const ownerAddress = await signer.getAddress();
  const balanceBefore: bigint = await cOwner.credits(ownerAddress);
  if (balanceBefore <= BigInt(0)) {
    return { txHash: "", withdrawnWei: BigInt(0) };
  }
  const tx = await cOwner.withdrawAmount(balanceBefore);
  const receipt = await tx.wait();
  if (!receipt) throw new Error("withdraw receipt missing.");
  return { txHash: receipt.hash, withdrawnWei: balanceBefore };
}

export function formatOgFromWei(wei: bigint, fractionDigits = 4): string {
  const s = ethers.formatEther(wei);
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  return n.toFixed(fractionDigits);
}
