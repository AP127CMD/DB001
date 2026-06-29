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
**Last known:** no version token (no JS cache-busting in this project); CF Pages auto-deploys on every push.

## Key facts — things that trip up new sessions
- `index.html` has `__RELAY_URL__` + `__ADMIN_HASH__` placeholders — CF Pages injects via GitHub secrets + `sed` at deploy; do not replace them with real values in the file
- **AP127 Detail sync — edit ONLY `index.html`** inside the `##AP127*##` comment markers; `build-student.js` auto-syncs to `student.html`; `sync-dashboardr1.js` auto-pushes to DB_Share
- **Never declare the same `let`/`const` both inside and outside the `##AP127*##` markers** — duplicate declaration = SyntaxError that silently hangs the student page
- **AP129 is synthetic** — 13 placeholder students generated in `update-cache.js`, no CSV feed
- `AUPRT*` lessons dropped inside `parseCSV()` — must never appear in totals or scheduler
- **Split lesson handling (fixed 2026-06-22):** `/N` suffix records (e.g. "CDGL 10/2") are now accumulated into the base lesson's `actual_mins` instead of being dropped. Curriculum filter unchanged. See `update-cache.js` flown parsing loop.
- `dispatcher/`: CF Worker `ap127-dispatcher` (cron */5) triggers `update-cache.yml`; code lives in this repo
- **CI (2026-06-29):** `update-cache.yml` push step is race-proof — 5-attempt push loop with `git rebase -X theirs` (keeps our regenerated cache.json/student.html). Do NOT revert to plain `git pull --rebase --autostash`; rebase conflicts caused ~45 failures.

## Master reference
Full architecture, deploy steps, secrets: https://ap127-docs.pages.dev  (§2.2)
