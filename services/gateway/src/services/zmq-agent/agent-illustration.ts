import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { enhancedLogger } from '../../utils/logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'AgentIllustration' });

/**
 * L'image qui accompagne un sujet lancé par l'agent (#6192).
 *
 * L'agent ne transporte qu'une URL d'article (la page citée par sa recherche
 * web) ; c'est ICI, côté passerelle, que l'image Open Graph est résolue puis
 * téléchargée — sous garde : hôte PUBLIC à chaque saut (l'URL vient d'un
 * modèle, donc d'internet, donc jamais de confiance), redirections bornées,
 * type image, taille bornée. Tout refus rend `null` : le message part en
 * texte, jamais bloqué.
 */

export type FetchLike = (
  url: string,
  init: { redirect: 'manual'; signal: AbortSignal; headers: Record<string, string> },
) => Promise<{
  status: number;
  headers: { get(name: string): string | null };
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
}>;

export type LookupLike = (hostname: string) => Promise<{ address: string; family?: number }>;

export type ResolvedIllustration = {
  buffer: Buffer;
  mimeType: string;
  filename: string;
  sourceUrl: string;
  imageUrl: string;
};

export type ResolveIllustrationOptions = {
  sourceUrl: string;
  fetchImpl?: FetchLike;
  lookup?: LookupLike;
  maxImageBytes?: number;
  maxHtmlBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
};

const DEFAULT_MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_HTML_BYTES = 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_REDIRECTS = 3;

const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const REQUEST_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; MeeshyBot/1.0; +https://meeshy.me)',
  Accept: 'text/html,application/xhtml+xml,image/*;q=0.9,*/*;q=0.5',
};

const HTML_ENTITIES: Record<string, string> = { '&amp;': '&', '&quot;': '"', '&#39;': "'", '&lt;': '<', '&gt;': '>' };

function decodeEntities(value: string): string {
  return value.replace(/&(amp|quot|#39|lt|gt);/g, (entity) => HTML_ENTITIES[entity] ?? entity);
}

function metaContent(html: string, keyAttribute: 'property' | 'name', key: string): string | null {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  const wanted = tags.find((tag) => new RegExp(`\\b${keyAttribute}\\s*=\\s*["']${key}["']`, 'i').test(tag));
  const content = wanted?.match(/\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
  const raw = content?.[1] ?? content?.[2];
  return raw ? decodeEntities(raw.trim()) : null;
}

export function extractOpenGraphImage(html: string, pageUrl: string): string | null {
  const candidate =
    metaContent(html, 'property', 'og:image') ??
    metaContent(html, 'property', 'og:image:url') ??
    metaContent(html, 'name', 'twitter:image') ??
    metaContent(html, 'property', 'twitter:image');
  if (!candidate) return null;
  try {
    return new URL(candidate, pageUrl).toString();
  } catch {
    return null;
  }
}

function ipv4Octets(address: string): number[] | null {
  const parts = address.split('.').map(Number);
  return parts.length === 4 && parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) ? parts : null;
}

function isPublicIpv4(address: string): boolean {
  const octets = ipv4Octets(address);
  if (!octets) return false;
  const [a, b] = octets;
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a >= 224) return false;
  return true;
}

/**
 * Adresses NON publiques : loopback, privées (RFC 1918), lien-local, CGNAT,
 * multicast, et leurs projections IPv6 (ULA fc00::/7, lien-local fe80::/10,
 * ::ffff:a.b.c.d). C'est la seule barrière entre une URL choisie par un
 * modèle et le réseau interne de la passerelle.
 */
export function isPublicAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPublicIpv4(address);
  if (version !== 6) return false;
  const lower = address.toLowerCase();
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPublicIpv4(mapped[1]);
  if (lower === '::1' || lower === '::') return false;
  const firstHextet = parseInt(lower.split(':')[0] || '0', 16);
  if ((firstHextet & 0xfe00) === 0xfc00) return false;
  if ((firstHextet & 0xffc0) === 0xfe80) return false;
  if ((firstHextet & 0xff00) === 0xff00) return false;
  return true;
}

