# Enclav — CLAUDE.md

## What This Project Is
Enclav is an autonomous code security agent built on 0G infrastructure. A developer connects their GitHub repository and Enclav automatically — with zero manual steps — scans every file for security vulnerabilities, generates fixes, and produces a verifiable security report. All scanning runs inside 0G Sealed Inference TEE (TeeML) so proprietary code never leaves the hardware enclave. The security report and findings are stored on 0G Storage. After the scan completes, a verifiable security certificate is minted as an INFT (ERC-7857) on 0G Chain — proof that this codebase was scanned privately and verifiably. Built on OpenClaw agent runtime with a custom 0g-deploy Skill.

**One-line pitch:**
Connect your repo, Enclav autonomously scans your entire codebase for vulnerabilities inside a hardware TEE, and mints a verifiable security certificate as an INFT you own.

**Hackathon:** 0G APAC Hackathon 2026 — Track 1: Agentic Infrastructure & OpenClaw Lab
**Final deadline:** May 16, 2026 23:59 UTC+8

---

## IMPORTANT: Correct 0G Terminology

Use these exact terms — judges will notice wrong naming:

| Wrong (old) | Correct |
|---|---|
| "Agent ID NFT" | INFT (Intelligent NFT) |
| "Sealed Inference" | TeeML (or "TEE-verified inference") |
| "Agent ID standard" | ERC-7857 / INFT standard |
| `@0g/compute-sdk` | `@0glabs/0g-serving-broker` |
| `@0g/storage-sdk` | `@0gfoundation/0g-ts-sdk` |

---

## Tech Stack

### Frontend
- Framework: Next.js 14 (App Router)
- Styling: Tailwind CSS (custom config — see tailwind.config.ts)
- Fonts: Geist Sans + Geist Mono (from Vercel/Google Fonts)
- Icons: Lucide React ONLY — no emojis anywhere in UI
- State: React hooks + Zustand for global state

### Backend
- Runtime: Node.js + TypeScript strict mode
- API: Next.js App Router API routes

### Blockchain
- Chain: 0G Chain (EVM-compatible)
- Library: ethers v6
- Contracts: Solidity 0.8.19, Hardhat

### 0G Infrastructure (ALL used)
- `@0gfoundation/0g-ts-sdk` — 0G Storage (repo snapshot + findings report storage)
- `@0glabs/0g-serving-broker` — 0G Compute (autonomous security analysis + account management)
- OpenClaw — agent orchestration runtime + custom security Skills
- INFT / ERC-7857 — on-chain security certificate minting
- TeeML — TEE-verified inference (every scan response signed by TEE)

---

## Network Configuration

### Testnet (Galileo) — development
```
Chain ID:        16602
RPC:             https://evmrpc-testnet.0g.ai
Explorer:        https://chainscan-galileo.0g.ai
Storage Indexer: https://indexer-storage-testnet-turbo.0g.ai
Storage Flow:    0x22E03a6A89B950F1c82ec5e74F8eCa321a105296
Faucet:          https://faucet.0g.ai
LLM Model:       qwen-2.5-7b-instruct (security analysis on testnet)
```

### Mainnet (Aristotle) — final submission
```
Chain ID:        16661
RPC:             https://evmrpc.0g.ai
Explorer:        https://chainscan.0g.ai
Storage Indexer: https://indexer-storage-turbo.0g.ai
Storage Flow:    0x62D4144dB0F0a6fBBaeb6296c785C71B3D57C526
LLM Model:       deepseek-chat-v3-0324 (TeeML, best for coding)
                 OR gpt-oss-120b (TeeML)
```

---

## Folder Structure

