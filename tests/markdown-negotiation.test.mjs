/**
 * Unit tests for the Accept-negotiation logic in
 * netlify/edge-functions/markdown.ts. The helpers are mirrored here because the
 * edge function targets Deno; keep the two in sync when editing either.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const SOURCE = fileURLToPath(new URL('../netlify/edge-functions/markdown.ts', import.meta.url));

function parseAccept(header) {
  return header
    .split(',')
    .map((part) => {
      const [rawType, ...params] = part.trim().split(';');
      const qParam = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      const q = qParam ? Number.parseFloat(qParam.slice(2)) : 1;
      return { type: rawType.trim().toLowerCase(), q: Number.isFinite(q) ? q : 1 };
    })
    .filter((entry) => entry.type.length > 0 && entry.q > 0);
}

function prefersMarkdown(header) {
  if (!header) return false;
  const entries = parseAccept(header);
  const markdown = entries
    .filter((e) => e.type === 'text/markdown' || e.type === 'text/x-markdown')
    .reduce((max, e) => Math.max(max, e.q), 0);
  if (markdown === 0) return false;
  const html = entries
    .filter((e) => e.type === 'text/html' || e.type === 'application/xhtml+xml')
    .reduce((max, e) => Math.max(max, e.q), 0);
  return markdown >= html;
}

function isAssetPath(pathname) {
  const last = pathname.split('/').pop() ?? '';
  return /\.[a-z0-9]+$/i.test(last);
}

function markdownPathFor(pathname) {
  const clean = pathname.replace(/\/+$/, '');
  return clean === '' ? '/index.md' : `${clean}.md`;
}

describe('prefersMarkdown', () => {
  const wantsMarkdown = [
    'text/markdown',
    'text/markdown, text/html;q=0.5',
    'text/html;q=0.8, text/markdown;q=0.9',
    'text/markdown;q=1.0, */*;q=0.1',
    'TEXT/MARKDOWN',
    'text/x-markdown',
  ];
  const wantsHtml = [
    null,
    '',
    'text/html',
    'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'text/markdown;q=0, text/html',
    'text/markdown;q=0.5, text/html;q=0.9',
    'application/json',
  ];

  for (const header of wantsMarkdown) {
    test(`serves markdown for ${JSON.stringify(header)}`, () => {
      assert.equal(prefersMarkdown(header), true);
    });
  }
  for (const header of wantsHtml) {
    test(`serves html for ${JSON.stringify(header)}`, () => {
      assert.equal(prefersMarkdown(header), false);
    });
  }
});

describe('path handling', () => {
  test('assets are never negotiated', () => {
    for (const path of ['/images/logo.png', '/_astro/app.css', '/about.md', '/sitemap.xml', '/llms.txt']) {
      assert.equal(isAssetPath(path), true, path);
    }
    for (const path of ['/', '/about', '/support-and-sponsorship', '/about/']) {
      assert.equal(isAssetPath(path), false, path);
    }
  });

  test('markdown path mapping', () => {
    assert.equal(markdownPathFor('/'), '/index.md');
    assert.equal(markdownPathFor('/about'), '/about.md');
    assert.equal(markdownPathFor('/about/'), '/about.md');
    assert.equal(markdownPathFor('/code-of-conduct'), '/code-of-conduct.md');
  });
});

describe('edge function contract', () => {
  test('always sets Vary: Accept, Accept-Encoding and a markdown content type', async () => {
    const source = await readFile(SOURCE, 'utf8');
    assert.ok(source.includes("const VARY = 'Accept, Accept-Encoding'"));
    assert.ok(source.includes("'text/markdown; charset=utf-8'"));
    assert.ok(source.includes('markdownResponse(NOT_FOUND_MARKDOWN(url), 404'), '404s must stay 404');
    assert.ok(source.includes('/llms.txt'), '404 markdown must point at llms.txt');
    assert.ok(source.includes('/sitemap.xml'), '404 markdown must point at the sitemap');
  });
});
