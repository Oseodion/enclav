import { Indexer, MemData } from "@0gfoundation/0g-ts-sdk";
import { ethers } from "ethers";
import { resolveOgRpcUrl, resolveOgStorageIndexerUrl } from "@/lib/og-env";

const STORAGE_INDEXER_URL = resolveOgStorageIndexerUrl();
const STORAGE_RPC_URL = resolveOgRpcUrl();
const MAX_UPLOAD_RETRIES = 3;
const MAINNET_CHAIN_ID = 16661;
const DEFAULT_UPLOAD_TIMEOUT_MS = 30_000;
const MAINNET_UPLOAD_TIMEOUT_MS = 180_000;
const UPLOAD_TIMEOUT_RETRY_DELAY_MS = 10_000;
const MAX_TIMEOUT_RETRY = 1;
const BASE_GAS_PRICE_GWEI = BigInt(100);
const BASE_PRIORITY_GWEI = BigInt(10);

class StorageUploadTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageUploadTimeoutError";
  }
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function getStorageUploadTimeoutMs(): number {
  const chainId = Number(
    process.env.OG_CHAIN_ID ?? process.env.NEXT_PUBLIC_OG_CHAIN_ID ?? MAINNET_CHAIN_ID,
  );
  return chainId === MAINNET_CHAIN_ID ? MAINNET_UPLOAD_TIMEOUT_MS : DEFAULT_UPLOAD_TIMEOUT_MS;
}

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

/**
 * Download UTF-8 text from 0G Storage by content root hash (for long-context memory retrieval).
 */
export async function downloadTextByRootHash(rootHash: string): Promise<string | null> {
  const raw = rootHash.trim();
  if (!raw) return null;
  const hex = raw.startsWith("0x") ? raw.slice(2) : raw;
  if (!/^[0-9a-fA-F]{64}$/i.test(hex)) {
    return null;
  }
  const h = `0x${hex.toLowerCase()}`;
  try {
    const indexer = createStorageClient();
    const [blob, err] = await indexer.downloadToBlob(h);
    if (err || !blob) {
      return null;
    }
    return await blob.text();
  } catch {
    return null;
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
    let timeoutRetried = 0;
    let skippedBecauseFinalized = false;
    const timeoutMs = getStorageUploadTimeoutMs();

    for (let attempt = 0; attempt < MAX_UPLOAD_RETRIES; attempt += 1) {
      const multiplier = BigInt(2) ** BigInt(attempt);
      const highGasSigner = new HighGasSigner(signer, provider, multiplier);

      let skipMessageSeen = false;
      let finalizedMessageSeen = false;
      const uploadPromise = indexer.upload(
        memData,
        STORAGE_RPC_URL,
        highGasSigner,
        {
          skipIfFinalized: true,
          onProgress: (message) => {
            if (message.includes("Found existing file info")) {
              skipMessageSeen = true;
            }
            if (message.includes("finalized: true")) {
              finalizedMessageSeen = true;
            }
          },
        },
      );

      let uploadTuple:
        | [
            (
              | { txHash: string; rootHash: string; txSeq: number }
              | { txHashes: string[]; rootHashes: string[]; txSeqs: number[] }
            ),
            Error | null,
          ]
        | null = null;
      try {
        uploadTuple = await Promise.race([
          uploadPromise,
          new Promise<null>((_, reject) => {
            setTimeout(() => {
              reject(
                new StorageUploadTimeoutError(
                  `upload timed out after ${Math.floor(timeoutMs / 1000)}s`,
                ),
              );
            }, timeoutMs);
          }),
        ]);
      } catch (error) {
        if (
          error instanceof StorageUploadTimeoutError &&
          timeoutRetried < MAX_TIMEOUT_RETRY
        ) {
          timeoutRetried += 1;
          console.warn(
            `[storage] upload timed out for "${filename}" — retrying once in ${Math.floor(UPLOAD_TIMEOUT_RETRY_DELAY_MS / 1000)}s`,
          );
          await sleep(UPLOAD_TIMEOUT_RETRY_DELAY_MS);
          attempt -= 1;
          continue;
        }
        throw error;
      }

      if (!uploadTuple) {
        throw new Error(`Storage upload returned no result for "${filename}".`);
      }
      const [uploadResult, error] = uploadTuple;
      skippedBecauseFinalized = skipMessageSeen && finalizedMessageSeen;

      if (!error) {
        result = uploadResult as typeof result;
        uploadError = null;
        if (skippedBecauseFinalized) {
          console.log(`[storage] ${filename} already on 0G Storage`);
        }
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
    if (error instanceof StorageUploadTimeoutError) {
      throw new Error(
        `Failed to upload "${filename}" to 0G Storage: upload timed out — stored locally — blockchain confirmation pending`,
      );
    }
    const message =
      error instanceof Error ? error.message : "Unknown upload error";
    throw new Error(`Failed to upload "${filename}" to 0G Storage: ${message}`);
  }
}
