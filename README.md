# Enclav

**Enclav** connects a public GitHub repository to an autonomous security scan on **0G Galileo**: each file is uploaded to **0G Storage**, analyzed with **0G Compute (TeeML)**, findings stream to the dashboard, and you can mint an on-chain **security certificate** from your wallet (`Enclav.sol` is an OpenZeppelin **ERC-721**; the app labels it as an **INFT**-style certificate).

*0G APAC Hackathon 2026 — **Track 1: Agentic Infrastructure & OpenClaw Lab***

---

## One-line pitch (≤30 words)

Connect a repo URL; Enclav fetches code, runs TeeML-backed scans on 0G Compute, stores artifacts on 0G Storage, and lets you mint a verifiable certificate on 0G Chain.

---

## What it does — autonomous scan flow

1. **Wallet & credits** — You connect an EVM wallet on **0G Galileo (chain ID 16602)**. The app reads your balance on the **EnclavCredits** contract. Each completed scan debits **0.05 OG** of prepaid credits (server-side `deductCredits` after the run).
2. **Repo URL** — You paste a **public** `https://github.com/owner/repo` URL on the dashboard. Private repos are not supported.
3. **GitHub ingest** — The server calls the **GitHub API** (`git/trees/HEAD?recursive=1` + blob fetches). Optional `GITHUB_TOKEN` reduces rate-limit failures. Paths like `node_modules`, `.next`, `.git`, and `.env*` are skipped; only configured source extensions (e.g. `.ts`, `.py`, `.sol`, …) are scanned.
4. **0G Storage** — For each file, the server uploads content via **`@0gfoundation/0g-ts-sdk`** (`Indexer` + `MemData.upload`) and receives a **root hash** per object.
5. **0G Compute (TeeML)** — For each file, **`@0glabs/0g-serving-broker`** initializes a broker with `DEPLOYER_PRIVATE_KEY`, resolves **`OG_COMPUTE_PROVIDER`**, and runs a structured security prompt. The model returns a **JSON array of findings**; the response includes a **TeeML attestation** (`ZG-Res-Key` header or fallback id) shown in the UI.
6. **OpenClaw orchestration** — `lib/openclaw/agent.ts` (`runSecurityScan`) coordinates file-by-file calls into `scanFileForVulnerabilities` and deduplicates findings by file + line + issue.
7. **Long-context memory** — After a scan, a compact **`enclav-memory-*`** JSON blob is uploaded to 0G Storage. On the **next** scan of the same repo, the client may send **`previousMemoryRootHash`**; the server downloads that blob and prepends summarized prior findings to the model context.
8. **Streaming UI** — `POST /api/scan` returns **NDJSON** lines (`file`, `finding`, `memory`, `error`, `complete`). The dashboard updates the live feed, progress, and Tee attestation display.
9. **Final artifacts** — A **JSON scan report** (repo, counts, all findings + attestation hashes) and the **memory** document are uploaded to 0G Storage; `complete` includes **`reportHash`** and optional **`memoryRootHash`** for the next run.
10. **Mint certificate** — After a successful scan, you mint from the browser via **`mintFromWallet`** (`lib/0g/inft.ts`) against the **Enclav** `Enclav.sol` contract (`mintCertificate` stores repo metadata and **0G Storage report hash** on-chain). There is **no** separate `/api/mint` route — signing happens in the wallet.

**Additional API** — `POST /api/chat` exposes **`inferWithTeeML`** for ad-hoc TeeML messages (same broker stack as scans).

---

## Problem it solves

Typical SaaS scanners and hosted SAST send **proprietary source** to vendor-controlled infrastructure. You rely on policy and reputation, not on **hardware-bound inference** you can attribute to a specific provider response.

Enclav’s scan path is built around **0G Compute** broker flows and **TeeML attestation material** surfaced per finding, plus **0G Storage** for durable report and memory blobs — so the demo is anchored in **0G’s stack**, not a generic third-party LLM API.

---

## Architecture (ASCII)

