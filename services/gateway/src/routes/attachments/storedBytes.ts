import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import path from 'path';
import type { Readable } from 'stream';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { storedFileETag } from '../../utils/etag';
import { storageKeyUnder, type ByteRange, type MediaObjectStore } from '../../services/storage/objects/MediaObjectStore';
import { processMediaObjectStores } from '../../services/storage/objects/mediaObjectStoreFactory';
import {
  isSealableStorageKey,
  isSealedStorageKey,
  openSealedStoredBytes,
  processAtRestFileAccess,
  storageKeyOfPath,
  type AtRestFileAccess,
  type AtRestFileRecord,
} from '../../services/attachments/atRest/atRestFiles';

const log = enhancedLogger.child({ module: 'storedBytes' });

/** Les octets d'un fichier stocké, où qu'ils soient : la route les décrit et les ouvre sans savoir d'où ils viennent. */
export type StoredBytes = {
  readonly size: number;
  /** Validateur FORT : celui du disque (taille, mtime, inode) ou l'ETag que le seau donne à l'objet. */
  readonly etag: string;
  readonly origin: 'disk' | 'bucket';
  readonly open: (range?: ByteRange) => Promise<Readable | null>;
};

/**
 * Où la route lit les octets. `mirror` absent ⇒ le seau du processus (#11267),
 * `null` ⇒ le disque seul. `uploadRoot` absent ⇒ `UPLOAD_PATH` relu à la requête.
 */
export type StoredBytesSource = {
  readonly uploadRoot?: string;
  readonly mirror?: MediaObjectStore | null;
  /** #13100 — l'accès aux fichiers scellés au repos ; absent ⇒ celui du processus. */
  readonly atRest?: AtRestFileAccess | null;
};

export function uploadRootOf(source: StoredBytesSource): string {
  return source.uploadRoot ?? (process.env.UPLOAD_PATH || 'uploads/attachments');
}

function mirrorOf(source: StoredBytesSource): MediaObjectStore | null {
  return source.mirror !== undefined ? source.mirror : processMediaObjectStores().mirror;
}

function strongETag(etag: string): string {
  return etag.startsWith('"') ? etag : `"${etag}"`;
}

/**
 * Le disque d'abord — c'est là que tout écrivain dépose et que tout fichier
 * déjà servi se trouve ; le seau seulement quand le disque n'a pas le fichier
 * (migration par lots, volume reconstruit). Le seau n'est jamais exposé : ses
 * octets passent par la route, sous les gardes que la route a déjà appliquées.
 */
/** Le seau n'a pas répondu : ni « absent », ni des octets (contre-audit C4). */
export type BucketUnavailable = { readonly kind: 'unavailable'; readonly reason: string };

/** Ce qu'une recherche d'octets rend : des octets, `null` (absent), ou un seau indisponible. */
export type StoredBytesLookup = StoredBytes | BucketUnavailable | null;

export function isBucketUnavailable(lookup: StoredBytesLookup): lookup is BucketUnavailable {
  return lookup !== null && 'kind' in lookup && lookup.kind === 'unavailable';
}

export async function locateStoredBytes(filePath: string, source: StoredBytesSource): Promise<StoredBytesLookup> {
  const located = (await diskBytes(filePath)) ?? (await locateBucketBytes(filePath, source));
  if (located === null || isBucketUnavailable(located)) return located;
  return openedAtRest(located, filePath, source);
}

function atRestOf(source: StoredBytesSource): AtRestFileAccess | null {
  return source.atRest !== undefined ? source.atRest : processAtRestFileAccess();
}

/**
 * #13100 — le scellement d'un fichier, ou `null` s'il ne l'est pas. Un fichier
 * à la forme scellée sans accès configuré est tenu pour scellé : il ne
 * sortira jamais tel quel.
 */
/** Seuls les médias datés et les pistes traduites se scellent (`isSealableStorageKey`, la même règle que le scellement) : un avatar n'interroge pas la base. */
const mayBeSealed = (key: string): boolean => isSealableStorageKey(key);

