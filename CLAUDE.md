# CLAUDE.md — AP127 Dashboard Project

> Auto-read by Claude Code at session start. For full details see PROJECT.md.

---

## Repos

| Repo | Visibility | Purpose |
|---|---|---|
| `nuguitar/AP127_NGT_001` | **Public** | Internal admin dashboard + data pipeline |
| `nuguitar/AP127_DashboardR1` | **Private** | Student-facing site (AP127 Detail view only) |

---

## Active Branch

Current feature branch: `claude/separate-homepage-website-CkBWy`
All new work goes here — **do not push to `main`** without user confirmation.

---

## Architecture Overview

```
Google Sheets → Apps Script relay → update-cache.js (GitHub Actions, every 5 min)
                                              │
                              ┌───────────────┴──────────────────────┐
                              ▼                                       ▼
                        cache.json                            push-to-kv.js
                   (committed to public repo)          (pushes AP127 slice to CF KV)
                              │                                       │
                              ▼                                       ▼
           Internal dashboard (index.html)               Cloudflare KV: ap127_slice
           github.io/AP127_NGT_001                       {ap127, cur127, _updated}
                                                                      │
                                                                      ▼
                                                         Cloudflare Worker: ap127-data-api
                                                         (rate-limited JSON API with CORS)
                                                                      │
                                                                      ▼
                                                         Cloudflare Pages: ap127-dashboardr1
                                                         https://ap127-dashboardr1.pages.dev
                                                         (student-facing site, private repo)
```

---

## Key Files in This Repo (`AP127_NGT_001`)

| File | Role |
|---|---|
| `index.html` | Admin dashboard (~1 745 lines). Has `__RELAY_URL__`, `__ADMIN_HASH__` placeholders injected at deploy time via `sed`. Do not expose publicly. |
| `student.html` | Student-facing AP127 Detail view (~441 lines). Has `__WORKER_URL__` placeholder. This file is the source for `AP127_DashboardR1/index.html`. |
| `update-cache.js` | Fetches Google Sheets CSVs, runs scheduler, writes `cache.json` |
| `push-to-kv.js` | Reads `cache.json`, extracts `{ap127, cur127, _updated}`, PUTs to Cloudflare KV via REST API. Skips gracefully if CF secrets not set. |
| `.github/workflows/update-cache.yml` | Two-job workflow: `update` job (any branch) + `deploy` job (main only, github-pages environment) |
| `cache.json` | ~500 KB pre-computed data cache. Auto-committed every 5 min by GitHub Actions. |

---

## Cloudflare Infrastructure

| Resource | Name / URL | Notes |
|---|---|---|
| KV Namespace | `AP127_STUDENT_DATA` | Stores key `ap127_slice` |
| Worker | `ap127-data-api` | Serves `ap127_slice` as JSON with CORS. Has env var `ALLOWED_ORIGIN`. |
| Pages project | `ap127-dashboardr1` | Deploys from `nuguitar/AP127_DashboardR1` (private) |
| Student site URL | `https://ap127-dashboardr1.pages.dev` | |

### Cloudflare Worker (`ap127-data-api`) code

```javascript
export default {
  async fetch(request, env) {
    const allowedOrigin = env.ALLOWED_ORIGIN || '*';
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Max-Age': '86400'
      }});
    }
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
    const data = await env.KV.get('ap127_slice', 'json');
    if (!data) return new Response(JSON.stringify({ error: 'No data' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
    return new Response(JSON.stringify(data), { headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': allowedOrigin
    }});
  },
};
```

KV binding: variable name `KV` → namespace `AP127_STUDENT_DATA`

---

## GitHub Secrets

### `nuguitar/AP127_NGT_001`

| Secret | Purpose |
|---|---|
| `RELAY_URL` | Google Apps Script URL (injected into `index.html` at deploy) |
| `ADMIN_PASSWORD_HASH` | SHA-256 of admin password (injected into `index.html`) |
| `CF_ACCOUNT_ID` | Cloudflare account ID |
| `CF_KV_NAMESPACE_ID` | Cloudflare KV namespace ID for `AP127_STUDENT_DATA` |
| `CF_API_TOKEN` | Cloudflare API token with KV write permission |
| `CF_WORKER_URL` | Data Worker URL (injected into `student.html` at deploy) |

