import fs from 'fs';

const cache = JSON.parse(fs.readFileSync('cache.json', 'utf8'));
const slice = {
  ap127: cache.ap127,
  cur127: cache.cur127,
  _updated: cache._updated,
};

const { CF_ACCOUNT_ID, CF_KV_NAMESPACE_ID, CF_API_TOKEN } = process.env;
if (!CF_ACCOUNT_ID || !CF_KV_NAMESPACE_ID || !CF_API_TOKEN) {
  console.log('CF secrets not set — skipping KV push');
  process.exit(0);
}

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
