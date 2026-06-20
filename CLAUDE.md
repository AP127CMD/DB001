# DB001 — Claude Code Context

## What this project is
Internal admin dashboard + data pipeline for AP127 flight-training progress (4 batches: AP124, AP126, AP127, AP129).
GitHub: `AP127CMD/DB001`. Live: `https://ap127-db001.pages.dev`. Local: `/Users/nugui/AP127_NGT_001/`.

## Current state
- Active branch: main (all feature branches merged; direct-to-main workflow)
- Last significant change: confirm via `git log --oneline -5`

## Key facts
- `index.html` has `__RELAY_URL__` and `__ADMIN_HASH__` placeholders injected at CF Pages deploy via GitHub secrets + `sed`
- Edit ONLY `index.html` for AP127 Detail — `build-student.js` syncs the `##AP127*##` markers to `student.html` automatically; `sync-dashboardr1.js` then pushes `student.html` to the private DB_Share repo
- **AP129 is synthetic** — generated in `update-cache.js` (13 placeholder students), not a real CSV/data source; do not look for an AP129 sheet
- `AUPRT*` lessons are dropped inside `parseCSV()` — they must never appear in totals or the scheduler
- `dispatcher/` is a CF Worker (`ap127-dispatcher`) that triggers `update-cache.yml` every 5 min via GitHub Actions `workflow_dispatch`
- Data flow: Google Sheets → Apps Script relay → `update-cache.js` (GHA) → `cache.json` (committed) + `push-to-kv.js` (CF KV)
- Old repos `nuguitar/AP127_NGT_001` and `nuguitar/AP127_DashboardR1` are **private/archived** — use `AP127CMD/DB001` only

## Update rule
After every code change in this session:
1. Update this file (current state section above)
2. Update `/Users/nugui/AP127_Docs/README.md` (§2.2)
3. `git add CLAUDE.md && git commit && git push` this repo
4. `cd /Users/nugui/AP127_Docs && git add README.md && git commit -m "docs: ..." && git push`

## Master reference
Full architecture, deployment steps, secrets, and reproduce-from-scratch guide:
https://ap127-docs.pages.dev  (source: `/Users/nugui/AP127_Docs/README.md`)
