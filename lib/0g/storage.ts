import { Indexer, MemData } from "@0gfoundation/0g-ts-sdk";
import { ethers } from "ethers";

const STORAGE_INDEXER_URL = "https://indexer-storage-testnet-turbo.0g.ai";
const STORAGE_RPC_URL = "https://evmrpc-testnet.0g.ai";
const STORAGE_UPLOAD_TX_OPTS = {
  gasPrice: ethers.parseUnits("10", "gwei"),
};

export function createStorageClient(_signer: ethers.Signer) {
  try {
    void _signer;
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
    const indexer = createStorageClient(signer);
    const bytes = new TextEncoder().encode(content);
    const memData = new MemData(bytes);

    const [result, uploadError] = await indexer.upload(
      memData,
      STORAGE_RPC_URL,
      signer,
      undefined,
      undefined,
      STORAGE_UPLOAD_TX_OPTS,
    );

    if (uploadError) {
      throw uploadError;
    }

    const parsed = result as
      | { rootHash?: string; rootHashes?: string[] }
      | undefined;
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
