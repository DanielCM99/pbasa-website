/**
 * Post-build step: generate the machine-readable surface agents rely on.
 *
 *  - dist/sitemap.xml   : XML sitemap of every indexable page, with lastmod
 *  - dist/<route>.md    : Markdown twin of every page (served via Accept
 *                         negotiation by netlify/edge-functions/markdown.ts,
 *                         and directly at the .md URL)
 *  - dist/404.md        : Markdown body for 404 responses
 *
 * No dependencies on purpose: this runs on Netlify right after `astro build`.
 */
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const SITE = 'https://pbasa.org';

/** Routes that exist but must never be advertised in the sitemap. */
const EXCLUDE_FROM_SITEMAP = new Set(['/404']);

/** Priority hints. Anything unlisted gets 0.6. */
const PRIORITY = {
  '/': '1.0',
  '/about': '0.9',
  '/academics': '0.9',
  '/athletics': '0.9',
  '/enrollment': '0.9',
  '/support-and-sponsorship': '0.8',
  '/contact': '0.8',
  '/dress-code': '0.6',
  '/code-of-conduct': '0.6',
  '/privacy': '0.4',
};

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (entry.isFile() && entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

/** dist/about/index.html -> /about ; dist/index.html -> / ; dist/404.html -> /404 */
function routeFor(file) {
  const rel = relative(DIST, file).split(sep).join('/');
  if (rel === 'index.html') return '/';
  if (rel.endsWith('/index.html')) return `/${rel.slice(0, -'/index.html'.length)}`;
  return `/${rel.slice(0, -'.html'.length)}`;
}

const decodeEntities = (value) =>
  value
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;|&rsquo;/g, "'")
    .replace(/&bull;/g, '•')
    .replace(/&copy;/g, '©')
    .replace(/&middot;/g, '·')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&');

const stripTags = (value) =>
  decodeEntities(value.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

function metaContent(html, attr, name) {
  const re = new RegExp(`<meta[^>]*${attr}=["']${name}["'][^>]*>`, 'i');
  const tag = html.match(re)?.[0];
  return tag ? decodeEntities(tag.match(/content=["']([^"']*)["']/i)?.[1] ?? '') : '';
}

/** Matches a whole `<tag ...>...</tag>` pair, non-greedy. */
const closedTag = (tag) => new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'gi');
const ANCHOR_PATTERN = `<a[\\s>][^>]*href=["']([^"']+)["'][^>]*>([\\s\\S]*?)</a>`;
const BLOCK_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'dt', 'dd', 'blockquote', 'figcaption'];

/**
 * Convert the <main> region of a built page into Markdown.
 * Deliberately conservative: headings, paragraphs, list items, definition
 * lists and links only. Standalone links (CTA buttons, email links inside
 * cards) become their own list item so agents do not lose them.
 */
