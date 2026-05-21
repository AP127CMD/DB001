# AP127 Dashboard — Project Reference

> **Last updated:** 2026-05-21  
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
| `index.html` | Entire front-end: CSS + HTML + JS in one file | ~1 650 lines |
| `update-cache.js` | Node.js script: fetches CSVs, runs scheduler, writes `cache.json` | ~160 lines |
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

> **AUPRT exclusion:** Any lesson or flown entry whose name matches `/^AUPRT/i` is silently dropped inside `parseCSV()` in both `index.html` and `update-cache.js`. This means `total`, `done`, `pct`, `remaining`, `finish`, and all scheduler projections never include AUPRT lessons.

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

> **Note:** Lessons whose name starts with `AUPRT` (case-insensitive) are excluded at the `parseCSV` stage and never reach the scheduler or any view. See §4 Data Model note.

**Signature:** `runScheduler(batchData, curricula, extraBatches=[], startDate="", hourMode=false)`

- Generates planned lesson dates for all batches (AP124, AP126, AP127, AP129, extra batches).
- **Schedule start:** Tomorrow (Bangkok time, UTC+7). All planned lessons are strictly future. `update-cache.js` and the Simulation both compute tomorrow's Bangkok date at runtime.
- **Daily cap:** Configurable. In **flights mode** (default): max N flights/day. In **hours mode**: max N flight-hours/day; each lesson costs `planned_mins / 60` hours and shorter lessons can fill remaining capacity after larger ones are skipped.
- **Priority order:** AP124 → AP126 → AP127 → AP129 → Extra batches (in added order).
- **Eligibility gap:** Students who flew a lesson ≥ 120 min must wait 2 workdays; others wait 1. Initialized via `computeLwM(lastFlightDate, wds[0])` which counts actual workdays between the last real flight and the first scheduled workday — so the gap is correctly enforced from the true last flight, not reset arbitrarily.
- **AP129** starts on `CFG.ap129start` (default `2026-06-01`); uses AP127 curriculum. Fixed at 13 students.
- **Extra batches** — user-defined in Simulation page: each has a name, student count, and start date; all use AP127 curriculum (101 lessons).
- **Planning horizon:** 800 workdays from tomorrow (configurable in Simulation).
- **Holidays 2026** (14 Thai public holidays) defined in `HOL` Set.

`computeLwM(ld, firstWd)` helper (inside `runScheduler`):
```js
// Returns negative virtual workday index for last-flight date ld relative to wds[0]
// Counts workdays strictly after ld up to and including firstWd
// Result: -N means student last flew N workdays before the schedule starts
```

---

## 7. Pages / Navigation

Main nav tabs:

| Nav label | Page ID | Render function | Batch filter applies? |
|---|---|---|---|
| AP127 Detail | `page-ap127detail` | `renderAP127Detail()` | No |
| School's Performance | `page-performance` | `renderPerformance()` | No |
| **Simulation** | `page-simulation` | `renderSimulation()` | No |
| ⚙ Admin | `page-admin` | — (password-gated) | No |

Simulation sub-nav (visible only when Simulation is active):

| Sub-nav label | Page ID | Notes |
|---|---|---|
| ◈ Simulation | `page-simulation` | Scheduler params · info panel · finish cards · capacity chart |
| Overview | `page-overview` | `renderStats()` + charts |
| Flight Plans | `page-plans` | Batch filter applies |
| Calendar | `page-calendar` | Batch filter applies |

---

## 8. Key JavaScript Functions

### Data / Sync

| Function | Description |
|---|---|
| `syncAll()` | Fetches live CSVs from relay for AP124/AP126/AP127, runs scheduler, re-renders |
| `fetchBatch(batch)` | Single-batch fetch + `parseCSV` via Apps Script relay |
| `parseCSV(text, batch)` | Parses 3-row-per-student CSV format into `{students, curriculum}` |
| `runScheduler(batchData, curricula, extraBatches, startDate, hourMode)` | Generates planned schedules; returns full cache structure |

### Rendering

| Function | Description |
|---|---|
| `renderAll()` | Calls all render/chart functions; used after sync or param change |
| `makeCard(s, rankClass="")` | Builds a `.scard` HTML string for Flight Plans view. Footer shows next lesson code + date, finish tag labelled "Finish: [date]" |
| `renderPlans()` | Renders the Flight Plans card grid with per-batch rank colouring |
| `renderAP127Detail()` | Renders KPIs, ranking table, pace bands, activity feed, charts |
| `renderPerformance()` | Renders School's Performance page (stats + two charts) |
| `renderCal()` | Renders the calendar grid for the current month |
| `renderSimulation()` | Renders Simulation page controls and info panel; auto-runs if `SIM_G` already set |
| `renderSimFinish()` | Renders finish-date projection cards from `SIM_G` |
| `renderSimExtraList()` | Renders editable extra-batch rows in the controls section |

### Simulation