```
enclav/                          ← GitHub repo name: enclav
├── CLAUDE.md                    ← this file (Cursor reads this)
├── package.json
├── tailwind.config.ts
├── tsconfig.json
├── hardhat.config.ts
├── .env.example                 ← commit this
├── .env.local                   ← NEVER commit (gitignored)
├── .gitignore
│
├── app/                         ← Next.js App Router
│   ├── layout.tsx               ← root layout, Geist font, metadata
│   ├── globals.css              ← glass system CSS vars
│   ├── page.tsx                 ← landing page
│   ├── dashboard/
│   │   └── page.tsx
│   ├── agent-id/
│   │   └── page.tsx
│   └── api/
│       ├── chat/route.ts        ← 0G Compute TeeML security analysis
│       ├── index/route.ts       ← 0G Storage repo ingestion + report snapshot
│       └── mint/route.ts        ← INFT ERC-7857 security certificate minting
│
├── components/
│   ├── ui/
│   │   ├── GlassCard.tsx
│   │   ├── GlassButton.tsx
│   │   ├── TeeBadge.tsx         ← shows TeeML attestation hash per scan response
│   │   ├── LogoMark.tsx         ← glass diamond E mark
│   │   └── WalletConnect.tsx
│   ├── dashboard/
│   │   ├── CodePanel.tsx        ← scan target and findings context
│   │   ├── AgentChat.tsx        ← autonomous scan progress + findings stream
│   │   ├── InftPanel.tsx        ← NOT "AgentIdPanel"
│   │   └── SkillsPanel.tsx      ← OpenClaw security skills
│   └── landing/
│       ├── Hero.tsx
│       ├── Features.tsx
│       └── StatsBar.tsx
│
├── lib/
│   ├── 0g/
│   │   ├── storage.ts           ← 0G Storage wrapper (@0gfoundation/0g-ts-sdk)
│   │   ├── compute.ts           ← 0G Compute security scanner wrapper (@0glabs/0g-serving-broker)
│   │   └── inft.ts              ← INFT ERC-7857 security certificate minting + transfer
│   ├── openclaw/
│   │   ├── agent.ts             ← OpenClaw runtime
│   │   └── skills/
│   │       └── 0g-deploy.ts     ← open-source skill for community
│   └── rag/
│       └── indexer.ts           ← repo chunking + findings context indexing
│
└── contracts/
    ├── Enclav.sol               ← INFT ERC-7857 implementation
    └── scripts/
        └── deploy.ts
```

---

## Design System

### Glass UI (applied to ALL panels, cards, modals)
```tsx
// Standard glass panel
"bg-white/5 backdrop-blur-xl border border-white/[0.09] rounded-2xl
 relative overflow-hidden
 before:absolute before:inset-x-0 before:top-0 before:h-px
 before:bg-gradient-to-r before:from-transparent before:via-white/25 before:to-transparent"

// Glass button primary
"bg-purple/40 border border-purple-bright/40 backdrop-blur-lg text-white
 rounded-full shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_0_24px_rgba(124,58,237,0.3)]"
```

### Colors (all in tailwind.config.ts)
```
bg / bg1 / bg2: pure blacks and near-blacks
purple: #7C3AED  |  purple-bright: #A78BFA
pink: #EC4899
teal: #10B981  |  teal-light: #6EE7B7
text-1/2/3: light to muted
```

### Typography rules
- Headings: `font-geist font-bold tracking-tight`
- Body: `font-geist`
- ALL code, labels, addresses, status text: `font-mono`
- ZERO emojis — Lucide icons only
- ZERO Inter/Roboto/Arial/system-ui

---

## Key Integration Code

### 0G Storage — upload repository snapshot + findings report
```ts
import { ZgFile, Indexer } from '@0gfoundation/0g-ts-sdk'
import { ethers } from 'ethers'

const INDEXER = 'https://indexer-storage-testnet-turbo.0g.ai'
const RPC = 'https://evmrpc-testnet.0g.ai'

const provider = new ethers.JsonRpcProvider(RPC)
const signer = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY!, provider)
const indexer = new Indexer(INDEXER)

const [tx, err] = await indexer.upload(zgFile, signer)
// Save rootHash — used as verifiable scan snapshot reference
```

### 0G Compute — TeeML security analysis
```ts
import { ZGServingUserBrokerFactory } from '@0glabs/0g-serving-broker'

const broker = await ZGServingUserBrokerFactory.create(signer, RPC)
// provider address from the available services table
const PROVIDER = '0xa48f01...' // qwen-2.5-7b-instruct on testnet

const response = await broker.inference.chat(PROVIDER, {
  model: 'qwen-2.5-7b-instruct',
  messages: [{ role: 'user', content: securityAuditPrompt }]
})
// response includes TEE attestation signature
// parse JSON findings and show attestation hash in TeeBadge component
```

