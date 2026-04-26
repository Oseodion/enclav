# Enclav

> AI coding agent where your code never leaves a hardware enclave, your agent learns from your codebase, and that intelligence is an on-chain asset you own.

Built for the **0G APAC Hackathon 2026** — Track 1: Agentic Infrastructure & OpenClaw Lab

---

## What It Does

Enclav is an AI coding agent built entirely on 0G's decentralized infrastructure. Connect your GitHub repository, and Enclav:

1. **Indexes your codebase** into 0G Storage (Log + KV layers) for persistent cross-session memory
2. **Runs all inference** through 0G Sealed Inference (Intel TDX TEE) — your code never leaves a hardware enclave
3. **Learns your patterns** via RAG over your indexed codebase — the agent knows your conventions, APIs, and architecture
4. **Mints your agent** as an ERC-7857 Agent ID NFT on 0G Chain — your trained intelligence, permanently on-chain
5. **Ships a 0g-deploy Skill** for OpenClaw — deploy and interact with 0G Chain contracts directly from agent chat

Every response carries a cryptographic TEE attestation certificate. Not a promise — proof.

---

## Problem

Every AI coding tool (Cursor, GitHub Copilot, Claude Code) sends your proprietary source code to centralized servers. Your internal APIs, business logic, unreleased features — all transit infrastructure you don't control, under terms of service you can't verify.

There is no cryptographic proof that your code stays private. You have to trust the platform.

---

## Solution

Enclav routes every inference call through 0G Sealed Inference — Intel TDX Trusted Execution Environments on H100 GPUs. Hardware-level isolation means:

- Your code cannot be read, logged, or exfiltrated — not even by 0G
- Every response is signed with a Remote Attestation (RA) certificate you can verify
- The privacy guarantee is mathematical, not contractual

---

## 0G Components Used

| Component | How Enclav uses it |
|---|---|
| **OpenClaw** | Agent orchestration runtime + custom `0g-deploy` Skill |
| **0G Compute** | All LLM inference routed through compute layer |
| **0G Sealed Inference (TeeML)** | Intel TDX TEE for all LLM calls — hardware privacy |
| **0G Storage** | Codebase indexing (Log layer) + session memory (KV layer) |
| **Agent ID (ERC-7857)** | On-chain NFT minting of trained agent capabilities |
| **0G Chain** | Contract deployment, agent registry, ownership transfers |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    User (Browser)                    │
│         Next.js 14 · Glass UI · Geist font          │
└─────────────────┬───────────────────────────────────┘
                  │ HTTPS
┌─────────────────▼───────────────────────────────────┐
│              Next.js API Routes                      │
│   /api/agent/chat · /api/storage/index               │
│   /api/agentid/mint · /api/skills/deploy             │
└──────┬──────────────────┬──────────────┬────────────┘
       │                  │              │
┌──────▼──────┐  ┌────────▼───────┐  ┌──▼────────────┐
│  OpenClaw   │  │  0G Storage    │  │  0G Chain      │
│  Runtime    │  │  Log + KV      │  │  ERC-7857 NFT  │
│  + Skills   │  │  Codebase RAG  │  │  Agent Registry│
└──────┬──────┘  └────────────────┘  └───────────────┘
       │
┌──────▼──────────────────────────────────────────────┐
│         0G Sealed Inference (TeeML)                  │
│    Intel TDX Hardware Enclave · H100 GPU             │
│    Remote Attestation on every response              │
└─────────────────────────────────────────────────────┘
```

---

## Local Setup

```bash
# Clone
git clone https://github.com/YOUR_HANDLE/enclav
cd enclav

# Install
npm install

# Configure
cp .env.example .env.local
# Fill in your 0G API keys (see .env.example)

# Run
npm run dev
# Open http://localhost:3000
```

### Contract Deployment (testnet)
```bash
# Add your deployer key to .env.local
npm run deploy:contracts
# Copy output addresses to .env.local
```

---

## Team
- Built during 0G APAC Hackathon 2026
- Track 1: Agentic Infrastructure & OpenClaw Lab

---

## Links
- **Live demo:** TBD
- **0G Chain contract:** TBD (post-deployment)
- **0G Explorer:** TBD
- **Demo video:** TBD
- **X post:** TBD

---

*Built with 0G Compute · 0G Sealed Inference · 0G Storage · Agent ID · OpenClaw*