| Function | Description |
|---|---|
| `runSimulation()` | Reads controls, calls `runScheduler` with tomorrow's Bangkok date + `CFG.hourMode`, stores result in `SIM_G`, re-renders finish cards and capacity chart |
| `buildSimCapacityChart()` | Builds stacked bar chart on `c-sim-cap`; switches labels/axis/tooltip between flights and hours mode based on `SIM_G.hourMode` |
| `toggleHourMode(isHour)` | Switches `CFG.hourMode`, updates cap label/desc/unit, resets slider range & default value |
| `addExtraBatch()` | Appends a new entry to `EXTRA_BATCHES[]` with auto-assigned color |
| `removeExtraBatch(id)` | Removes entry by id from `EXTRA_BATCHES[]` |
| `updateExtraBatch(id, key, val)` | Updates a field (name/n/start/color) on an `EXTRA_BATCHES` entry |

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
| `c-sim-cap` | `buildSimCapacityChart()` | Simulation — stacked by batch, flights or hours mode |
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
| 2026-05-21 | `e68d967` | **feat:** exclude AUPRT lessons from all calculations and views — filtered at `parseCSV()` in both files |
| 2026-05-20 | `ea1ba9e` | **feat:** collapsible "How it Works" panel (details/summary) · hours/day cap mode toggle (scheduler, monthly stats, chart all update) |
| 2026-05-20 | `340d3d3` | **fix:** schedule starts from tomorrow (Bangkok time); `computeLwM()` initialises eligibility gap from real last-flight date |
| 2026-05-20 | `340ffb6` | **feat:** simulation explanation panel · Flight Plans footer fix (next lesson date + "Finish:" label) · planning horizon desc updated |
| 2026-05-20 | `9e7eb39` | **feat:** SIMULATION overhaul — renamed Capacity→Simulation, sub-nav, finish-date projection cards, extra batch support, capacity chart |
| 2026-05-19 | | **feat:** AP127 Detail — call sign column, IDLE days, DAY delta (color coded), timeline connecting lines, race chart per-student toggle |
| 2026-05-11 | `ad29c3a` | **feat:** status bands · capacity page · mobile nav hamburger · timezone fix |
| 2026-05-10 | `7f5ac65` | chore: automated cache updates |
| (earlier) | | Chrome cache bypass fix; Node v20→v22; admin password hashing; AP127 pace bands |

---

## 14. AP127 Detail Page Improvements (2026-05-19)

### Student Ranking Table
- **Call Sign column:** Moved call sign (e.g., A-RUT) from secondary display below name to dedicated column for clearer identification
- **IDLE(days) column:** Shows number of days since student's last flight to current date
- **Hours calculation:** Changed from actual flight time to planned curriculum time per completed lesson (more accurate for planning)
- **DAY delta column:** 
  - Replaces "Plan Delta" with focus on last lesson date vs. plan
  - Calculates: current date minus planned date of last completed lesson
  - Positive = delay (shown in red), negative = ahead (shown in green)
  - Example: If last lesson CDGL 02 has plan date 2026-05-09 and today is 2026-05-19, shows +10 days (delay) in red
- **Last FLT column:** Renamed from "Last Date" for clarity (shows date of last completed flight)

### Flight Timeline vs Progress
- **Connecting lines:** Lines now connect dots for each student to visualize flight progression over time
- **Gaps annotation:** Days between flights visible via line segments
- **Call sign labels:** Y-axis shows call signs (e.g., "1. A-VIT") instead of full names for compactness
- **Aligned layout:** Student names positioned at vertical midpoint of their row for better visual alignment

### Actual vs Planned (Race Chart)
- **Toggle controls:**
  - "✓ All" button: Show all student lines
  - "✗ None" button: Hide all student lines
  - Per-student buttons: Click call sign to toggle that student's line on/off
  - Buttons highlight in blue (visible) or gray (hidden) for clarity
- **Call sign labels:** Legend and buttons use call signs throughout
- **Final values:** Line values visible at endpoints for reading final cumulative lesson count

### Overall Progress Bar View
- **Call sign labels:** Y-axis labels use call signs instead of full names

### Color Consistency
- Red: Most behind (visually indicates delay)
- Green: Most ahead (visually indicates progress)
- Applied consistently across DAY delta column, pace bands, and progress indicators

---

## 15. Simulation Page (2026-05-20)

### Scheduler Parameters
- **Daily Flight Cap** / **Daily Hour Cap** — slider (5–50 for flights, 10–200 for hours)
- **Cap Mode toggle** — Flights ↔ Hours. In hours mode the slider label, unit, and default reset; scheduler uses `planned_mins/60` per lesson
- **AP129 Start Date** — text input `YYYY-MM-DD`; AP129 always uses 13 students and AP127 curriculum
- **Planning Horizon** — slider 200–1 200 workdays from tomorrow
- **Additional Batches** — add/remove extra batches (name, N students, start date); all use AP127 curriculum; priority after AP129

### How the Simulation Works panel
Collapsible `<details>` element. Explains: schedule start, priority order, daily cap, eligibility gaps, workdays, curriculum counts per batch, ETC basis, locked-in vs projected-only distinction.

### Estimated Finish Dates cards
One card per batch (AP124, AP126, AP127, AP129, each extra batch). Shows: batch name, projected last finish date, progress bar, Done %, First finishes date, Months to go, Lessons left.

### Capacity chart (`c-sim-cap`)
Stacked bar by batch per month. In flights mode: avg flights/workday. In hours mode: avg hrs/workday. Dashed line = daily cap. "NOW" vertical marker.

### Global state
```js
let SIM_G = null;           // simulation result — never overwrites live G
let EXTRA_BATCHES = [];     // user-defined extra batch configs
const EXTRA_COLORS = [...]; // 6 preset colors cycling for extra batches
```

---

## 16. Known Issues / Backlog

- **AP127_NICKS array is duplicated** in `index.html` and `update-cache.js` — should be sourced from one place (e.g., `cache.json` or a shared `config.json`).
- **Input validation missing in Admin** — invalid AP129 start date silently fails.
- **`new Date().toISOString().slice(0,10)`** used for "today" in `buildAP127RaceChart` and `renderCal` — returns UTC date, which is one day behind for Bangkok users after midnight UTC (before 7 AM BKK). Low-impact; fix by using local date parts instead.
- **Monolithic HTML** — all CSS, HTML, JS in one file. Works fine for this project scale; consider modularising if it grows significantly.
- **Hour mode not persisted to Admin** — `CFG.hourMode` is in-memory only; resetting the page reverts to flights mode.