async function publicHttpUrl(raw: string, base: string | undefined, lookup: LookupLike): Promise<URL | null> {
  let url: URL;
  try {
    url = new URL(raw, base);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return null;
  // Une adresse littérale se juge sans résolveur : ne pas laisser un lookup
  // décider de ce qu'on peut lire directement dans l'URL.
  if (isIP(host)) return isPublicAddress(host) ? url : null;
  try {
    const { address } = await lookup(host);
    return isPublicAddress(address) ? url : null;
  } catch {
    return null;
  }
}

type Fetched = { url: URL; status: number; contentType: string; contentLength: number | null; body: () => Promise<Buffer>; text: () => Promise<string> };

/**
 * GET avec redirections MANUELLES : chaque saut repasse par la garde d'hôte
 * public — un article public peut rediriger vers une adresse interne.
 */
async function fetchPublic(
  start: URL,
  deps: { fetchImpl: FetchLike; lookup: LookupLike; timeoutMs: number; maxRedirects: number },
): Promise<Fetched | null> {
  let current = start;
  for (let hop = 0; hop <= deps.maxRedirects; hop++) {
    const response = await deps.fetchImpl(current.toString(), {
      redirect: 'manual',
      signal: AbortSignal.timeout(deps.timeoutMs),
      headers: REQUEST_HEADERS,
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      const next = location ? await publicHttpUrl(location, current.toString(), deps.lookup) : null;
      if (!next) return null;
      current = next;
      continue;
    }
    const contentLengthHeader = response.headers.get('content-length');
    const contentLength = contentLengthHeader ? Number(contentLengthHeader) : null;
    return {
      url: current,
      status: response.status,
      contentType: (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase(),
      contentLength: Number.isFinite(contentLength) ? contentLength : null,
      body: async () => Buffer.from(await response.arrayBuffer()),
      text: () => response.text(),
    };
  }
  return null;
}

function filenameFor(imageUrl: URL, mimeType: string): string {
  const extension = IMAGE_EXTENSIONS[mimeType];
  const lastSegment = decodeURIComponent(imageUrl.pathname.split('/').filter(Boolean).pop() ?? '');
  const base = lastSegment
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `${base || 'article'}.${extension}`;
}

async function downloadImage(
  imageUrl: URL,
  deps: { fetchImpl: FetchLike; lookup: LookupLike; timeoutMs: number; maxRedirects: number; maxImageBytes: number },
  sourceUrl: string,
  prefetched?: Fetched,
): Promise<ResolvedIllustration | null> {
  const fetched = prefetched ?? (await fetchPublic(imageUrl, deps));
  if (!fetched || fetched.status !== 200) return null;
  const mimeType = fetched.contentType;
  if (!IMAGE_EXTENSIONS[mimeType]) return null;
  if (fetched.contentLength !== null && fetched.contentLength > deps.maxImageBytes) return null;
  const buffer = await fetched.body();
  if (buffer.length === 0 || buffer.length > deps.maxImageBytes) return null;
  return { buffer, mimeType, filename: filenameFor(fetched.url, mimeType), sourceUrl, imageUrl: fetched.url.toString() };
}

export async function resolveAgentIllustration(options: ResolveIllustrationOptions): Promise<ResolvedIllustration | null> {
  const deps = {
    fetchImpl: options.fetchImpl ?? (fetch as unknown as FetchLike),
    lookup: options.lookup ?? ((hostname: string) => dnsLookup(hostname)),
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxRedirects: options.maxRedirects ?? DEFAULT_MAX_REDIRECTS,
    maxImageBytes: options.maxImageBytes ?? DEFAULT_MAX_IMAGE_BYTES,
    maxHtmlBytes: options.maxHtmlBytes ?? DEFAULT_MAX_HTML_BYTES,
  };
  try {
    const source = await publicHttpUrl(options.sourceUrl, undefined, deps.lookup);
    if (!source) return null;

    const page = await fetchPublic(source, deps);
    if (!page || page.status !== 200) return null;

    if (IMAGE_EXTENSIONS[page.contentType]) {
      return downloadImage(page.url, deps, options.sourceUrl, page);
    }
    if (!page.contentType.includes('html')) return null;
    if (page.contentLength !== null && page.contentLength > deps.maxHtmlBytes) return null;

    const html = (await page.text()).slice(0, deps.maxHtmlBytes);
    const imageCandidate = extractOpenGraphImage(html, page.url.toString());
    if (!imageCandidate) return null;

    const imageUrl = await publicHttpUrl(imageCandidate, undefined, deps.lookup);
    if (!imageUrl) return null;

    return await downloadImage(imageUrl, deps, options.sourceUrl);
  } catch (error) {
    logger.warn('Illustration non résolue', { sourceUrl: options.sourceUrl, error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}
