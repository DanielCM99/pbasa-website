/**
 * Verify the deployed site's agent-readiness surface.
 *
 *   node scripts/verify-live.mjs [baseUrl]
 *
 * Defaults to https://pbasa.org. Exits non-zero if any check fails.
 */
const BASE = (process.argv[2] ?? 'https://pbasa.org').replace(/\/$/, '');

const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
};

const get = (path, headers = {}) => fetch(`${BASE}${path}`, { headers, redirect: 'follow' });

const PAGES = [
  '/',
  '/about',
  '/academics',
  '/athletics',
  '/enrollment',
  '/contact',
  '/support-and-sponsorship',
  '/dress-code',
  '/code-of-conduct',
  '/privacy',
];

// 1. Every page returns 200 with the four metadata signals.
for (const path of PAGES) {
  const res = await get(path);
  const html = await res.text();
  const canonical = path === '/' ? `${BASE}/` : `${BASE}${path}/`;
  const missing = [
    res.status === 200 ? null : `status ${res.status}`,
    html.includes('<html lang="en">') ? null : 'html lang',
    html.includes(`<link rel="canonical" href="${canonical}">`) ? null : 'canonical',
    /<meta property="og:image"/.test(html) ? null : 'og:image',
    /<meta property="og:type"/.test(html) ? null : 'og:type',
  ].filter(Boolean);
  record(`GET ${path} (metadata)`, missing.length === 0, missing.join(', '));
}

// 2. Real 404 with a recovery body.
{
  const res = await get('/some-path-that-does-not-exist');
  const body = await res.text();
  record(
    'GET /some-path-that-does-not-exist returns 404',
    res.status === 404,
    `status ${res.status}`
  );
  record(
    '404 body points at sitemap and llms.txt',
    body.includes('/sitemap.xml') && body.includes('/llms.txt'),
    ''
  );
}

// 3. Markdown negotiation + Vary.
for (const path of ['/', '/about', '/contact']) {
  const res = await get(path, { Accept: 'text/markdown' });
  const type = res.headers.get('content-type') ?? '';
  const vary = (res.headers.get('vary') ?? '').toLowerCase();
  const body = await res.text();
  const problems = [
    type.includes('text/markdown') ? null : `content-type ${type}`,
    vary.includes('accept') && !/^accept-encoding$/.test(vary) ? null : `vary ${vary || '(missing)'}`,
    body.trimStart().startsWith('#') ? null : 'body is not markdown',
  ].filter(Boolean);
  record(`Accept: text/markdown on ${path}`, problems.length === 0, problems.join(', '));
}

// 4. Markdown 404 keeps the 404 status.
{
  const res = await get('/nope-not-here', { Accept: 'text/markdown' });
  const body = await res.text();
  record(
    'Accept: text/markdown on missing path returns 404 markdown',
    res.status === 404 && (res.headers.get('content-type') ?? '').includes('text/markdown') && body.includes('/sitemap.xml'),
    `status ${res.status}, type ${res.headers.get('content-type')}`
  );
}

// 5. HTML requests still get HTML, with Accept in Vary.
{
  const res = await get('/', { Accept: 'text/html,application/xhtml+xml' });
  const type = res.headers.get('content-type') ?? '';
  const vary = (res.headers.get('vary') ?? '').toLowerCase();
  record(
    'HTML request still gets HTML with Vary: Accept',
    type.includes('text/html') && vary.includes('accept,'),
    `type ${type}, vary ${vary}`
  );
}

// 6. Direct .md URLs.
{
  const res = await get('/about.md');
  const type = res.headers.get('content-type') ?? '';
  record('GET /about.md', res.status === 200 && type.includes('text/markdown'), `status ${res.status}, type ${type}`);
}

// 7. sitemap.xml
{
  const res = await get('/sitemap.xml');
  const xml = await res.text();
  const locs = (xml.match(/<loc>/g) ?? []).length;
  record(
    'GET /sitemap.xml',
    res.status === 200 && locs === PAGES.length && xml.includes('<lastmod>'),
    `status ${res.status}, ${locs} urls`
  );
}

// 8. llms.txt with when-to-use guidance.
{
  const res = await get('/llms.txt');
  const txt = await res.text();
  record(
    'GET /llms.txt with when-to-use section',
    res.status === 200 && /## When to use this site/.test(txt) && /## How to call this site/.test(txt),
    `status ${res.status}`
  );
}

// 9. robots.txt
{
  const res = await get('/robots.txt');
  const txt = await res.text();
  record('GET /robots.txt declares sitemap', res.status === 200 && txt.includes('/sitemap.xml'), `status ${res.status}`);
}

// 10. Homepage JSON-LD completeness.
{
  const res = await get('/');
  const html = await res.text();
  const raw = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
  let ok = false;
  let detail = 'no JSON-LD found';
  if (raw) {
    try {
      const graph = JSON.parse(raw)['@graph'] ?? [];
      const org = graph.find((node) => [].concat(node['@type']).includes('Organization'));
      ok = Boolean(org?.contactPoint?.length && org?.address?.addressLocality);
      detail = ok ? '' : 'Organization missing contactPoint or address';
    } catch (error) {
      detail = `invalid JSON-LD: ${error.message}`;
    }
  }
  record('Homepage JSON-LD Organization (contactPoint + address)', ok, detail);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed against ${BASE}`);
if (failed.length > 0) process.exit(1);
