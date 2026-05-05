# Enclav

## Quick Links For Judges
- Live Demo: [Coming soon - deploying to Vercel]
- Demo Video: [Coming soon]
- INFT Contract (Mainnet): https://chainscan.0g.ai/address/0x0dd0aE98b0e4Dd46cE8B2aa3A2e9a2feAC503EB5
- Credits Contract (Mainnet): https://chainscan.0g.ai/address/0xD0ad553838F8b8ac5CFdccA33588c7723d6Bc073
- GitHub: https://github.com/Oseodion/enclav
- Track: Track 1 — Agentic Infrastructure & OpenClaw Lab

**Enclav** connects a public GitHub repository to an autonomous security scan on **0G Chain**: files are uploaded to **0G Storage**, analyzed with **0G Compute (TeeML)**, then certified on-chain.

*0G APAC Hackathon 2026 — **Track 1: Agentic Infrastructure & OpenClaw Lab***

---

## One-line pitch (≤30 words)

Connect a repo URL; Enclav fetches code, runs TeeML-backed scans on 0G Compute, stores artifacts on 0G Storage, and lets you mint a verifiable certificate on 0G Chain.

---

## What it does — autonomous scan flow

1. **Wallet & credits** — You connect an EVM wallet on **0G Chain** (Aristotle mainnet or Galileo testnet). The app reads your balance on the **EnclavCredits** contract. Each completed scan debits **0.05 OG** of prepaid credits (server-side `deductCredits` after the run).
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
  User (browser, wagmi / injected wallet, 0G Chain)
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
    |       |       on 0G Chain
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
| **0G Chain (Aristotle / Galileo)** | Contracts, wallet transactions, explorer proof, and chain state for scans + certificate minting. |
| **`@0gfoundation/0g-ts-sdk`** | `Indexer` for **upload** (`MemData`) and **download** (`downloadToBlob`) of file blobs, final scan JSON, and `enclav-memory-*` documents. |
| **`@0glabs/0g-serving-broker`** | `ZGServingUserBrokerFactory.create` + `initializeComputeAccount` (ledger bootstrap); `inference.getServiceMetadata`, `getRequestHeaders`, OpenAI-compatible `chat/completions` POST, `processResponse`, optional `listService`. |
| **TeeML attestation** | `ZG-Res-Key` response header (fallback: response id) attached to each finding in the UI / report. |
| **EnclavCredits (Solidity)** | Prepaid **OG** for scans; `deposit` / `withdraw` / `credits` / `deductCredits` via `lib/0g/credits.ts`. |
| **Agent ID / INFT certificate** | The app mints a wallet-owned, on-chain security certificate after scan completion (implemented by `Enclav.sol`, OpenZeppelin ERC-721 style). |
| **Enclav.sol (ERC-721 certificate contract)** | `mintCertificate` stores repo URL, scan date, counts, and **reportHash** (0G Storage root) on-chain. |

**OpenClaw** — `lib/openclaw/agent.ts` is the scan orchestration entrypoint; `lib/openclaw/skills/0g-deploy.ts` is a **0g-deploy** skill module (contract deploy/read helpers) for agent-style workflows.

### How 0G modules support the product

