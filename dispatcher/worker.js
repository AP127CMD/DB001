export default {
  async scheduled(event, env, _ctx) {
    const headers = {
      Authorization: `Bearer ${env.GITHUB_PAT}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'CF-AP127-Dispatcher',
    };
    const body = JSON.stringify({ ref: 'main' });

    if (event.cron === '*/5 * * * *') {
      const res = await fetch(
        'https://api.github.com/repos/nuguitar/AP127_NGT_001/actions/workflows/update-cache.yml/dispatches',
        { method: 'POST', headers, body }
      );
      if (!res.ok) {
        console.error(`NGT_001 dispatch failed: ${res.status} ${await res.text()}`);
      } else {
        console.log('Dispatched AP127_NGT_001 update-cache.yml');
      }
    }

    if (event.cron === '*/30 * * * *') {
      const res = await fetch(
        'https://api.github.com/repos/nuguitar/AP127_Command_Center/actions/workflows/fetch_schedule.yml/dispatches',
        { method: 'POST', headers, body }
      );
      if (!res.ok) {
        console.error(`Command_Center dispatch failed: ${res.status} ${await res.text()}`);
      } else {
        console.log('Dispatched AP127_Command_Center fetch_schedule.yml');
      }
    }
  },
};