```
  User (browser, wagmi / injected wallet, 0G Galileo 16602)
    |
    v
  Next.js 14 App Router
    |-- /dashboard ............... repo URL, stream UI, credits, mint button
    |-- /agent-id ................ certificate / token lookup
    |
    +-- POST /api/scan ........... NDJSON scan pipeline (server)
    |       |
    |       |-- GitHub REST ...... tree + blobs (public repos)
    |       |
    |       |-- EnclavCredits .... getCreditsBalance (402 if low)
    |       |       on 0G Chain (Galileo)
    |       |
    |       |-- @0gfoundation/0g-ts-sdk
    |       |       Indexer.upload ........ per-file + report + memory JSON
    |       |
    |       |-- @0glabs/0g-serving-broker
    |       |       ZGServingUserBrokerFactory + inference.* ........ TeeML chat
    |       |
    |       |-- lib/openclaw/agent.ts ... runSecurityScan (orchestration)
    |       |
    |       +-- deductCreditsFromServer ... EnclavCredits.deductCredits (owner key)
    |
    +-- POST /api/chat ............. inferWithTeeML (optional)

  Mint (client): ethers BrowserProvider + Enclav.sol.mintCertificate(...)
                 reportHash + severity counts from last scan
```

---

## 0G components — how each is used

| Component | Usage in this repo |
|-------------|-------------------|
| **0G Chain (Galileo)** | `16602`, RPC `https://evmrpc-testnet.0g.ai`; **Enclav** + **EnclavCredits** contracts; wallet mint + credit deposit/withdraw. |
| **`@0gfoundation/0g-ts-sdk`** | `Indexer` for **upload** (`MemData`) and **download** (`downloadToBlob`) of file blobs, final scan JSON, and `enclav-memory-*` documents. |
| **`@0glabs/0g-serving-broker`** | `ZGServingUserBrokerFactory.create` + `initializeComputeAccount` (ledger bootstrap); `inference.getServiceMetadata`, `getRequestHeaders`, OpenAI-compatible `chat/completions` POST, `processResponse`, optional `listService`. |
| **TeeML attestation** | `ZG-Res-Key` response header (fallback: response id) attached to each finding in the UI / report. |
| **EnclavCredits (Solidity)** | Prepaid **OG** for scans; `deposit` / `withdraw` / `credits` / `deductCredits` via `lib/0g/credits.ts`. |
| **Enclav.sol (ERC-721 certificate)** | `mintCertificate` stores repo URL, scan date, counts, and **reportHash** (0G Storage root) on-chain. |

**OpenClaw** — `lib/openclaw/agent.ts` is the scan orchestration entrypoint; `lib/openclaw/skills/0g-deploy.ts` is a **0g-deploy** skill module (contract deploy/read helpers) for agent-style workflows.

---

## Deployed contracts (0G Aristotle mainnet)

| Contract | Address |
|----------|---------|
| **Enclav** (security certificate NFT — `Enclav.sol`) | `0x0dd0aE98b0e4Dd46cE8B2aa3A2e9a2feAC503EB5` |
| **EnclavCredits** (scan credits) | `0xD0ad553838F8b8ac5CFdccA33588c7723d6Bc073` |

