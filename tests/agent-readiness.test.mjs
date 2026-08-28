/**
 * Build-output tests for the agent-readiness surface.
 * Run `npm run build` first, then `npm test`.
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const SITE = 'https://pbasa.org';

const ROUTES = [
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

const htmlPath = (route) =>
  route === '/' ? join(DIST, 'index.html') : join(DIST, route.slice(1), 'index.html');
const mdPath = (route) => (route === '/' ? join(DIST, 'index.md') : join(DIST, `${route.slice(1)}.md`));
const read = (path) => readFile(path, 'utf8');
const exists = async (path) => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

before(async () => {
  assert.ok(await exists(join(DIST, 'index.html')), 'dist/ is missing - run `npm run build` first');
});

describe('metadata completeness', () => {
  for (const route of ROUTES) {
    test(`${route} has lang, canonical, og:type and og:image`, async () => {
      const html = await read(htmlPath(route));
      const canonical = route === '/' ? `${SITE}/` : `${SITE}${route}/`;

      assert.match(html, /<html lang="en">/);
      assert.ok(
        html.includes(`<link rel="canonical" href="${canonical}">`),
        `canonical should be ${canonical}`
      );
      assert.match(html, /<meta property="og:type" content="website">/);
      assert.match(html, /<meta property="og:image" content="https:\/\/pbasa\.org\/images\//);
      assert.match(html, /<meta property="og:title"/);
      assert.match(html, /<meta property="og:description"/);
      assert.match(html, /<meta property="og:url"/);
      assert.match(html, /<meta name="description"/);
    });
  }
});

describe('JSON-LD structured data', () => {
  test('homepage exposes Organization with contactPoint and address', async () => {
    const html = await read(join(DIST, 'index.html'));
    const raw = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
    assert.ok(raw, 'no JSON-LD block on homepage');

    const data = JSON.parse(raw);
    assert.equal(data['@context'], 'https://schema.org');

    const org = data['@graph'].find((node) => [].concat(node['@type']).includes('Organization'));
    assert.ok(org, 'no Organization node in @graph');
    assert.equal(org.name, 'Palm Beach Academy of Sports and Arts');
    assert.equal(org.url, `${SITE}/`);
    assert.ok(org.description.length > 50);

    assert.ok(Array.isArray(org.contactPoint) && org.contactPoint.length > 0, 'contactPoint missing');
    for (const point of org.contactPoint) {
      assert.equal(point['@type'], 'ContactPoint');
      assert.ok(point.contactType, 'contactType missing');
      assert.match(point.email, /@pbasa\.org$/);
    }

    assert.equal(org.address['@type'], 'PostalAddress');
    assert.equal(org.address.addressLocality, 'West Palm Beach');
    assert.equal(org.address.addressRegion, 'FL');
    assert.equal(org.address.addressCountry, 'US');

    const website = data['@graph'].find((node) => node['@type'] === 'WebSite');
    assert.ok(website, 'no WebSite node');
  });

  test('every page carries valid JSON-LD with the right WebPage url', async () => {
    for (const route of ROUTES) {
      const html = await read(htmlPath(route));
      const raw = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
      assert.ok(raw, `no JSON-LD on ${route}`);
      const data = JSON.parse(raw);
      const page = data['@graph'].find((node) => node['@type'] === 'WebPage');
      const canonical = route === '/' ? `${SITE}/` : `${SITE}${route}/`;
      assert.equal(page.url, canonical);
    }
  });
});

describe('sitemap', () => {
  test('sitemap.xml lists every indexable route with lastmod', async () => {
    const xml = await read(join(DIST, 'sitemap.xml'));
    assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);

    for (const route of ROUTES) {
      const loc = route === '/' ? `${SITE}/` : `${SITE}${route}/`;
      assert.ok(xml.includes(`<loc>${loc}</loc>`), `sitemap missing ${loc}`);
    }
    const locCount = (xml.match(/<loc>/g) ?? []).length;
    assert.equal(locCount, ROUTES.length, 'unexpected number of sitemap URLs');
    assert.equal((xml.match(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/g) ?? []).length, ROUTES.length);
    assert.ok(!xml.includes('/404'), '404 must not be in the sitemap');
  });
});

describe('markdown twins', () => {
  for (const route of [...ROUTES, '/404']) {
    test(`${route} has a markdown version`, async () => {
      const md = await read(mdPath(route));
      assert.match(md, /^# /, 'markdown must start with an H1');
      assert.ok(md.includes('Canonical URL:'), 'markdown must state its canonical URL');
      assert.ok(md.includes(`${SITE}/sitemap.xml`), 'markdown must link the sitemap');
      assert.ok(md.length > 300, `markdown for ${route} is suspiciously short`);
      assert.ok(!md.includes('<div'), 'markdown must not contain raw HTML blocks');
    });
  }

  test('markdown keeps links as markdown links', async () => {
    const md = await read(mdPath('/contact'));
    assert.match(md, /\[[^\]]+\]\((mailto:|https:\/\/)[^)]+\)/);
    assert.ok(md.includes('contact@pbasa.org'));
  });
});

describe('404 page', () => {
  test('404.html is noindex and points agents at the machine-readable files', async () => {
    const html = await read(join(DIST, '404.html'));
    assert.match(html, /<meta name="robots" content="noindex, follow">/);
    assert.ok(html.includes('/sitemap.xml'), '404 should link the sitemap');
    assert.ok(html.includes('/llms.txt'), '404 should link llms.txt');
    assert.ok(html.includes('href="/contact"'), '404 should link key pages');
    assert.ok(html.includes('404'), '404 should state the status');
  });
});

describe('llms.txt', () => {
  test('exists with a when-to-use section and page index', async () => {
    const txt = await read(join(DIST, 'llms.txt'));
    assert.match(txt, /^# Palm Beach Academy of Sports and Arts/);
    assert.match(txt, /\n> /, 'llms.txt needs a blockquote summary');
    assert.match(txt, /## When to use this site/);
    assert.match(txt, /## How to call this site/);
    assert.match(txt, /Accept: text\/markdown/);
    assert.ok(txt.includes(`${SITE}/sitemap.xml`));
    for (const route of ROUTES) {
      const url = route === '/' ? `${SITE}/` : `${SITE}${route}/`;
      assert.ok(txt.includes(url), `llms.txt missing ${url}`);
    }
  });
});

describe('robots.txt', () => {
  test('allows crawling and declares the sitemap', async () => {
    const txt = await read(join(DIST, 'robots.txt'));
    assert.match(txt, /User-agent: \*/);
    assert.match(txt, /Allow: \//);
    assert.ok(txt.includes(`Sitemap: ${SITE}/sitemap.xml`));
  });
});

describe('trust anchor pages', () => {
  for (const route of ['/about', '/contact', '/privacy']) {
    test(`${route} has at least 500 characters of content`, async () => {
      const html = await read(htmlPath(route));
      const main = html.match(/<main[^>]*>([\s\S]*?)<\/main>/)?.[1] ?? '';
      const text = main
        .replace(/<(script|style|svg)[\s\S]*?<\/\1>/g, ' ')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      assert.ok(text.length >= 500, `${route} has only ${text.length} chars of text`);
    });
  }

  test('contact and privacy are reachable from every page footer', async () => {
    for (const route of ROUTES) {
      const html = await read(htmlPath(route));
      assert.ok(html.includes('href="/contact"'), `${route} does not link /contact`);
      assert.ok(html.includes('href="/privacy"'), `${route} does not link /privacy`);
    }
  });
});