---

## GitHub Actions Workflow (`update-cache.yml`) — Key Points

- Split into two jobs to avoid GitHub Pages environment protection errors on non-main branches:
  - `update` job: runs on **any branch** (no environment). Fetches data → commits cache.json → pushes KV → injects secrets (main only) → uploads Pages artifact (main only)
  - `deploy` job: runs on **main only**, has `environment: github-pages`. Only calls `actions/deploy-pages@v5`
- Steps with `if: github.ref == 'refs/heads/main'` guard: secret injection, setup-pages, upload-artifact

---

## Student Site (`AP127_DashboardR1`) — How It Works

- `index.html` is a copy of `student.html` from this repo
- The `const WORKER_URL='...'` line must be set to the data Worker URL (e.g. `https://ap127-data-api.anusorn-tanmetha.workers.dev`)
- Init IIFE: if `WORKER_URL` starts with `__` (placeholder not replaced), falls back to fetching `cache.json` locally — which fails on the Pages host (no cache.json there). This is the fallback for local dev only.
- No relay URL, no admin hash, no sync button — student view only

---

## Pending Tasks (as of 2026-05-21)

1. **(Optional) Merge feature branch to main**
   - Branch `claude/separate-homepage-website-CkBWy` contains: `student.html`, `push-to-kv.js`, updated `update-cache.yml`
   - Review and merge to `main` when ready

2. **(Optional) Add Cloudflare WAF rate limiting**
   - Cloudflare dashboard → Security → WAF → Rate Limiting Rules on the data Worker route

### ✅ Completed (2026-05-21)

- `student.html` extracted from `index.html` — AP127 Detail view only, no admin/relay/secrets
- `push-to-kv.js` created — pushes `{ap127, cur127, _updated}` slice to Cloudflare KV on every cache update
- `update-cache.yml` split into two jobs — avoids GitHub Pages environment protection errors on non-main branches
- Cloudflare KV namespace `AP127_STUDENT_DATA` created, key `ap127_slice` populated
- Cloudflare Worker `ap127-data-api` deployed — serves KV data as JSON with CORS
- Cloudflare Pages project `ap127-dashboardr1` deployed from private repo `nuguitar/AP127_DashboardR1`
- `WORKER_URL` hardcoded in `AP127_DashboardR1/index.html` (data Worker URL)
- `ALLOWED_ORIGIN` set on `ap127-data-api` Worker → `https://ap127-dashboardr1.pages.dev`
- Student site live and serving data at `https://ap127-dashboardr1.pages.dev`

---

## `student.html` — What Was Kept / Removed vs `index.html`

**Kept:** AP127_NICKS, HOL constants; escHtml, toast, setSS, fd, hm, mkC, copts helpers; all `ap127*` render functions; buildAP127Timeline, buildAP127RaceChart, buildAP127OverallChart; drawer + keydown listener

**Removed:** RELAY_URL, ADMIN_PASSWORD_HASH, sha256, requestAdminUnlock; runScheduler, isWD, getWDs, computeLwM; fetchBatch, syncAll; renderStats, renderPerformance, renderSimulation, renderPlans, renderCal, renderAll, showPage, selBatch; all Admin / Simulation / Performance / Plans / Calendar / Overview page HTML and JS

---

## Data Model Quick Reference

`cache.json` top-level keys: `ap124`, `ap126`, `ap127`, `ap129`, `monthly`, `cur124`, `cur126`, `cur127`, `cap`, `_updated`

Cloudflare KV stores only: `{ ap127, cur127, _updated }` (the "ap127_slice")

Student record fields: `catc_id`, `name`, `batch`, `nick` (assigned in JS), `done`, `total`, `remaining`, `pct`, `flown[]`, `planned[]`, `next_lesson`, `finish`

See `PROJECT.md` for full details.
