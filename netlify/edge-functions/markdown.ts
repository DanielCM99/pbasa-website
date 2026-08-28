/**
 * Markdown content negotiation (https://acceptmarkdown.com).
 *
 * - `Accept: text/markdown` on any page URL returns the page's Markdown twin
 *   (generated at build time by scripts/postbuild.mjs) as text/markdown.
 * - Every negotiated response carries `Vary: Accept, Accept-Encoding` so CDNs
 *   cannot serve an HTML variant to an agent that asked for Markdown.
 * - Nonexistent paths keep their real HTTP 404 status and get a short Markdown
 *   body pointing at the sitemap and llms.txt.
 *
 * Humans and normal crawlers are unaffected: without a Markdown preference the
 * original HTML response is returned untouched apart from the Vary header.
 */
import type { Context } from 'https://edge.netlify.com';

const VARY = 'Accept, Accept-Encoding';
const MARKDOWN_TYPE = 'text/markdown; charset=utf-8';

/** Parse an Accept header into [type, q] pairs. */
function parseAccept(header: string): Array<{ type: string; q: number }> {
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

/** True when the client asks for Markdown at least as strongly as HTML. */
function prefersMarkdown(header: string | null): boolean {
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

/** Requests for a concrete file (images, css, .md, ...) are never negotiated. */
function isAssetPath(pathname: string): boolean {
  const last = pathname.split('/').pop() ?? '';
  return /\.[a-z0-9]+$/i.test(last);
}

function markdownPathFor(pathname: string): string {
  const clean = pathname.replace(/\/+$/, '');
  return clean === '' ? '/index.md' : `${clean}.md`;
}

function withVary(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Vary', VARY);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function markdownResponse(body: string, status: number, canonical: string): Response {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': MARKDOWN_TYPE,
      Vary: VARY,
      Link: `<${canonical}>; rel="canonical"`,
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

const NOT_FOUND_MARKDOWN = (url: URL) => `# 404 - Page Not Found

No page exists at \`${url.pathname}\` on https://pbasa.org.

Palm Beach Academy of Sports and Arts (PBASA) is a tuition-free K-8 public
charter school in West Palm Beach, Florida.

## Where to look next

- Site map: https://pbasa.org/sitemap.xml
- Agent guide (when to use this site): https://pbasa.org/llms.txt
- Home: https://pbasa.org/
- About Us: https://pbasa.org/about/
- Academics: https://pbasa.org/academics/
- Athletics: https://pbasa.org/athletics/
- Enrollment: https://pbasa.org/enrollment/
- Contact: https://pbasa.org/contact/
- Support and Sponsorship: https://pbasa.org/support-and-sponsorship/
- Privacy Policy: https://pbasa.org/privacy/

Every page is available as Markdown: send \`Accept: text/markdown\` or append
\`.md\` to the path.
`;

export default async function handler(request: Request, context: Context): Promise<Response> {
  // Never let this function take the site down: any unexpected failure falls
  // back to the plain static response.
  try {
    const url = new URL(request.url);

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return context.next();
    }

    if (isAssetPath(url.pathname) || !prefersMarkdown(request.headers.get('accept'))) {
      return withVary(await context.next());
    }

    const canonical = `${url.origin}${url.pathname}`;
    const mdUrl = new URL(markdownPathFor(url.pathname), url.origin);
    const mdResponse = await fetch(mdUrl.toString(), {
      headers: { Accept: 'text/plain' },
      redirect: 'follow',
    });

    if (mdResponse.ok) {
      const body = await mdResponse.text();
      // Unknown paths fall through to the static 404 page; guard against an
      // HTML body sneaking into a text/markdown response.
      if (!/^\s*</.test(body)) {
        return markdownResponse(body, 200, canonical);
      }
    }

    return markdownResponse(NOT_FOUND_MARKDOWN(url), 404, canonical);
  } catch (error) {
    console.error('markdown negotiation failed:', error);
    return context.next();
  }
}
