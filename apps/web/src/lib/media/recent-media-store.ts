import { SW_RECENT_MEDIA_CACHE } from '../sw-caches';
import {
  RECENT_MEDIA_STORED_AT_HEADER,
  recentMediaAdmission,
  recentMediaEvictions,
  recentMediaResponseAdmission,
  type RecentMediaConnection,
  type RecentMediaEntry,
  type RecentMediaProtection,
  type RecentMediaRefusal,
} from './recent-media-policy';

/**
 * LA GARDE DU SEAU « RÉCENTS » (#11326) — la page télécharge, une fois, le
 * fichier ENTIER d'un média qu'on vient de voir, et le range daté ; le worker
 * (`public/sw-recent-media.js`) le resert ensuite par plages, hors ligne
 * compris. Le worker n'écrit jamais : tout ce qui entre passe par cette loi.
 *
 * Best-effort et silencieuse : une garde perdue ne coûte qu'une lecture
 * réseau plus tard, jamais une erreur à l'écran.
 */
type RecentMediaCache = {
  match(url: string): Promise<Response | undefined>;
  put(url: string, response: Response): Promise<void>;
  delete(url: string): Promise<boolean>;
  keys(): Promise<readonly Request[]>;
};

export type RecentMediaDeps = {
  readonly caches: { open(name: string): Promise<RecentMediaCache> } | undefined;
  readonly fetch: (url: string, init?: RequestInit) => Promise<Response>;
  readonly now: () => number;
  readonly connection: () => RecentMediaConnection;
};

export type RecentMediaOutcome = 'stored' | 'already' | 'refused' | 'failed' | 'unavailable' | RecentMediaRefusal;

const lengthOf = (response: Response): number | null => {
  const raw = response.headers.get('Content-Length');
  const value = raw === null ? Number.NaN : Number(raw);
  return Number.isFinite(value) ? value : null;
};

async function entriesOf(cache: RecentMediaCache): Promise<readonly RecentMediaEntry[]> {
  const requests = await cache.keys();
  return Promise.all(
    requests.map(async (request) => {
      const response = await cache.match(request.url);
      return {
        url: request.url,
        storedAt: Number(response?.headers.get(RECENT_MEDIA_STORED_AT_HEADER) ?? Number.NaN),
        bytes: response === undefined ? 0 : (lengthOf(response) ?? 0),
      };
    }),
  );
}

function stamped(response: Response, now: number): Response {
  const headers = new Headers(response.headers);
  headers.set(RECENT_MEDIA_STORED_AT_HEADER, String(now));
  return new Response(response.body, { status: 200, statusText: response.statusText, headers });
}

const inFlight = new Set<string>();

export async function rememberRecentMedia(
  media: { readonly src: string; readonly protection: RecentMediaProtection },
  deps: RecentMediaDeps = browserDeps(),
): Promise<RecentMediaOutcome> {
  const admission = recentMediaAdmission({ ...media, connection: deps.connection() });
  if (!admission.admit) return admission.reason;
  if (deps.caches === undefined) return 'unavailable';
  if (inFlight.has(media.src)) return 'already';
  inFlight.add(media.src);
  try {
    const cache = await deps.caches.open(SW_RECENT_MEDIA_CACHE);
    if ((await cache.match(media.src)) !== undefined) return 'already';
    const response = await deps.fetch(media.src, { mode: 'cors', credentials: 'omit' });
    const contentLength = lengthOf(response);
    if (!recentMediaResponseAdmission({ status: response.status, cacheControl: response.headers.get('Cache-Control') ?? '', contentLength })) {
      await response.body?.cancel();
      return 'refused';
    }
    const evicted = recentMediaEvictions({ entries: await entriesOf(cache), now: deps.now(), incomingBytes: contentLength ?? 0 });
    await Promise.all(evicted.map((url) => cache.delete(url)));
    await cache.put(media.src, stamped(response, deps.now()));
    return 'stored';
  } catch {
    return 'failed';
  } finally {
    inFlight.delete(media.src);
  }
}

function browserDeps(): RecentMediaDeps {
  const nav = typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { readonly connection?: RecentMediaConnection });
  const storage = (globalThis as { readonly caches?: CacheStorage }).caches;
  return {
    caches: storage === undefined ? undefined : { open: async (name) => adapt(await storage.open(name)) },
    fetch: (url, init) => fetch(url, init),
    now: () => Date.now(),
    connection: () => nav?.connection,
  };
}

const adapt = (cache: Cache): RecentMediaCache => ({
  match: (url) => cache.match(url),
  put: (url, response) => cache.put(url, response),
  delete: (url) => cache.delete(url),
  keys: () => cache.keys(),
});
