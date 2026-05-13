# AP127 Dashboard — Project Reference

> **Last updated:** 2026-05-11  
> **Repo:** https://github.com/nuguitar/AP127_NGT_001  
> **Live site:** deployed via GitHub Pages (URL injected from `RELAY_URL` secret at build time)

---

## 1. Purpose

A single-page flight-training dashboard for **CATC (Civil Aviation Training Center)** that tracks student progress, schedules lessons, and shows performance analytics across four pilot-training batches: **AP124, AP126, AP127, AP129**.

---

## 2. Architecture

```
Google Sheets (CSV source)
        │
        ▼  (Google Apps Script relay — bypasses CORS)
  update-cache.js  ←  GitHub Actions (cron every 5 min)
        │
        ▼
   cache.json  (committed to main branch)
        │
        ▼
   index.html  ←  GitHub Pages (served as static site)
```

### Files

| File | Role | Size |
|---|---|---|
| `index.html` | Entire front-end: CSS + HTML + JS in one file | ~1 316 lines |
| `update-cache.js` | Node.js script: fetches CSVs, runs scheduler, writes `cache.json` | ~147 lines |
| `cache.json` | Pre-computed data cache served to the browser | ~500 KB |
| `.github/workflows/update-cache.yml` | Scheduled job: refresh data + deploy Pages every 5 min |
| `.github/workflows/static.yml` | Deploy-only job: triggered on every push to `main` |

### Secrets (stored in GitHub repo settings)

| Secret | Used for |
|---|---|
| `RELAY_URL` | Google Apps Script web-app URL (injected into `index.html` at build time via `sed`) |
| `ADMIN_PASSWORD_HASH` | SHA-256 hash of the admin password (injected the same way) |

---

## 3. Tech Stack

| Layer | Technology |
|---|---|
| UI framework | Vanilla HTML + CSS + JavaScript (no build toolchain) |
| Charts | Chart.js 4.4.1 (CDN) |
| Fonts | Rajdhani · JetBrains Mono · Nunito (Google Fonts) |
| Runtime (server) | Node.js v22 (GitHub Actions, Ubuntu) |
| Hosting | GitHub Pages |
| Data source | Google Sheets published as CSV |
| Data relay | Google Apps Script (CORS bridge) |

---

## 4. Data Model (`cache.json`)

### Top-level keys

```
ap124  []   – AP124 student records
ap126  []   – AP126 student records
ap127  []   – AP127 student records
ap129  []   – AP129 student records (projected, not real data)
monthly {}  – aggregated flights/workday per batch per month
cur124  []  – AP124 curriculum (97 lessons)
cur126  []  – AP126 curriculum (101 lessons)
cur127  []  – AP127 curriculum (101 lessons)
cap     25  – daily flight cap
_updated    – ISO timestamp of last cache write
```

### Student record

```jsonc
{
  "catc_id": "68117700042",       // prefix 681
  "name": "Akaravit Khwanngam",
  "batch": "AP127",
  "nick": "A-VIT",                // assigned in JS from AP127_NICKS[]
  "done": 4,                      // lessons completed
  "total": 101,
  "remaining": 97,
  "pct": 4.0,
  "flown": [                      // completed flights
    { "lesson": "CDGL 01", "actual_ft": "1:00", "actual_mins": 60, "date": "2026-04-21" }
  ],
  "planned": [                    // scheduler-generated future lessons
    { "date": "2026-05-08", "lesson": "CDGL 05", "mins": 75 }
  ],
  "planned_total": 97,
  "next_lesson": "CDGL 05",
  "finish": "2027-06-15"          // projected finish date
}
```

### Monthly object

```jsonc
"2026-05": {
  "124": 4.4,   // AP124 avg flights/workday
  "126": 17.4,  // AP126
  "127": 3.1,   // AP127
  "129": 0,     // AP129
  "t": 25       // total across all batches
}
```

### Curriculum entry

```jsonc
{ "lesson": "CDGL 01", "planned_mins": 60, "planned_date": "2026-03-31" }
```

---

## 5. Batches

| Batch | Students | Curriculum | Status |
|---|---|---|---|
| AP124 | 9 | 97 lessons | Active |
| AP126 | 28 | 101 lessons | Active |
| AP127 | 28 | 101 lessons | Active (primary focus) |
| AP129 | 13 | 101 lessons (mirror of AP127) | Projected — starts 2026-06-01 |