/**
 * #13100 — la clé à SERVIR pour une clé demandée : elle-même tant que son
 * fichier est là ; sinon celle du fichier scellé qui l'a remplacée. Une
 * adresse signée livrée avant le scellement (cache client, synchro différée)
 * reste donc lisible après l'effacement du clair, sans qu'aucun client n'ait à
 * être prévenu. La signature, elle, reste vérifiée sur la clé DEMANDÉE.
 */
export async function currentStorageKey(storageKey: string, source: StoredBytesSource): Promise<string> {
  const present = await stat(path.join(uploadRootOf(source), storageKey)).then(() => true, () => false);
  if (present) return storageKey;
  const replacement = await atRestOf(source)?.store.byReplacedKey?.(storageKey).catch(() => null);
  return replacement?.storageKey ?? storageKey;
}

export type AtRestSealing = { readonly kind: 'sealed'; readonly record: AtRestFileRecord | null } | { readonly kind: 'plain' };

export async function atRestSealingOf(filePath: string, source: StoredBytesSource): Promise<AtRestSealing> {
  const key = storageKeyOfPath(filePath, uploadRootOf(source));
  if (key === null || !mayBeSealed(key)) return { kind: 'plain' };
  const access = atRestOf(source);
  const record = access ? await access.store.find(key) : null;
  if (record) return { kind: 'sealed', record };
  // La FORME seule ne fait refuser que sans accès au magasin : avec lui,
  // l'absence de ligne dit « en clair » (un fichier rouvert par le retour arrière).
  return isSealedStorageKey(key) && !access ? { kind: 'sealed', record: null } : { kind: 'plain' };
}

/**
 * Les octets CLAIRS d'un fichier scellé, pour une route qui a déjà jugé son
 * lecteur ; un fichier ordinaire passe tel quel. Un scellement qui ne s'ouvre
 * pas (accès absent, format inconnu) rend `null` : le fichier n'est pas servi.
 */
async function openedAtRest(located: StoredBytes, filePath: string, source: StoredBytesSource): Promise<StoredBytes | null> {
  const sealing = await atRestSealingOf(filePath, source);
  if (sealing.kind === 'plain') return located;
  const access = atRestOf(source);
  if (!sealing.record || !access) {
    log.warn('sealed file without its sealing record or key access: not served');
    return null;
  }
  try {
    return { ...openSealedStoredBytes(located, sealing.record, access.keyring), origin: located.origin };
  } catch (error: unknown) {
    log.warn('sealed file in an unknown format: not served', { error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

/** Le seau seul, pour l'appelant qui a déjà cherché sur le disque et jugé que la clé peut s'y chercher. */
export async function locateBucketBytes(filePath: string, source: StoredBytesSource): Promise<StoredBytesLookup> {
  const mirror = mirrorOf(source);
  if (!mirror) return null;
  const key = storageKeyUnder(filePath, uploadRootOf(source));
  if (!key) return null;
  return bucketBytes(mirror, key);
}

export function hasBucket(source: StoredBytesSource): boolean {
  return mirrorOf(source) !== null;
}

export async function diskBytes(filePath: string): Promise<StoredBytes | null> {
  try {
    const stats = await stat(filePath);
    return {
      size: stats.size,
      etag: storedFileETag(stats),
      origin: 'disk',
      open: async (range) => (range ? createReadStream(filePath, { start: range.start, end: range.end }) : createReadStream(filePath)),
    };
  } catch (statError: unknown) {
    log.info('File not found on disk', { filePath, code: (statError as { code?: string } | null)?.code });
    return null;
  }
}

async function bucketBytes(mirror: MediaObjectStore, key: string): Promise<StoredBytesLookup> {
  try {
    const head = await mirror.head(key);
    if (!head) return null;
    return {
      size: head.size,
      etag: strongETag(head.etag),
      origin: 'bucket',
      open: (range) => mirror.read(key, range),
    };
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    log.warn('Media bucket unreachable', { key, error: reason });
    return { kind: 'unavailable', reason };
  }
}
