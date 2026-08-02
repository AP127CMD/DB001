# DB001 — Claude Code Context

## ⚠️ Update rule — do this after EVERY code change
1. Update the Verify section below (last change date + what changed)
2. Update `/Users/nugui/AP127_Docs/README.md` §2.2 (add to §10 log) — then push AP127_Docs
3. `git add . && git commit && git pull --rebase && git push`

## What this project is
Admin dashboard + data pipeline for AP127 flight-training progress (AP124 / AP126 / AP127 / AP129).
GitHub: `AP127CMD/DB001` | Live: https://ap127-db001.pages.dev | Local: `/Users/nugui/AP127_NGT_001/`

## Verify actual state — run before starting
```bash
git log --oneline | grep -v "chore: update cache\|Merge\|pages-build" | head -6
```
**Last known:** no version token (no JS cache-busting in this project); CF Pages auto-deploys on every push. 2026-08-02 — removed the `Push student.html to AP127_DashboardR1` step from `update-cache.yml` (see below).

## Key facts — things that trip up new sessions
- **DB_Share no longer synced from this repo (2026-08-02).** DB_Share now mirrors CMDV2's "AP127 Detail V4" tab live via a proxy in its own repo — see `AP127_V2/docs/superpowers/specs/2026-08-02-mirror-cmdv2-detail-v4-design.md`. `update-cache.yml`'s `Push student.html to AP127_DashboardR1` step (`sync-dashboardr1.js`) was removed; `student.html`/`build-student.js`/`sync-dashboardr1.js` are left in this repo **unused but untouched** per explicit user direction — don't delete them without asking again. `build-student.js`'s step still runs hourly (harmless — produces a file nothing reads anymore). `push-to-kv.js`/`AP127_STUDENT_DATA` KV are unaffected — that still feeds the shared `ap127-data-api` worker CMDV2/CMDV3/DB_Share all depend on for live progress.
- `index.html` has `__RELAY_URL__` + `__ADMIN_HASH__` placeholders — CF Pages injects via GitHub secrets + `sed` at deploy; do not replace them with real values in the file
- **AP127 Detail sync (DB001's own admin view only now)** — edit ONLY `index.html` inside the `##AP127*##` comment markers; `build-student.js` still auto-syncs to `student.html`, but nothing downstream reads `student.html` anymore
- **Never declare the same `let`/`const` both inside and outside the `##AP127*##` markers** — duplicate declaration = SyntaxError that silently hangs the student page
- **AP129 is synthetic** — 13 placeholder students generated in `update-cache.js`, no CSV feed
- `AUPRT*` lessons dropped inside `parseCSV()` — must never appear in totals or scheduler
- **Split lesson handling (fixed 2026-06-22):** `/N` suffix records (e.g. "CDGL 10/2") are now accumulated into the base lesson's `actual_mins` instead of being dropped. Curriculum filter unchanged. See `update-cache.js` flown parsing loop.
- `dispatcher/`: CF Worker `ap127-dispatcher` (cron */5) triggers `update-cache.yml`; code lives in this repo
- **`data-api/` (added 2026-07-27):** CF Worker `ap127-data-api` — the read-only progress JSON API backing DB_Share, CMDV2, and CMDV3 (`ap127-data-api.anusorn-tanmetha.workers.dev`). Previously deployed ad hoc via `wrangler deploy` from no tracked source anywhere (docs called it out explicitly: "no in-repo workflow") — given a real home here, matching the `dispatcher/` pattern. **Fixed the same day it was given a home:** its CORS was hardcoded to a single `ALLOWED_ORIGIN` var (DB_Share only), so CMDV2's and CMDV3's own live-fetch of this same worker always failed with a browser CORS error — confirmed via curl with different `Origin` headers, only DB_Share could ever succeed even though all three consumers are documented. Now uses an `ALLOWED_ORIGINS` allowlist (same reflect-if-allowlisted pattern as `watchdog/src/index.js`) covering DB_Share + CMDV2 + CMDV3, default falls back to DB_Share, never a wildcard. Redeploy: `cd data-api && npx wrangler deploy`. No CI workflow yet — deploy manually, same as before.
- **CI (2026-06-29):** `update-cache.yml` push step is race-proof — 5-attempt push loop with `git rebase -X theirs` (keeps our regenerated cache.json/student.html). Do NOT revert to plain `git pull --rebase --autostash`; rebase conflicts caused ~45 failures.
- **CI (2026-07-08):** `GH_PAT_DASHBOARDR1` had expired (401 on every `Push student.html to AP127_DashboardR1` step) — 227 straight failures 2026-07-03→07-08, even though `cache.json`/KV/main-repo push were all succeeding fine each run (last step only). Rotated. If this workflow shows red again, check which step failed before assuming the RELAY_URL fetch is the problem — it usually isn't. See AP127_Docs §10.
- **Alerting added (2026-07-08):** `update-cache.yml` now has `issues: write` + a "Report failure as GitHub issue" step (label `update-cache-failure`), matching CMD_CTR/CMDV2's existing pattern — previously this workflow had none, so the 4-day PAT-expiry outage above sat unnoticed. `dispatcher/worker.js` now also opens a GitHub issue (label `dispatcher-failure`, on this repo) if any target dispatch fails, deduped so it won't spam every 5 min.
- **`deploy-dispatcher.yml` fixed (2026-07-09):** `CF_WORKERS_TOKEN` was missing since 2026-06-04 (not expired — never set); created and added. Pushes to `dispatcher/**` now auto-deploy the Worker again — no more manual `wrangler deploy` needed.
- **PATs rotated to fine-grained (2026-07-09):** `GH_PAT_DASHBOARDR1` and `GH_PAT_DISPATCHER` are now dedicated fine-grained PATs (not the broad stopgap token from 07-07/08) — see AP127_Docs §8/§10 for exact scopes. 1-year expiry, rotate by **2027-07-09**.

## Master reference
Full architecture, deploy steps, secrets: https://ap127-docs.pages.dev  (§2.2)
