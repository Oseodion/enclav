# Enclav — CLAUDE.md

## What This Project Is
Enclav is an AI coding agent built entirely on 0G's decentralized infrastructure.
It indexes a developer's private codebase on 0G Storage, runs all LLM inference
through 0G Compute with TeeML (Intel TDX TEE — hardware-level privacy), and mints
the agent's learned capabilities as an INFT (Intelligent NFT / ERC-7857) on 0G Chain.
Built on the OpenClaw agent runtime.

**One-line pitch:**
AI coding agent where your code never leaves a TEE hardware enclave, learns from
your codebase, and that intelligence is an on-chain INFT you permanently own.

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
- `@0gfoundation/0g-ts-sdk` — 0G Storage (upload/download/indexer)
- `@0glabs/0g-serving-broker` — 0G Compute (inference + account management)
- OpenClaw — agent orchestration runtime + custom Skills
- INFT / ERC-7857 — on-chain intelligence tokenization
- TeeML — TEE-verified inference (every response signed by TEE)

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
LLM Model:       qwen-2.5-7b-instruct (only chatbot on testnet)
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
│       ├── chat/route.ts        ← OpenClaw + 0G Compute inference
│       ├── index/route.ts       ← 0G Storage codebase indexer
│       └── mint/route.ts        ← INFT ERC-7857 minting
│
├── components/
│   ├── ui/
│   │   ├── GlassCard.tsx
│   │   ├── GlassButton.tsx
│   │   ├── TeeBadge.tsx         ← shows TeeML attestation hash
│   │   ├── LogoMark.tsx         ← glass diamond E mark
│   │   └── WalletConnect.tsx
│   ├── dashboard/
│   │   ├── CodePanel.tsx
│   │   ├── AgentChat.tsx
│   │   ├── InftPanel.tsx        ← NOT "AgentIdPanel"
│   │   └── SkillsPanel.tsx
│   └── landing/
│       ├── Hero.tsx
│       ├── Features.tsx
│       └── StatsBar.tsx
│
├── lib/
│   ├── 0g/
│   │   ├── storage.ts           ← 0G Storage wrapper (@0gfoundation/0g-ts-sdk)
│   │   ├── compute.ts           ← 0G Compute wrapper (@0glabs/0g-serving-broker)
│   │   └── inft.ts              ← INFT ERC-7857 minting + transfer
│   ├── openclaw/
│   │   ├── agent.ts             ← OpenClaw runtime
│   │   └── skills/
│   │       └── 0g-deploy.ts     ← open-source skill for community
│   └── rag/
│       └── indexer.ts           ← chunk + embed code for 0G Storage
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

### 0G Storage — upload codebase chunk
```ts
import { ZgFile, Indexer } from '@0gfoundation/0g-ts-sdk'
import { ethers } from 'ethers'

const INDEXER = 'https://indexer-storage-testnet-turbo.0g.ai'
const RPC = 'https://evmrpc-testnet.0g.ai'

const provider = new ethers.JsonRpcProvider(RPC)
const signer = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY!, provider)
const indexer = new Indexer(INDEXER)

const [tx, err] = await indexer.upload(zgFile, signer)
// Save rootHash — needed to download later
```

### 0G Compute — inference with TeeML
```ts
import { ZGServingUserBrokerFactory } from '@0glabs/0g-serving-broker'

const broker = await ZGServingUserBrokerFactory.create(signer, RPC)
// provider address from the available services table
const PROVIDER = '0xa48f01...' // qwen-2.5-7b-instruct on testnet

const response = await broker.inference.chat(PROVIDER, {
  model: 'qwen-2.5-7b-instruct',
  messages: [{ role: 'user', content: prompt }]
})
// response includes TEE attestation signature
// show attestation hash in TeeBadge component
```

### INFT — mint on 0G Chain
```ts
// From the integration guide at docs.0g.ai/developer-hub/building-on-0g/inft/integration
// Dependencies: @openzeppelin/contracts, ethers
// Contract inherits ERC721 + adds encrypted metadata hash + oracle verification
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
| Model name | From 0G Compute service list | "—" |
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
OG_COMPUTE_PROVIDER=0xa48f01...   # qwen-2.5-7b-instruct testnet provider

# Contracts
INFT_CONTRACT_ADDRESS=            # after deployment
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
- Every TeeML response: log attestation hash in dev console
- Never call any other LLM API (OpenAI, Anthropic, etc.)

---

## Submission Checklist (May 16, 2026)
- [ ] Public GitHub repo `enclav` with commits throughout build period
- [ ] 0G mainnet contract address (INFT contract on Chain ID 16661)
- [ ] 0G Explorer link (chainscan.0g.ai)
- [ ] Demo video ≤3 mins (real product, real TEE badge, real INFT)
- [ ] README with architecture diagram + 0G module breakdown
- [ ] X post: #0GHackathon #BuildOn0G @0G_labs @0g_CN @0g_Eco @HackQuest_
- [ ] HackQuest final submission form
