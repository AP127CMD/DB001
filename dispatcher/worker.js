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
      // CMD_CTR fetch_schedule.yml TEMPORARILY REMOVED 2026-08-26 — the Ops
      // Portal now requires Google sign-in and Google's bot-detection
      // permanently blocks a Playwright-launched browser from completing it
      // (not fixable by retrying; see CMD_CTR/CLAUDE.md + AP127_Docs README
      // §10, both 2026-08-25). The workflow itself is also disabled
      // (`gh workflow disable`) so dispatching it would just 403 anyway —
      // removed here too so THIS worker doesn't treat that 403 as a
      // dispatcher failure and open a spurious `dispatcher-failure` issue on
      // DB001 every time it runs. Durable fix: an Orange Pi 4 Pro running a
      // persistent authenticated Chrome (see /Users/nugui/CLAUDE/HomeServer/)
      // — once that's live and proven, re-add this target AND
      // `gh workflow enable "Fetch Flight Schedule & Deploy" -R AP127CMD/CMD_CTR`.
      // {
      //   url: 'https://api.github.com/repos/AP127CMD/CMD_CTR/actions/workflows/fetch_schedule.yml/dispatches',
      //   label: 'CMD_CTR fetch_schedule.yml',
      // },
      // CMDV2 is no longer dispatched directly — CMD_CTR triggers it after
      // fetch_schedule.yml completes so CMDV2 always reads fresh upstream data.
      // (Also paused while the above is paused — CMDV2 just won't get fresh
      // upstream flight data until the Pi is live; its own hourly
      // refresh-data.yml cron still runs, it just has nothing new to mirror.)
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
    }
  },
};
