import { packAssetUrl } from './pack-asset-url';
import type { PackAssetRef } from '@meeshy/shared/types/content-pack';

/**
 * LE SEAU, JUMEAU de `SW_PACK_ASSETS_CACHE` (`lib/sw-caches.ts`, qui le
 * déclare aux côtés des autres) : l'importer d'ici détacherait `sw-caches` du
 * chunk de la première peinture en un fichier de plus à télécharger avant le
 * premier pixel (mesuré : +0,15 Ko et une requête). Le témoin
 * `pack-asset-store.test.ts` garde les deux littéraux égaux.
 */
export const PACK_ASSETS_CACHE = 'meeshy-pack-assets';

/**
 * **LE MAGASIN DES FICHIERS DE PACKS** (#10149, LP1) — vignettes, contrats et
 * chaînes servis par `packAssets.byFile` (`<sha16>.<ext>`) (L5). Public et
 * immuable : la requête part en CORS, sans crédential, et ses octets ne se
 * montrent qu'après que leur SHA-256 a été comparé à celui du `PackAssetRef`
 * qui les annonce — un fichier altéré en route ou par un cache intermédiaire
 * ne s'affiche jamais. Vérifiés, ils sont rangés dans le seau dédié
 * (`PACK_ASSETS_CACHE`, hors des purges de compte) et relus de là sans réseau.
 *
 * Chargé à la demande seulement (budget `packs_store`, `dynamic_only`) : rien
 * de ce module n'entre dans un écran qui ne montre pas de cadres.
 */

export type PackAssetStoreDeps = {
  /** L'origine de la passerelle — celle de la base d'API résolue. */
  readonly origin: string;
  readonly fetcher?: typeof fetch;
  /** `null` : aucun Cache Storage (contexte non sécurisé, navigateur qui le refuse). */
  readonly cacheStorage?: CacheStorage | null;
};

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  webp: 'image/webp',
  png: 'image/png',
  json: 'application/json; charset=utf-8',
  woff2: 'font/woff2',
};

const contentTypeOf = (src: string): string => CONTENT_TYPES[src.slice(src.lastIndexOf('.') + 1)] ?? 'application/octet-stream';

export { packAssetUrl };

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

const matches = async (bytes: ArrayBuffer, ref: PackAssetRef): Promise<boolean> => bytes.byteLength === ref.bytes && (await sha256Hex(bytes)) === ref.sha256;

const defaultCacheStorage = (): CacheStorage | null => (typeof caches === 'object' && caches !== null ? caches : null);

const openBucket = async (storage: CacheStorage | null): Promise<Cache | null> => {
  if (storage === null) return null;
  try {
    return await storage.open(PACK_ASSETS_CACHE);
  } catch {
    return null;
  }
};

const fromBucket = async (bucket: Cache | null, url: string, ref: PackAssetRef): Promise<ArrayBuffer | null> => {
  const cached = await bucket?.match(url).catch(() => undefined);
  if (cached === undefined) return null;
  const bytes = await cached.arrayBuffer();
  if (await matches(bytes, ref)) return bytes;
  await bucket?.delete(url).catch(() => false);
  return null;
};

const fromNetwork = async (fetcher: typeof fetch, url: string, ref: PackAssetRef): Promise<ArrayBuffer | null> => {
  try {
    const response = await fetcher(url, { mode: 'cors', credentials: 'omit' });
    if (!response.ok) return null;
    const bytes = await response.arrayBuffer();
    return (await matches(bytes, ref)) ? bytes : null;
  } catch {
    return null;
  }
};

/** Les octets vérifiés d'un fichier de pack, du seau d'abord, du réseau sinon ; `null` s'ils ne se vérifient pas. */
const urlOf = (src: string, origin: string): string | null => {
  try {
    return packAssetUrl(src, origin);
  } catch {
    return null;
  }
};

export async function readPackAssetBytes(ref: PackAssetRef, deps: PackAssetStoreDeps): Promise<ArrayBuffer | null> {
  const url = urlOf(ref.src, deps.origin);
  if (url === null) return null;
  const bucket = await openBucket(deps.cacheStorage === undefined ? defaultCacheStorage() : deps.cacheStorage);
  const cached = await fromBucket(bucket, url, ref);
  if (cached !== null) return cached;
  const fetched = await fromNetwork(deps.fetcher ?? fetch, url, ref);
  if (fetched !== null) {
    await bucket?.put(url, new Response(fetched.slice(0), { headers: { 'Content-Type': contentTypeOf(ref.src) } })).catch(() => undefined);
  }
  return fetched;
}

export async function readPackAssetBlob(ref: PackAssetRef, deps: PackAssetStoreDeps): Promise<Blob | null> {
  const bytes = await readPackAssetBytes(ref, deps);
  return bytes === null ? null : new Blob([bytes], { type: contentTypeOf(ref.src).split(';')[0] ?? '' });
}

export async function readPackAssetJson(ref: PackAssetRef, deps: PackAssetStoreDeps): Promise<unknown> {
  const bytes = await readPackAssetBytes(ref, deps);
  if (bytes === null) return null;
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    return null;
  }
}
