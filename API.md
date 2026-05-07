# Enclav API

This file documents the two core API endpoints used by the app.

## 1) `POST /api/scan`

Starts an autonomous repository scan and returns a streaming NDJSON response.

### Request body

```json
{
  "repoUrl": "https://github.com/owner/repo",
  "walletAddress": "0x1234567890abcdef1234567890abcdef12345678",
  "previousMemoryRootHash": "0xoptionalPreviousMemoryHash"
}
```

- `repoUrl` (required): public GitHub repository URL
- `walletAddress` (required): user wallet address for credits check/debit
- `previousMemoryRootHash` (optional): prior memory blob hash for long-context scanning

### Success response

- Content-Type: `application/x-ndjson`
- Headers include:
  - `X-Total-Files`: number of files selected for scan
  - `X-Repo-Scannable-Total`: total scannable files found

Each line is one JSON event, for example:

```json
{"type":"notice","message":"Scanning 5 files from 18 found in repo"}
{"type":"file","filename":"src/auth.js"}
{"type":"finding","traceId":1,"finding":{"severity":"High","file":"src/auth.js","line":42,"issue":"Hardcoded secret","fix":"Use environment variables"},"attestationHash":"0xabc..."}
{"type":"complete","totalFiles":5,"processedFiles":5,"failedFiles":0,"totalFindings":3,"scanData":{"repoUrl":"https://github.com/owner/repo","scanDate":"2026-05-07T10:00:00.000Z","filesScanned":5,"totalFindings":3,"criticalCount":1,"highCount":1,"mediumCount":1,"lowCount":0,"reportHash":""}}
```

### Error response

For request validation / server errors, JSON response:

```json
{
  "error": "Insufficient scan credits — add credits to continue"
}
```

Common status codes: `400`, `402`, `403`, `404`, `500`.

---

## 2) `POST /api/chat`

Runs a TeeML-backed chat inference for ad-hoc security analysis.

### Request body

```json
{
  "messages": [
    { "role": "system", "content": "You are a security auditor." },
    { "role": "user", "content": "Review this snippet for vulnerabilities..." }
  ]
}
```

### Success response

```json
{
  "content": "Potential issue: ...",
  "attestationHash": "0xdef...",
  "model": "deepseek-chat-v3-0324",
  "providerAddress": "0xprovider..."
}
```

### Error response

```json
{
  "error": "No 0G Compute providers available from listService."
}
```