function htmlToMarkdown(html) {
  let main = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1] ?? html;

  for (const tag of ['script', 'style', 'noscript', 'svg', 'template']) {
    main = main.replace(closedTag(tag), ' ');
  }
  main = main.replace(/<!--[\s\S]*?-->/g, ' ');

  const absolute = (href) => (href.startsWith('/') ? `${SITE}${href}` : href);

  /** Inline markup -> markdown text, keeping links followable. */
  const inlineToText = (inner) =>
    stripTags(
      inner
        .replace(new RegExp(ANCHOR_PATTERN, 'gi'), (_, href, label) => {
          const text = stripTags(label);
          return text ? `[${text}](${absolute(href)})` : '';
        })
        .replace(/<br[^>]*>/gi, ' ')
    );

  const tokens = [];
  const ranges = [];

  for (const tag of BLOCK_TAGS) {
    const re = closedTag(tag);
    let match;
    while ((match = re.exec(main)) !== null) {
      // Skip nested duplicates (e.g. a <p> inside an already-captured <li>).
      const nested = ranges.some(([from, to]) => match.index > from && match.index < to);
      ranges.push([match.index, match.index + match[0].length]);
      if (nested) continue;
      const text = inlineToText(match[1]);
      if (text) tokens.push({ index: match.index, tag, text });
    }
  }

  // Links that live outside any text block (CTA buttons, contact links).
  const anchorRe = new RegExp(ANCHOR_PATTERN, 'gi');
  let anchor;
  while ((anchor = anchorRe.exec(main)) !== null) {
    const inside = ranges.some(([from, to]) => anchor.index >= from && anchor.index < to);
    if (inside) continue;
    const label = stripTags(anchor[2]);
    if (!label) continue;
    tokens.push({ index: anchor.index, tag: 'a', text: `[${label}](${absolute(anchor[1])})` });
  }

  tokens.sort((a, b) => a.index - b.index);

  const blocks = [];
  for (const token of tokens) {
    if (/^h[1-6]$/.test(token.tag)) {
      blocks.push(`${'#'.repeat(Number(token.tag[1]))} ${token.text}`);
    } else if (token.tag === 'li' || token.tag === 'a') {
      blocks.push(`- ${token.text}`);
    } else if (token.tag === 'dt') {
      blocks.push(`- **${token.text}**`);
    } else if (token.tag === 'dd') {
      // Attach the definition to its term instead of orphaning it.
      const previous = blocks[blocks.length - 1];
      if (previous && previous.startsWith('- **') && previous.endsWith('**')) {
        blocks[blocks.length - 1] = `${previous}: ${token.text}`;
      } else {
        blocks.push(token.text);
      }
    } else if (token.tag === 'blockquote') {
      blocks.push(`> ${token.text}`);
    } else {
      blocks.push(token.text);
    }
  }

  return blocks
    .filter((block, i) => block !== blocks[i - 1])
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function markdownDoc({ route, title, description, body, lastmod }) {
  const canonical = route === '/' ? `${SITE}/` : `${SITE}${route}/`;
  const header = [
    `# ${title}`,
    '',
    description ? `> ${description}` : null,
    '',
    `Canonical URL: ${canonical}`,
    `Last updated: ${lastmod}`,
    `Site map: ${SITE}/sitemap.xml | Agent guide: ${SITE}/llms.txt`,
    '',
    '---',
    '',
    '',
  ]
    .filter((line) => line !== null)
    .join('\n');
  return `${header}${body}\n`;
}

function mdPathFor(route) {
  return route === '/' ? join(DIST, 'index.md') : join(DIST, `${route.slice(1)}.md`);
}

async function main() {
  const files = await walk(DIST);
  const pages = [];

  for (const file of files) {
    const route = routeFor(file);
    const html = await readFile(file, 'utf8');
    const { mtime } = await stat(file);
    const lastmod = mtime.toISOString().slice(0, 10);

    const rawTitle = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? route;
    const title = decodeEntities(rawTitle).trim();
    const description = metaContent(html, 'name', 'description');
    const body = htmlToMarkdown(html);

    await writeFile(mdPathFor(route), markdownDoc({ route, title, description, body, lastmod }), 'utf8');
    pages.push({ route, lastmod });
  }

  const indexable = pages
    .filter((page) => !EXCLUDE_FROM_SITEMAP.has(page.route))
    .sort(
      (a, b) =>
        (PRIORITY[b.route] ?? '0.6').localeCompare(PRIORITY[a.route] ?? '0.6') ||
        a.route.localeCompare(b.route)
    );

  const urls = indexable
    .map(({ route, lastmod }) => {
      const loc = route === '/' ? `${SITE}/` : `${SITE}${route}/`;
      return [
        '  <url>',
        `    <loc>${loc}</loc>`,
        `    <lastmod>${lastmod}</lastmod>`,
        `    <changefreq>${route === '/' ? 'weekly' : 'monthly'}</changefreq>`,
        `    <priority>${PRIORITY[route] ?? '0.6'}</priority>`,
        '  </url>',
      ].join('\n');
    })
    .join('\n');

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  await writeFile(join(DIST, 'sitemap.xml'), sitemap, 'utf8');

  console.log(`postbuild: ${pages.length} markdown pages, ${indexable.length} sitemap URLs`);
}

await main();