### INFT — mint security certificate on 0G Chain
```ts
// From the integration guide at docs.0g.ai/developer-hub/building-on-0g/inft/integration
// Dependencies: @openzeppelin/contracts, ethers
// Contract inherits ERC721 + stores verifiable scan metadata hash + oracle verification
```

---

## Real Data Rules — CRITICAL

Every value shown in the UI must be real and live. No hardcoded demo data.

| UI element | Source | Fallback when not connected |
|---|---|---|
| Wallet address | Connected wallet | "—" |
| TEE attestation hash | TeeML response signature | Don't show if unavailable |
| INFT token ID | 0G Chain explorer | "—" |
| Storage size | 0G Storage SDK | "0 GB" |
| Findings summary | Aggregated security findings | "—" |
| Explorer links | chainscan.0g.ai or chainscan-galileo.0g.ai | Disabled |

**The "View Docs" link in nav = `https://docs.0g.ai` (external link, 0G official docs)**
We do NOT build our own docs page. Our documentation is the GitHub README.

---

## Environment Variables

```bash
# 0G Chain
OG_RPC_URL=https://evmrpc-testnet.0g.ai
OG_CHAIN_ID=16602
OG_EXPLORER=https://chainscan-galileo.0g.ai

# 0G Storage
OG_STORAGE_INDEXER=https://indexer-storage-testnet-turbo.0g.ai
OG_FLOW_CONTRACT=0x22E03a6A89B950F1c82ec5e74F8eCa321a105296

# 0G Compute
OG_COMPUTE_URL=https://compute-testnet.0g.ai
OG_COMPUTE_PROVIDER=0xa48f01...   # qwen-2.5-7b-instruct security analysis provider

# Contracts
INFT_CONTRACT_ADDRESS=            # security certificate contract address after deployment
DEPLOYER_PRIVATE_KEY=             # testnet wallet only, never commit

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_OG_CHAIN_ID=16602
NEXT_PUBLIC_OG_EXPLORER=https://chainscan-galileo.0g.ai
```

---

## Coding Rules

- TypeScript strict always — no `any`
- async/await only — never .then()
- Components: PascalCase, files: kebab-case
- All 0G SDK calls: wrapped in try/catch
- Every TeeML response: log attestation hash in dev console and show it in UI
- Never call any other LLM API (OpenAI, Anthropic, etc.)

---

## Build Order (Phase 3)

### Step 1 — Wallet connection
- wagmi + viem integration on 0G Galileo testnet (Chain ID 16602)

### Step 2 — Autonomous repo scanner
- User pastes GitHub repo URL in dashboard
- Agent automatically fetches all files from GitHub API
- Uploads file contents to 0G Storage
- Immediately starts scanning autonomously — no user prompting needed
- Shows real-time progress: "Scanning auth.service.ts... found 2 issues"
- Produces structured security findings with severity: Critical, High, Medium, Low
- Each finding shows: file name, line number, issue description, suggested fix

### Step 3 — 0G Compute TeeML security analysis
- All scanning runs through 0G Compute with TeeML
- System prompt instructs model to act as a security auditor returning structured JSON
- Scans each file and returns findings as JSON array
- Every response carries TEE attestation hash shown in UI
- Final report aggregates all findings across all files

### Step 4 — INFT security certificate
- After scan completes mint INFT on 0G Chain
- INFT metadata: repo name, scan date, findings count, severity breakdown, root hash
- Verifiable proof that this exact codebase was scanned privately
- Shown on agent-id page as security certificate

---

## Submission Checklist (May 16, 2026)
- [ ] Public GitHub repo `enclav` with commits throughout build period
- [ ] 0G mainnet contract address (INFT contract on Chain ID 16661)
- [ ] 0G Explorer link (chainscan.0g.ai)
- [ ] Demo video ≤3 mins (real product, real TEE badge, real INFT)
- [ ] README with architecture diagram + 0G module breakdown
- [ ] X post: #0GHackathon #BuildOn0G @0G_labs @0g_CN @0g_Eco @HackQuest_
- [ ] HackQuest final submission form
