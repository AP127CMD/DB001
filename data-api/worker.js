// ap127-data-api — read-only progress JSON API backing DB_Share, CMDV2, and CMDV3.
// Serves the `ap127_slice` KV blob (written by DB001's update-cache.js) as CORS-locked JSON.
//
// 2026-07-27: was hardcoded to a single ALLOWED_ORIGIN (DB_Share only), so CMDV2's and CMDV3's
// own live-fetch of this same worker always failed with a browser CORS error — confirmed via
// curl with different Origin headers, all three consumers exist and are documented (README §3.2,
// CMDV2 CLAUDE.md, CMDV3 CLAUDE.md) but only one could ever succeed. Switched to the same
// reflect-if-allowlisted pattern already used by ap127-watchdog (watchdog/src/index.js) so an
// Access-Control-Allow-Origin header — which can only ever carry one value — can still be correct
// for whichever of the three actually made the request.
const ALLOWED_ORIGINS = new Set([
  'https://ap127-dashboardr1.pages.dev',
  'https://ap127-ngt2.pages.dev',
  'https://ap127-v3.pages.dev',
]);
const DEFAULT_ORIGIN = 'https://ap127-dashboardr1.pages.dev';

function corsOrigin(request) {
  const origin = request.headers.get('Origin');
  return ALLOWED_ORIGINS.has(origin) ? origin : DEFAULT_ORIGIN;
}

export default {
  async fetch(request, env) {
    const allowedOrigin = corsOrigin(request);
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin',
      }});
    }
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
    const data = await env.KV.get('ap127_slice', 'json');
    if (!data) return new Response(JSON.stringify({ error: 'No data' }), {
      status: 503, headers: { 'Content-Type': 'application/json' }});
    return new Response(JSON.stringify(data), { headers: {
      'Content-Type': 'application/json', 'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': allowedOrigin, 'Vary': 'Origin',
    }});
  },
};
