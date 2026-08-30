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
      // CMD_CTR fetch_schedule.yml RE-ENABLED 2026-08-30 — was commented out
      // 2026-08-26 during the Google-sign-in-wall outage (see CMD_CTR/
      // CLAUDE.md's 2026-08-26 entry). Confirmed working again 2026-08-29: a
      // live `workflow_dispatch -f force=true` test fetched 280 flights/18
      // dates cleanly on GitHub's own runners — the portal never actually
      // required sign-in for anonymous access, Google's bot-detection was
      // only ever flagging Playwright's fingerprint during the *interactive
      // sign-in* flow specifically. GitHub Actions is now the PRIMARY fetch
      // path again, same 5-min cadence as DB001's own target above; the
      // Orange Pi Zero 2W (`flight-schedule-feed/pi-native/`) stays running
      // too, as pure redundancy, not the primary any more.
      {
        url: 'https://api.github.com/repos/AP127CMD/CMD_CTR/actions/workflows/fetch_schedule.yml/dispatches',
        label: 'CMD_CTR fetch_schedule.yml',
      },
      // CMDV2 is not dispatched directly — CMD_CTR triggers it after
      // fetch_schedule.yml completes, so CMDV2's own SCHEDULE tab now also
      // refreshes every 5 min (chained off this target) instead of relying
      // on its own hourly refresh-data.yml cron, which is what left it up
      // to an hour+ stale relative to the PROG tab (fed by DB001's target
      // above, already 5-min) before this fix.
    ];

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
