import { Indexer, MemData } from "@0gfoundation/0g-ts-sdk";
import { ethers } from "ethers";

const DEFAULT_STORAGE_INDEXER_URL = "https://indexer-storage-testnet-turbo.0g.ai";
const DEFAULT_STORAGE_RPC_URL = "https://evmrpc-testnet.0g.ai";
const STORAGE_INDEXER_URL =
  process.env.OG_STORAGE_INDEXER_URL ?? DEFAULT_STORAGE_INDEXER_URL;
const STORAGE_RPC_URL = process.env.OG_RPC_URL ?? DEFAULT_STORAGE_RPC_URL;
const MAX_UPLOAD_RETRIES = 3;
const BASE_GAS_PRICE_GWEI = BigInt(100);
const BASE_PRIORITY_GWEI = BigInt(10);

class HighGasSigner extends ethers.AbstractSigner {
  private readonly inner: ethers.Signer;
  private readonly gasMultiplier: bigint;

  constructor(
    inner: ethers.Signer,
    provider: ethers.Provider,
    gasMultiplier: bigint = BigInt(1),
  ) {
    super(provider);
    this.inner = inner;
    this.gasMultiplier = gasMultiplier;
  }

  async getFeeData() {
    return {
      gasPrice: ethers.parseUnits(
        (BASE_GAS_PRICE_GWEI * this.gasMultiplier).toString(),
        "gwei",
      ),
      maxFeePerGas: ethers.parseUnits(
        (BASE_GAS_PRICE_GWEI * this.gasMultiplier).toString(),
        "gwei",
      ),
      maxPriorityFeePerGas: ethers.parseUnits(
        (BASE_PRIORITY_GWEI * this.gasMultiplier).toString(),
        "gwei",
      ),
    };
  }

  async getAddress() {
    return this.inner.getAddress();
  }

  async signTransaction(tx: ethers.TransactionRequest) {
    return this.inner.signTransaction(tx);
  }

  async signMessage(message: string | Uint8Array) {
    return this.inner.signMessage(message);
  }

  async signTypedData(
    domain: ethers.TypedDataDomain,
    types: Record<string, Array<ethers.TypedDataField>>,
    value: Record<string, unknown>,
  ) {
    return this.inner.signTypedData(domain, types, value);
  }

  connect(provider: ethers.Provider) {
    return new HighGasSigner(this.inner, provider, this.gasMultiplier);
  }
}

export function createStorageClient() {
  try {
    return new Indexer(STORAGE_INDEXER_URL);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown storage client error";
    throw new Error(`Failed to create 0G Storage client: ${message}`);
  }
}

export async function uploadFile(
  content: string,
  filename: string,
  signer: ethers.Signer,
) {
  try {
    void filename;
    const indexer = createStorageClient();
    const bytes = new TextEncoder().encode(content);
    const memData = new MemData(bytes);

    const provider =
      signer.provider ?? new ethers.JsonRpcProvider(STORAGE_RPC_URL);

    let result:
      | {
          txHash?: string;
          rootHash?: string;
          txSeq?: number;
          txHashes?: string[];
          rootHashes?: string[];
          txSeqs?: number[];
        }
      | undefined;
    let uploadError: Error | null = null;

    for (let attempt = 0; attempt < MAX_UPLOAD_RETRIES; attempt += 1) {
      const multiplier = BigInt(2) ** BigInt(attempt);
      const highGasSigner = new HighGasSigner(signer, provider, multiplier);

      const [uploadResult, error] = await indexer.upload(
        memData,
        STORAGE_RPC_URL,
        highGasSigner,
      );

      if (!error) {
        result = uploadResult as typeof result;
        uploadError = null;
        break;
      }

      uploadError = error;
      const message = (error as Error).message ?? String(error);
      const isUnderpriced =
        message.includes("REPLACEMENT_UNDERPRICED") ||
        message.includes("replacement fee too low") ||
        message.toLowerCase().includes("underpriced");

      if (!isUnderpriced || attempt === MAX_UPLOAD_RETRIES - 1) {
        break;
      }
    }

    if (uploadError) {
      throw uploadError;
    }

    const parsed = result;
    const rootHash = parsed?.rootHash ?? parsed?.rootHashes?.[0];

    if (!rootHash) {
      throw new Error("Missing rootHash in storage upload response.");
    }

    return rootHash;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown upload error";
    throw new Error(`Failed to upload "${filename}" to 0G Storage: ${message}`);
  }
}
