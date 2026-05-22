#!/usr/bin/env node
// Pushes student.html (with WORKER_URL injected) to AP127_DashboardR1/index.html
// via GitHub API. Skips gracefully when GH_PAT_DASHBOARDR1 is not configured.

const fs = require('fs');

const { GH_PAT_DASHBOARDR1, CF_WORKER_URL } = process.env;
if (!GH_PAT_DASHBOARDR1) {
  console.log('GH_PAT_DASHBOARDR1 not set — skipping sync to AP127_DashboardR1');
  process.exit(0);
}

(async () => {
  const workerUrl = CF_WORKER_URL || '__WORKER_URL__';
  const content = fs.readFileSync('student.html', 'utf8')
    .replace("'__WORKER_URL__'", `'${workerUrl}'`);

  const headers = {
    Authorization: `Bearer ${GH_PAT_DASHBOARDR1}`,
    'User-Agent': 'github-actions',
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };

  // Get current SHA of index.html
  const metaResp = await fetch(
    'https://api.github.com/repos/nuguitar/AP127_DashboardR1/contents/index.html',
    { headers }
  );
  if (!metaResp.ok) throw new Error(`GitHub API GET: ${metaResp.status} ${await metaResp.text()}`);
  const { sha } = await metaResp.json();

  // Push updated content
  const pushResp = await fetch(
    'https://api.github.com/repos/nuguitar/AP127_DashboardR1/contents/index.html',
    {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        message: 'sync: update AP127 detail from AP127_NGT_001',
        content: Buffer.from(content).toString('base64'),
        sha,
      }),
    }
  );
  if (!pushResp.ok) throw new Error(`GitHub API PUT: ${pushResp.status} ${await pushResp.text()}`);

  console.log(`AP127_DashboardR1/index.html synced (${content.length} bytes, WORKER_URL injected)`);
})();