**AP127 nicknames** are hardcoded in both `index.html` and `update-cache.js`:
```
AP127_NICKS = ["A-VIT","A-SORN","A-RUT","B-SET","J-YU","K-PONG","K-YA","K-KORN","K-SEE",
               "KRIT","M-PHAN","N-PON","N-KALP","N-PHAT","P-THAN","P-KORN","P-KUL",
               "P-DET","S-SIT","S-KORN","S-WITCH","S-WAN","T-KORN","T-WAJ",
               "V-PHON","W-PHOL","W-POL","W-PONG"]
```

---

## 6. Scheduler (`runScheduler` in both files)

- Generates planned lesson dates for all four batches.
- **Daily cap:** 25 flights/day across all batches combined.
- **Priority order:** AP124 → AP126 → AP127 → AP129.
- **Eligibility gap:** Students who flew a lesson ≥ 120 min must wait 2 workdays; others wait 1.
- **AP129** starts on `CFG.ap129start` (default `2026-06-01`); uses AP127 curriculum.
- **Planning horizon:** 800 workdays from `2026-05-05`.
- **Holidays 2026** (14 Thai public holidays) defined in `HOL` Set.

---

## 7. Pages / Navigation

| Nav label | Page ID | Render function | Batch filter applies? |
|---|---|---|---|
| AP127 Detail | `page-ap127detail` | `renderAP127Detail()` | No |
| School's Performance | `page-performance` | `renderPerformance()` | No |
| **Capacity** *(new)* | `page-capacity` | `renderCapacity()` | No |
| Overview | `page-overview` | `renderStats()` + charts | No |
| Flight Plans | `page-plans` | `renderPlans()` | Yes |
| Calendar | `page-calendar` | `renderCal()` | Yes |
| ⚙ Admin | `page-admin` | — (password-gated) | No |

---

## 8. Key JavaScript Functions

### Data / Sync

| Function | Description |
|---|---|
| `syncAll()` | Fetches live CSVs from relay for AP124/AP126/AP127, runs scheduler, re-renders |
| `fetchBatch(batch)` | Single-batch fetch + `parseCSV` via Apps Script relay |
| `parseCSV(text, batch)` | Parses 3-row-per-student CSV format into `{students, curriculum}` |
| `runScheduler(batchData, curricula)` | Generates planned schedules; returns full cache structure |

### Rendering

| Function | Description |
|---|---|
| `renderAll()` | Calls all render/chart functions; used after sync or param change |
| `makeCard(s, rankClass="")` | Builds a `.scard` HTML string for Flight Plans view |
| `renderPlans()` | Renders the Flight Plans card grid with per-batch rank colouring |
| `renderAP127Detail()` | Renders KPIs, ranking table, pace bands, activity feed, charts |
| `renderCapacity()` | Renders the Capacity page (KPIs + chart) |
| `renderPerformance()` | Renders School's Performance page (stats + two charts) |
| `renderCal()` | Renders the calendar grid for the current month |

### AP127-specific helpers

| Function | Description |
|---|---|
| `ap127RankClass(rank, total)` | Returns `"bad"` (rank ≤ 3) · `"mid"` (top 40%) · `"ok"` (rest) |
| `ap127PaceSort(arr, asOf)` | Sort by lessons done DESC (leader first) |
| `ap127BehindSort(arr, asOf)` | Sort by lessons done ASC (lagger first) |
| `ap127IdleDays(s, asOf)` | Days since student's last flight |
| `ap127PlanDeltaDays(s, planMap)` | Average days ahead (+) / behind (−) the curriculum plan |
| `ap127DateDiff(a, b)` | Days between two `YYYY-MM-DD` strings |

### Charts

| Canvas ID | Builder | Page |
|---|---|---|
| `c-load` | `buildLoad()` | Overview |
| `c-prog` | `buildProg()` | Overview |
| `c-124` / `c-126` / `c-127` | `buildBC(...)` | Overview |
| `c-capacity` | `buildCapacity()` | Capacity *(new)* |
| `c-perf-daily` / `c-perf-monthly` | `renderPerformance()` | School's Performance |
| `d127-timeline` | `buildAP127Timeline()` | AP127 Detail |
| `d127-race` | `buildAP127RaceChart()` | AP127 Detail (actual vs planned burndown) |
| `d127-overall` | `buildAP127OverallChart()` | AP127 Detail |

---

## 9. CSS Design System

### Color variables

