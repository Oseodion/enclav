import { ethers } from "ethers";
import {
  initializeComputeAccount,
  scanFileForVulnerabilities,
} from "@/lib/0g/compute";
import { uploadFile } from "@/lib/0g/storage";

type ScanRequestBody = {
  repoUrl?: string;
  walletAddress?: string;
};
type StreamFinding = {
  severity: "Critical" | "High" | "Medium" | "Low";
  file: string;
  line: number;
  issue: string;
  fix: string;
};

const CODE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".py", ".sol", ".go"];
const encoder = new TextEncoder();
const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function parseRepoUrl(repoUrl: string) {
  try {
    const url = new URL(repoUrl);
    if (url.hostname !== "github.com") return null;
    const [owner, repo] = url.pathname.replace(/^\/+/, "").split("/");
    if (!owner || !repo) return null;
    return { owner, repo: repo.replace(/\.git$/, "") };
  } catch {
    return null;
  }
}

function streamChunk(controller: ReadableStreamDefaultController<Uint8Array>, chunk: unknown) {
  controller.enqueue(encoder.encode(`${JSON.stringify(chunk)}\n`));
}

export async function POST(request: Request) {
  const body = (await request.json()) as ScanRequestBody;
  const repoUrl = body.repoUrl?.trim();
  const walletAddress = body.walletAddress?.trim();

  if (!repoUrl || !walletAddress) {
    return new Response(
      JSON.stringify({ error: "repoUrl and walletAddress are required." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const parsedRepo = parseRepoUrl(repoUrl);
  if (!parsedRepo) {
    return new Response(JSON.stringify({ error: "Invalid GitHub repository URL." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { owner, repo } = parsedRepo;
  const treeRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`,
    { headers: { Accept: "application/vnd.github+json" } },
  );

  if (treeRes.status === 404) {
    return new Response(
      JSON.stringify({ error: "GitHub repository not found." }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  if (treeRes.status === 403) {
    return new Response(
      JSON.stringify({ error: "Repository is private or GitHub API access is limited." }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!treeRes.ok) {
    const detail = await treeRes.text();
    return new Response(
      JSON.stringify({ error: `Failed to fetch repository tree: ${detail}` }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const treeJson = (await treeRes.json()) as {
    tree?: Array<{ path?: string; type?: string; url?: string }>;
  };

  const files = (treeJson.tree ?? []).filter(
    (node) =>
      node.type === "blob" &&
      !!node.path &&
      CODE_EXTENSIONS.some((ext) => node.path?.toLowerCase().endsWith(ext)),
  );

  const stream = new ReadableStream<Uint8Array>({
    start: async (controller) => {
      let totalFindings = 0;
      const aggregatedFindings: Array<
        StreamFinding & { attestationHash: string }
      > = [];

      try {
        const provider = new ethers.JsonRpcProvider("https://evmrpc-testnet.0g.ai");
        const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
        if (!privateKey) {
          throw new Error("DEPLOYER_PRIVATE_KEY is required.");
        }

        const signer = new ethers.Wallet(privateKey, provider);
        const broker = await initializeComputeAccount(signer);

        const scanSingleFile = async (
          file: { path?: string; url?: string },
          batchIndex: number,
        ) => {
          if (!file.path || !file.url) return;
          await sleep(batchIndex * 2000);

          streamChunk(controller, { type: "file", filename: file.path });

          const blobRes = await fetch(file.url, {
            headers: { Accept: "application/vnd.github+json" },
          });
          if (!blobRes.ok) return;

          const blobJson = (await blobRes.json()) as {
            content?: string;
            encoding?: string;
          };
          if (!blobJson.content) return;

          const decodedContent =
            blobJson.encoding === "base64"
              ? Buffer.from(blobJson.content.replace(/\n/g, ""), "base64").toString("utf8")
              : blobJson.content;

          await uploadFile(decodedContent, file.path, signer);
          const result = await scanFileForVulnerabilities(
            broker,
            file.path,
            decodedContent,
          );

          for (const finding of result.findings) {
            totalFindings += 1;
            aggregatedFindings.push({
              ...finding,
              attestationHash: result.attestationHash,
            });
            streamChunk(controller, {
              type: "finding",
              finding,
              attestationHash: result.attestationHash,
            });
          }
        };

        for (let index = 0; index < files.length; index += 3) {
          const batch = files.slice(index, index + 3);
          await Promise.all(
            batch.map((file, batchIndex) => scanSingleFile(file, batchIndex)),
          );
          if (index + 3 < files.length) {
            await sleep(8000);
          }
        }

        const summaryReport = {
          repoUrl,
          scanDate: new Date().toISOString(),
          totalFiles: files.length,
          findings: aggregatedFindings,
          totalFindings,
        };
        const rootHash = await uploadFile(
          JSON.stringify(summaryReport, null, 2),
          `scan-report-${owner}-${repo}-${Date.now()}.json`,
          signer,
        );

        streamChunk(controller, {
          type: "complete",
          totalFiles: files.length,
          totalFindings,
          rootHash,
        });
        controller.close();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unexpected scan pipeline error.";
        streamChunk(controller, { type: "error", message });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Total-Files": String(files.length),
    },
  });
}
