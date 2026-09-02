// Opens (or leaves alone, if one's already open) a GitHub issue on DB001 so a
// dead GITHUB_PAT gets noticed instead of failing silently every 5 min forever
// (as happened 2026-07-07 — only caught via manual `wrangler tail`).
async function reportFailure(headers, failures) {
  const repo = 'AP127CMD/DB001';
  const label = 'dispatcher-failure';
  const listRes = await fetch(
    `https://api.github.com/repos/${repo}/issues?state=open&labels=${label}`,
    { headers }
  );
  if (!listRes.ok) {
    console.error(`Could not check for existing issue: ${listRes.status}`);
    return;
  }
  const open = await listRes.json();
  if (open.length > 0) return;

  const body = [
    'The `ap127-dispatcher` Worker failed to trigger one or more workflows:',
    '',
    ...failures.map((f) => `- **${f.label}**: ${f.status} ${f.detail}`),
    '',
    'Likely cause: the `GITHUB_PAT` secret on this Worker has expired (`wrangler secret put GITHUB_PAT`',
    'from a fresh token). See AP127_Docs README §10 for prior incidents (2026-07-07).',
    '',
    'Affected repos fall back to their own unreliable hourly `schedule:` cron until this is fixed.',
  ].join('\n');

  await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      title: `[Dispatcher] Failed to trigger ${failures.length} workflow(s) – ${new Date().toISOString().slice(0, 16)} UTC`,
      body,
      labels: [label],
    }),
  });
}

// Auto-close any stale open `dispatcher-failure` issue once every target
// dispatches cleanly again. Added 2026-08-30 after finding one sitting open
// for 3 days (#6, a one-off 504) — this worker previously had no close-on-
// success path (unlike CMD_CTR/CMDV2's own workflows), so a single transient
// blip's issue would silently swallow every future real alert forever, the
// same class of bug fixed for CMD_CTR's `fetch-failure` label on 2026-07-25.
async function closeStaleFailureIssue(headers) {
  const repo = 'AP127CMD/DB001';
  const label = 'dispatcher-failure';
  const listRes = await fetch(
    `https://api.github.com/repos/${repo}/issues?state=open&labels=${label}`,
    { headers }
  );
  if (!listRes.ok) return;
  const open = await listRes.json();
  for (const issue of open) {
    await fetch(`https://api.github.com/repos/${repo}/issues/${issue.number}/comments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ body: 'Resolved — all dispatcher targets fired successfully again. Auto-closing.' }),
    });
    await fetch(`https://api.github.com/repos/${repo}/issues/${issue.number}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ state: 'closed' }),
    });
  }
}


// ─── Cloud-fallback staleness gate ───────────────────────────────────────────
// Cloud takes over only when the Pi's published data has aged past this. The
// Pi's own gate is STANDBY_MAX_AGE_MIN=6 on a 5-min timer, so 35 min means the
// Pi has to miss ~6 consecutive cycles before GitHub Actions spends a runner.
const STALE_TAKEOVER_MIN = 35;

// `fetchedAt` sits inside the first few hundred bytes of flight-data-recent.js
// (same property the watchdog's extractFeedSig keys on), so a Range request
// reads it for ~500 bytes instead of pulling the whole ~200 KB feed. raw.
// githubusercontent honours Range; if it ever stops doing so we still only
// read the prefix we asked for and the slice below is harmless.
const FEED_URL =
  'https://raw.githubusercontent.com/AP127CMD/CMD_CTR/main/flight-data-recent.js';

async function feedAgeMinutes() {
  const res = await fetch(FEED_URL, {
    headers: { Range: 'bytes=0-599', 'User-Agent': 'CF-AP127-Dispatcher' },
    cf: { cacheTtl: 0 },
  });
  if (!res.ok && res.status !== 206) return null;   // unknown -> caller fails open
  const head = (await res.text()).slice(0, 600);
  const m = head.match(/"fetchedAt"\s*:\s*"([^"]+)"/);
  if (!m) return null;
  const when = Date.parse(m[1]);
  if (Number.isNaN(when)) return null;
  return (Date.now() - when) / 60000;
}

