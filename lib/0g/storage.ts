import { Indexer } from "@0gfoundation/0g-ts-sdk";
import { ethers } from "ethers";

const STORAGE_INDEXER_URL = "https://indexer-storage-testnet-turbo.0g.ai";

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
    const indexer = createStorageClient(signer) as unknown as {
      upload?: (...args: unknown[]) => Promise<unknown>;
      uploadFile?: (...args: unknown[]) => Promise<unknown>;
    };

    const payload = {
      name: filename,
      data: content,
      size: Buffer.byteLength(content, "utf8"),
    };

    let result: unknown;
    if (typeof indexer.uploadFile === "function") {
      result = await indexer.uploadFile(payload, signer);
    } else if (typeof indexer.upload === "function") {
      result = await indexer.upload(payload, signer);
    } else {
      throw new Error("Indexer upload method not found.");
    }

    const asRecord = result as
      | { rootHash?: string }
      | Array<{ rootHash?: string }>
      | undefined;
    const rootHash = Array.isArray(asRecord)
      ? asRecord[0]?.rootHash
      : asRecord?.rootHash;

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
