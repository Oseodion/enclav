# Enclav API

Public HTTP API used by the dashboard and integrations.

---

## `POST /api/scan`

Scan a **public** GitHub repository: ingest files, run TeeML-backed security analysis on 0G Compute, and stream results as **NDJSON** (newline-delimited JSON).

### Request

- **Method:** `POST`
- **Path:** `/api/scan`
- **Headers:** `Content-Type: application/json`
- **Body (JSON):**

```json
{
  "repoUrl": "https://github.com/owner/repo",
  "walletAddress": "0x1234567890123456789012345678901234567890"
}
```

| Field | Required | Description |
|--------|----------|---------------|
| `repoUrl` | Yes | Public `https://github.com/owner/repo` URL (`.git` optional). |
| `walletAddress` | Yes | EVM address used for **EnclavCredits** balance check before the scan. |

**Optional** (long-context memory from a prior run):

```json
{
  "repoUrl": "https://github.com/owner/repo",
  "walletAddress": "0x1234567890123456789012345678901234567890",
  "previousMemoryRootHash": "0x..."
}
```

### Success response (stream)

- **Status:** `200`
- **Content-Type:** `application/x-ndjson; charset=utf-8`
- **Cache-Control:** `no-cache`
- **CORS:** `Access-Control-Allow-Origin: *` (and related headers for browser clients).

Useful response headers:

| Header | Meaning |
|--------|---------|
| `X-Total-Files` | Number of files selected for this scan (after repo rules / caps). |
| `X-Repo-Scannable-Total` | Total scannable files discovered in the repo tree. |

The body is a **stream**: each **line** is one JSON object (no JSON array wrapper). Read line-by-line until the stream ends.

#### Event types (NDJSON lines)

| `type` | Purpose |
|--------|---------|
| `notice` | High-level status (e.g. how many files are being scanned). |
| `file` | A file path is about to be / was sent for analysis. |
| `finding` | One security finding with TeeML attestation reference. |
| `memory` | Optional prior-scan context loaded from storage. |
| `ping` | Keepalive; clients should ignore. |
| `error` | Non-fatal error for a path or pipeline message. |
| `complete` | Scan finished; includes counts and `scanData` summary. |

#### Example stream (abbreviated)

```json
{"type":"notice","message":"Scanning 5 files from 120 found in repo"}
```

```json
{"type":"file","filename":"src/lib/auth.ts"}
```

```json
{"type":"finding","finding":{"severity":"High","file":"src/lib/auth.ts","line":42,"issue":"Sensitive data exposed","fix":"Remove secrets from source; use env + secret manager."},"attestationHash":"0xabc123..."}
```

```json
{"type":"ping"}
```

```json
{"type":"complete","totalFiles":5,"processedFiles":5,"failedFiles":0,"totalFindings":3,"scanData":{"repoUrl":"https://github.com/owner/repo","scanDate":"2026-05-16T12:00:00.000Z","filesScanned":5,"totalFindings":3,"criticalCount":0,"highCount":2,"mediumCount":1,"lowCount":0,"reportHash":""}}
```

- **`finding`:** `finding` is the issue payload; `attestationHash` ties the result to TeeML attestation material from 0G Compute.

### Error responses (non-streaming)

For validation, credits, or failures **before** the NDJSON stream starts, the handler returns **JSON** (not NDJSON) with an `error` string.

| HTTP | When |
|------|------|
| **402** | **Insufficient credits** — wallet balance below scan cost (`error` explains adding credits). |
| **429** | **Rate limited** — too many requests; retry after a backoff (e.g. edge gateway or future in-app throttling). |

Other common codes: `400` (bad `repoUrl` / `walletAddress`), `403` / `404` (GitHub tree access or API limits; message in `error`), `500` (server / dependency failure).

Example **402**:

```json
{
  "error": "Insufficient scan credits — add credits to continue"
}
```

When **429** is returned, expect the same JSON shape: `{ "error": "<message>" }` (wording depends on the layer returning it).

### `OPTIONS /api/scan`

CORS preflight: returns `204` with `Access-Control-Allow-*` headers matching `POST`.

---

## `POST /api/chat` (optional)

Ad-hoc TeeML chat completion using the same 0G Compute stack as scans. Request/response are single JSON documents (not NDJSON). See route handler under `app/api/chat/route.ts` for the current schema.