- **0G Storage** provides immutable scan artifacts (per-file uploads, full scan report, memory blobs) referenced by root hashes.
- **0G Compute + TeeML** runs structured vulnerability analysis and returns attested responses per scan call.
- **0G Chain** anchors ownership, payment, and certificate state via EnclavCredits + Enclav certificate contract.
- **Agent ID / INFT certificate flow** turns each completed scan into a wallet-owned, verifiable on-chain security credential.

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
# Edit .env.local — at minimum set DEPLOYER_PRIVATE_KEY (set OG_COMPUTE_PROVIDER to pin a specific provider)
npm run dev
# Open http://localhost:3000 — dashboard at /dashboard
```

### Environment variables (what the code actually reads)

| Variable | Required | Purpose |
|----------|----------|---------|
| `DEPLOYER_PRIVATE_KEY` | **Yes** for scans | `0x…` key on selected 0G network: 0G Storage uploads, 0G Compute broker, `deductCredits` as contract owner. |
| `OG_COMPUTE_PROVIDER` | **Usually no** | Provider **0x address**. Omit if on-chain `listService` works on your `OG_RPC_URL` network (auto-picks first provider—**not** model-specific). Set explicitly to pin a model. Legacy alias in code: `ZEROG_COMPUTE_PROVIDER`. |
| `GITHUB_TOKEN` | No | GitHub API token (`Authorization: token …`) for higher rate limits. |
| `OG_RPC_URL` | No | Server RPC (defaults to 0G mainnet in current code). |
| `NEXT_PUBLIC_OG_RPC_URL` | No | Browser / mint code RPC override. |
| `OG_STORAGE_INDEXER_URL` | No | Storage indexer (defaults to mainnet turbo indexer in current code). |
| `OG_COMPUTE_MODEL` | No | Defaults to `deepseek-chat-v3-0324` in current code. |
| `OG_COMPUTE_API_BASE_URL` | No | Used when resolving compute API (has a code default). |
| `CREDITS_CONTRACT_ADDRESS` / `NEXT_PUBLIC_CREDITS_CONTRACT_ADDRESS` | No* | EnclavCredits; defaults to deployed Aristotle address in code. |
| `NEXT_PUBLIC_INFT_CONTRACT_ADDRESS` | No* | Enclav certificate; defaults to deployed Aristotle address in code. |
| `NEXT_PUBLIC_APP_URL` | No | App base URL for metadata/links. |

\*Required only if you deploy new contracts and need to point away from the baked-in mainnet defaults in code.

See **`.env.example`** in the repo for a copy-paste template aligned with these names.

---

## How judges can test

1. **Wallet** — Install **MetaMask** (or any injected EVM wallet). Default app config targets **0G Aristotle** (`NEXT_PUBLIC_OG_CHAIN_ID=16661`, RPC/explorer from `.env.example`). To use **Galileo**, set env overrides such as `NEXT_PUBLIC_OG_GALILEO_RPC_URL` / `NEXT_PUBLIC_OG_RPC_URL` and matching chain IDs.
2. **Test account / faucet** — Get testnet OG from [https://faucet.0g.ai](https://faucet.0g.ai) and fund the same wallet you will use in the app.
3. **Credits** — Open **Dashboard → Settings**. Deposit native **OG** into **EnclavCredits** so your balance covers **0.05 OG per scan** (plus gas for deposit/mint).
4. **Operator wallet** — The maintainer’s `.env.local` must include a funded **`DEPLOYER_PRIVATE_KEY`** on the same chain as **`OG_RPC_URL`**. Set **`OG_COMPUTE_PROVIDER`** if you need a known model: e.g. **`qwen/qwen-2.5-7b-instruct`** on **Galileo** is **`0xa48f01287233509FD694a22Bf840225062E67836`**. On **Aristotle**, the default **`OG_COMPUTE_MODEL`** (`deepseek-chat-v3-0324`) is served at **`0x1B3AAef3ae5050EEE04ea38cD4B087472BD85EB0`** (on-chain list; catalog changes over time).
5. **Scan** — Use a **small public** GitHub repo first (e.g. this repo: `https://github.com/Oseodion/enclav`) to avoid long runs. Paste the URL, **Start Scan**, watch the **Live Scan Feed** and Tee attestation fields.
6. **Mint** — After **Complete**, use **Mint security certificate**; approve the transaction on the active network. View the **Certificate** / **Agent ID** page and explorer links.

---

## Tech stack

- **Frontend:** Next.js 14 (App Router), React 18, Tailwind CSS, Geist fonts, Lucide icons, Zustand  
- **Wallet:** wagmi v3 + viem (0G Aristotle mainnet + 0G Galileo testnet)  
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

## Demo

- **Live demo URL:** Coming soon - deploying to Vercel
- **Demo video link:** Coming soon

---

## License & disclaimer

Scan output is **model-assisted** and **not** a substitute for a professional security audit. Always verify findings with your own review.