**Explorer (Aristotle):** [chainscan.0g.ai](https://chainscan.0g.ai)

- Certificate contract: `https://chainscan.0g.ai/address/0x0dd0aE98b0e4Dd46cE8B2aa3A2e9a2feAC503EB5`  
- Credits contract: `https://chainscan.0g.ai/address/0xD0ad553838F8b8ac5CFdccA33588c7723d6Bc073`  

## Mainnet Deployment

- **INFT Contract (mainnet):** `0x0dd0aE98b0e4Dd46cE8B2aa3A2e9a2feAC503EB5`  
  Explorer: [https://chainscan.0g.ai/address/0x0dd0aE98b0e4Dd46cE8B2aa3A2e9a2feAC503EB5](https://chainscan.0g.ai/address/0x0dd0aE98b0e4Dd46cE8B2aa3A2e9a2feAC503EB5)
- **Credits Contract (mainnet):** `0xD0ad553838F8b8ac5CFdccA33588c7723d6Bc073`  
  Explorer: [https://chainscan.0g.ai/address/0xD0ad553838F8b8ac5CFdccA33588c7723d6Bc073](https://chainscan.0g.ai/address/0xD0ad553838F8b8ac5CFdccA33588c7723d6Bc073)

Override addresses anytime with `NEXT_PUBLIC_INFT_CONTRACT_ADDRESS` / `NEXT_PUBLIC_CREDITS_CONTRACT_ADDRESS` (see `.env.example`).

---

## Local setup

```bash
git clone https://github.com/Oseodion/enclav.git
cd enclav
npm install
cp .env.example .env.local
# Edit .env.local — at minimum set DEPLOYER_PRIVATE_KEY and OG_COMPUTE_PROVIDER
npm run dev
# Open http://localhost:3000 — dashboard at /dashboard
```

### Environment variables (what the code actually reads)

| Variable | Required | Purpose |
|----------|----------|---------|
| `DEPLOYER_PRIVATE_KEY` | **Yes** for scans | `0x…` key on Galileo: 0G Storage uploads, 0G Compute broker, `deductCredits` as contract owner. |
| `OG_COMPUTE_PROVIDER` | **Yes** for scans | Provider **0x address** from 0G Compute (fallback env name: `ZEROG_COMPUTE_PROVIDER`). |
| `GITHUB_TOKEN` | No | GitHub API token (`Authorization: token …`) for higher rate limits. |
| `OG_RPC_URL` | No | Server RPC (defaults to Galileo testnet). |
| `NEXT_PUBLIC_OG_RPC_URL` | No | Browser / mint code RPC override. |
| `OG_STORAGE_INDEXER_URL` | No | Storage indexer (defaults to testnet turbo indexer). |
| `OG_COMPUTE_MODEL` | No | Defaults to `qwen/qwen-2.5-7b-instruct`. |
| `OG_COMPUTE_API_BASE_URL` | No | Used when resolving compute API (has a code default). |
| `CREDITS_CONTRACT_ADDRESS` / `NEXT_PUBLIC_CREDITS_CONTRACT_ADDRESS` | No* | EnclavCredits; defaults to deployed Galileo address in code. |
| `NEXT_PUBLIC_INFT_CONTRACT_ADDRESS` | No* | Enclav certificate; defaults to deployed Galileo address in code. |
| `NEXT_PUBLIC_APP_URL` | No | App base URL for metadata/links. |

\*Required only if you deploy new contracts and need to point away from the baked-in Galileo defaults.

See **`.env.example`** in the repo for a copy-paste template aligned with these names.

---

## How judges can test

1. **Wallet** — Install **MetaMask** (or any injected EVM wallet). **Add 0G Galileo**: chain ID **16602**, RPC `https://evmrpc-testnet.0g.ai`, explorer `https://chainscan-galileo.0g.ai` (the app will prompt to switch when needed).
2. **Testnet OG** — Use the official faucet: [https://faucet.0g.ai](https://faucet.0g.ai) to fund the wallet you will connect in the UI.
3. **Credits** — Open **Dashboard → Settings**. Deposit native **OG** into **EnclavCredits** so your balance covers **0.05 OG per scan** (plus gas for deposit/mint).
4. **Operator wallet** — The maintainer’s `.env.local` must include a funded **`DEPLOYER_PRIVATE_KEY`** (same chain) and a valid **`OG_COMPUTE_PROVIDER`** so judges’ scans can reach Storage + Compute.
5. **Scan** — Use a **small public** GitHub repo first (e.g. this repo: `https://github.com/Oseodion/enclav`) to avoid long runs. Paste the URL, **Start Scan**, watch the **Live Scan Feed** and Tee attestation fields.
6. **Mint** — After **Complete**, use **Mint security certificate**; approve the transaction on Galileo. View the **Certificate** / **Agent ID** page and explorer links.

---

## Tech stack

- **Frontend:** Next.js 14 (App Router), React 18, Tailwind CSS, Geist fonts, Lucide icons, Zustand  
- **Wallet:** wagmi v3 + viem (single chain: 0G Galileo)  
- **Backend:** Next.js Route Handlers (`/api/scan`, `/api/chat`), TypeScript strict  
- **0G:** `@0gfoundation/0g-ts-sdk`, `@0glabs/0g-serving-broker`, ethers v6  
- **Contracts:** Solidity 0.8.19, Hardhat 3, OpenZeppelin ERC-721  

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Next.js development server |
| `npm run build` / `npm run start` | Production build / server |
| `npm run lint` | ESLint |
| Hardhat | `contracts/` — `npx hardhat compile`, deploy scripts under `contracts/scripts/` |

---

## Repository

**GitHub:** [https://github.com/Oseodion/enclav](https://github.com/Oseodion/enclav)

---

## License & disclaimer

Scan output is **model-assisted** and **not** a substitute for a professional security audit. Always verify findings with your own review.
