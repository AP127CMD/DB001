#!/usr/bin/env node
// Pushes the AP127-only slice of cache.json to Cloudflare KV.
// Skips gracefully when CF secrets are not configured.

const fs = require('fs');

const { CF_ACCOUNT_ID, CF_KV_NAMESPACE_ID, CF_API_TOKEN } = process.env;
if (!CF_ACCOUNT_ID || !CF_KV_NAMESPACE_ID || !CF_API_TOKEN) {
  console.log('CF secrets not set — skipping KV push');
  process.exit(0);
}

const BASE = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_KV_NAMESPACE_ID}/values/ap127_slice`;
const auth = { Authorization: `Bearer ${CF_API_TOKEN}` };

// Cloudflare's KV free tier allows 1,000 writes/day ACCOUNT-WIDE (not per
// namespace). This script used to PUT unconditionally on every update-cache
// run — dispatched every 5 min, that is up to 288 writes/day, roughly 40% of
// the entire account budget, spent overwhelmingly on writes that changed
// nothing. Reads are effectively free by comparison (100,000/day), so we now
// read-then-compare and only write on a real change.
//
// `_updated` is excluded from the comparison on purpose: it is a build
// timestamp that moves on every run, so including it would make every payload
// look different and defeat the whole gate.
function payloadFingerprint(slice) {
  return JSON.stringify({ ap127: slice.ap127, cur127: slice.cur127 });
}

(async () => {
  const cache = JSON.parse(fs.readFileSync('cache.json', 'utf8'));
  const slice = {
    ap127: cache.ap127,
    cur127: cache.cur127,
    _updated: cache._updated,
  };

  // Fails OPEN: any trouble reading the current value and we just write, the
  // same as the old unconditional behaviour. Never skip a write because the
  // comparison itself broke.
  let current = null;
  try {
    const got = await fetch(BASE, { headers: auth });
    if (got.ok) {
      current = JSON.parse(await got.text());
    } else if (got.status !== 404) {
      console.log(`KV read returned ${got.status} — writing unconditionally`);
    }
  } catch (err) {
    console.log(`KV read failed (${err.message}) — writing unconditionally`);
  }

  if (current && payloadFingerprint(current) === payloadFingerprint(slice)) {
    console.log('AP127 slice unchanged — skipping KV write (saves a write against the 1,000/day account cap)');
    return;
  }

  const resp = await fetch(BASE, {
    method: 'PUT',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify(slice),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`KV push failed: ${resp.status} — ${body}`);
  }

  console.log(`AP127 slice pushed to Cloudflare KV (${JSON.stringify(slice).length} bytes)`);
})();
