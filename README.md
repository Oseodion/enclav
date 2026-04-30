# Enclav

Autonomous code security agent - connect your repo, Enclav scans every file for vulnerabilities inside a hardware TEE, and mints a verifiable security certificate as an INFT you own.

Built for the 0G APAC Hackathon 2026 - Track 1: Agentic Infrastructure & OpenClaw Lab

## What It Does
Enclav is an autonomous security agent built entirely on 0G infrastructure. Connect your GitHub repository and Enclav automatically:

- Fetches every file from your repo via GitHub API
- Uploads file contents to 0G Storage (Log + KV layers) for permanent archiving
- Autonomously scans every file through 0G Compute TeeML - all code runs inside Intel TDX hardware enclave, zero exposure
- Streams real-time findings: Critical, High, Medium, Low severity with file names and line numbers
- Mints a verifiable security certificate as an INFT (ERC-7857) on 0G Chain - cryptographic proof your code was audited privately

Every finding carries a TEE attestation hash - not a promise, proof.

## Problem
Existing security tools (Snyk, SonarQube, GitHub Advanced Security) require you to send your proprietary source code to centralized servers. Your internal APIs, business logic, and unreleased features transit infrastructure you don't control.
There is no cryptographic proof your code stays private. You have to trust the platform.

## Solution
Enclav routes every scan through 0G Sealed Inference (TeeML) - Intel TDX Trusted Execution Environments. Hardware-level isolation means your code cannot be read, logged, or exfiltrated - not even by 0G. Every response is signed with a Remote Attestation certificate you can verify on-chain.

## 0G Components Used
| Component | How Enclav uses it |
|---|---|
| OpenClaw | Autonomous agent orchestration + custom 0g-deploy Skill |
| 0G Compute + TeeML | All security scanning runs in Intel TDX hardware enclave |
| 0G Storage | Permanent scan archive on Log + KV layers |
| INFT ERC-7857 | Security certificate minted on-chain after every scan |
| 0G Chain | Contract deployment, certificate registry, ownership |

## Architecture
```
User connects GitHub repo
       ↓
GitHub API fetches all files
       ↓
0G Storage - files uploaded and indexed
       ↓
OpenClaw Agent - autonomous scan orchestration
       ↓
0G Compute TeeML (Intel TDX enclave)
- security analysis per file
- structured JSON findings returned
- TEE attestation hash on every response
       ↓
Findings streamed to Live Scan Feed UI
       ↓
INFT ERC-7857 minted on 0G Chain
- security certificate with findings summary
- permanent verifiable proof of private audit
```

## Local Setup
```bash
git clone https://github.com/Oseodion/enclav
cd enclav
npm install
cp .env.example .env.local
# Fill in your 0G credentials in .env.local
npm run dev
# Open http://localhost:3000
```

## Team
Built during 0G APAC Hackathon 2026 - Track 1: Agentic Infrastructure & OpenClaw Lab

## Links
- Live demo: TBD
- 0G Chain contract: TBD
- 0G Explorer: TBD
- Demo video: TBD
- X post: TBD