// Fails OPEN on purpose: if we cannot read the feed age at all (raw.github
// down, feed malformed, parse failure) we dispatch rather than assume health.
// A wasted runner minute is cheap; silently not fetching for hours is not —
// that is precisely the failure mode this whole pipeline keeps re-learning.
async function shouldDispatchFetch() {
  let age;
  try {
    age = await feedAgeMinutes();
  } catch (err) {
    console.error(`feed age check threw, failing open: ${err}`);
    return { dispatch: true, age: null, reason: 'age-check-error' };
  }
  if (age === null) {
    return { dispatch: true, age: null, reason: 'age-unknown' };
  }
  if (age >= STALE_TAKEOVER_MIN) {
    return { dispatch: true, age, reason: 'stale' };
  }
  return { dispatch: false, age, reason: 'pi-healthy' };
}

export default {
  async scheduled(event, env, _ctx) {
    const headers = {
      Authorization: `Bearer ${env.GITHUB_PAT}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'CF-AP127-Dispatcher',
    };
    const body = JSON.stringify({ ref: 'main' });

    const targets = [
      {
        url: 'https://api.github.com/repos/AP127CMD/DB001/actions/workflows/update-cache.yml/dispatches',
        label: 'DB001 update-cache.yml',
      },
      // CMD_CTR fetch_schedule.yml is NO LONGER dispatched unconditionally.
      //
      // 2026-09-02 role inversion: the Orange Pi Zero 2W
      // (`flight-schedule-feed/pi-native/`) is now the PRIMARY fetch path and
      // GitHub Actions is the automatic fallback. Previously both ran every
      // 5 min and the *Pi* held the standby gate; that meant ~110 full
      // Playwright runs/day on GitHub's runners doing work the Pi had
      // already done. CMD_CTR is a public repo so those minutes are free
      // today, but at ~12 min/run it is ~40,000 min/month — 20x the private
      // allowance, i.e. the pipeline would start costing real money the
      // moment the repo went private.
      //
      // The gate now lives HERE instead: this dispatch fires only when the
      // published feed has actually gone stale (see shouldDispatchFetch
      // below), which is the same takeover logic the Pi used, just moved to
      // the other side. Thresholds are deliberately asymmetric —
      // Pi fetches at >= 6 min, cloud takes over at >= 35 min — so the cloud
      // only steps in after the Pi has missed roughly six of its own cycles,
      // never racing it. CMD_CTR's own `0 */12 * * *` cron is the unguarded
      // cloud proof run that keeps the CI path from rotting unnoticed.
      // CMDV2 is not dispatched directly — CMD_CTR triggers it after
      // fetch_schedule.yml completes, so CMDV2's own SCHEDULE tab now also
      // refreshes every 5 min (chained off this target) instead of relying
      // on its own hourly refresh-data.yml cron, which is what left it up
      // to an hour+ stale relative to the PROG tab (fed by DB001's target
      // above, already 5-min) before this fix.
    ];

    const gate = await shouldDispatchFetch();
    const ageText = gate.age === null ? 'unknown' : `${Math.round(gate.age)} min`;
    if (gate.dispatch) {
      console.log(
        `CMD_CTR fetch: dispatching (feed age ${ageText}, reason=${gate.reason})`
      );
      targets.push({
        url: 'https://api.github.com/repos/AP127CMD/CMD_CTR/actions/workflows/fetch_schedule.yml/dispatches',
        label: 'CMD_CTR fetch_schedule.yml',
      });
    } else {
      console.log(
        `CMD_CTR fetch: skipped — Pi is primary and feed is ${ageText} old ` +
          `(< ${STALE_TAKEOVER_MIN} min).`
      );
    }

    const failures = [];
    await Promise.all(
      targets.map(async ({ url, label }) => {
        const res = await fetch(url, { method: 'POST', headers, body });
        if (!res.ok) {
          const detail = await res.text();
          console.error(`${label} dispatch failed: ${res.status} ${detail}`);
          failures.push({ label, status: res.status, detail });
        } else {
          console.log(`Dispatched ${label}`);
        }
      })
    );

    if (failures.length > 0) {
      await reportFailure(headers, failures);
    } else {
      await closeStaleFailureIssue(headers);
    }
  },
};