```css
--bg:#0d1117   --s1:#161b22   --s2:#1c2128   --s3:#21262d
--bd:#30363d   --tx:#e6edf3   --tx2:#8b949e  --tx3:#6e7681
--c124:#c084fc  (purple)    --c124b: rgba version (12% opacity bg)
--c126:#38bdf8  (cyan)
--c127:#fb923c  (orange)
--c129:#4ade80  (green)
--acc:#f59e0b   (amber — accent/admin)
--done:#22c55e  --adm:#818cf8
```

### Status band classes (student cards — added 2026-05-11)

```css
.scard               { border-left: 4px solid transparent; }
.scard.status-ok     { border-left-color: #4ade80; }  /* top 60% */
.scard.status-mid    { border-left-color: #fbbf24; }  /* mid 40% */
.scard.status-bad    { border-left-color: #f87171; }  /* bottom 3 */
```

### Mobile breakpoint

`@media(max-width:900px)` — collapses grid layouts, hides table columns 2 & 4, shows `#nav-toggle` hamburger button, hides `.bts` batch drawer.

---

## 10. Date / Timezone Handling

> **Operational timezone:** Asia/Bangkok (UTC+7)

**Rule:** All date-string iteration (workday calculation) uses **UTC noon** to avoid off-by-one errors for browsers in positive UTC offsets:

```js
// ✅ Correct pattern (avoids toISOString() off-by-one for UTC+7 users)
function isWD(ds) {
  const d = new Date(ds + "T12:00:00Z");
  const dw = d.getUTCDay();
  return dw !== 0 && dw !== 6 && !HOL.has(ds);
}
function getWDs(s, n) {
  let d = new Date(s + "T12:00:00Z");
  while (...) {
    const ds = d.toISOString().slice(0,10);
    ...
    d.setUTCDate(d.getUTCDate() + 1);
  }
}
```

**Display functions** (`fd`, `fm`, `ap127FmtDate`, etc.) continue to use `new Date(ds+"T00:00:00")` (local time) because `toLocaleDateString()` reads local time — this is correct for display.

Same UTC noon fix applied in `update-cache.js` for consistency.

---

## 11. Admin Panel

Accessed via "⚙ Admin" nav tab (SHA-256 password-gated, hash stored as `ADMIN_PASSWORD_HASH` secret).

### Configurable parameters

| Setting | Default | Effect |
|---|---|---|
| Daily Flight Cap | 25 | Max flights/day across all batches |
| AP129 Students | 13 | Number of projected AP129 students |
| AP129 Start Date | 2026-06-01 | First flight date for AP129 |
| Planning Horizon | 800 workdays | How far forward to schedule |
| Recent Flights per Card | 3 | Lines shown in card history |
| Upcoming per Card | 8 | Lines shown in card plan |
| Card Height | 190px | Max scroll height of lesson list in cards |
| Chart Height | 190px | Overview chart heights |
| Rest-Day Badge | on | "+r" tag on lessons after ≥ 120 min flights |
| Next Lesson Tag | on | Next lesson code in card footer |

### Relay URL

Paste the Google Apps Script web-app URL here. Saved to `localStorage`. Injected at deploy time via `sed` into the `__RELAY_URL__` placeholder.

---

## 12. Deployment Pipeline

```
Push to main
    │
    ├─► static.yml
    │     1. Inject secrets into index.html (sed)
    │     2. Upload to GitHub Pages
    │     3. Deploy
    │
    └─► (scheduled) update-cache.yml  — every 5 min
          1. node update-cache.js  (fetches live data, rewrites cache.json)
          2. git commit cache.json if changed
          3. git push  →  triggers static.yml above
          4. Inject secrets + deploy Pages
```

---

## 13. Changelog

| Date | Commit | Description |
|---|---|---|
| 2026-05-11 | `ad29c3a` | **feat:** status bands · capacity page · mobile nav hamburger · timezone fix |
| 2026-05-10 | `7f5ac65` | chore: automated cache updates |
| (earlier) | | Chrome cache bypass fix; Node v20→v22; admin password hashing; AP127 pace bands |

---

## 14. Known Issues / Backlog

- **AP127_NICKS array is duplicated** in `index.html` and `update-cache.js` — should be sourced from one place (e.g., `cache.json` or a shared `config.json`).
- **Input validation missing in Admin** — invalid AP129 start date silently fails.
- **`new Date().toISOString().slice(0,10)`** used for "today" in `buildAP127RaceChart` and `renderCal` — returns UTC date, which is one day behind for Bangkok users after midnight UTC (before 7 AM BKK). Low-impact; fix by using local date parts instead.
- **Monolithic HTML** — all CSS, HTML, JS in one file. Works fine for this project scale; consider modularising if it grows significantly.
