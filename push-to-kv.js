#!/usr/bin/env node
// Pushes the AP127-only slice of cache.json to Cloudflare KV.
// Skips gracefully when CF secrets are not configured.

const fs = require('fs');

const { CF_ACCOUNT_ID, CF_KV_NAMESPACE_ID, CF_API_TOKEN } = process.env;
if (!CF_ACCOUNT_ID || !CF_KV_NAMESPACE_ID || !CF_API_TOKEN) {
  console.log('CF secrets not set — skipping KV push');
  process.exit(0);
}

(async () => {
  const cache = JSON.parse(fs.readFileSync('cache.json', 'utf8'));
  const slice = {
    ap127: cache.ap127,
    cur127: cache.cur127,
    _updated: cache._updated,
  };

  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_KV_NAMESPACE_ID}/values/ap127_slice`;
  const resp = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${CF_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(slice),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`KV push failed: ${resp.status} — ${body}`);
  }

  console.log(`AP127 slice pushed to Cloudflare KV (${JSON.stringify(slice).length} bytes)`);
})();
