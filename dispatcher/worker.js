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
        url: 'https://api.github.com/repos/nuguitar/AP127_NGT_001/actions/workflows/update-cache.yml/dispatches',
        label: 'AP127_NGT_001 update-cache.yml',
      },
      {
        url: 'https://api.github.com/repos/nuguitar/AP127_Command_Center/actions/workflows/fetch_schedule.yml/dispatches',
        label: 'AP127_Command_Center fetch_schedule.yml',
      },
      {
        url: 'https://api.github.com/repos/nuguitar/AP127_V2/actions/workflows/refresh-data.yml/dispatches',
        label: 'AP127_V2 refresh-data.yml',
      },
    ];

    await Promise.all(
      targets.map(async ({ url, label }) => {
        const res = await fetch(url, { method: 'POST', headers, body });
        if (!res.ok) {
          console.error(`${label} dispatch failed: ${res.status} ${await res.text()}`);
        } else {
          console.log(`Dispatched ${label}`);
        }
      })
    );
  },
};
