import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import type { Readable } from 'stream';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { storedFileETag } from '../../utils/etag';
import { storageKeyUnder, type ByteRange, type MediaObjectStore } from '../../services/storage/objects/MediaObjectStore';
import { processMediaObjectStores } from '../../services/storage/objects/mediaObjectStoreFactory';

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
export async function locateStoredBytes(filePath: string, source: StoredBytesSource): Promise<StoredBytes | null> {
  return (await diskBytes(filePath)) ?? locateBucketBytes(filePath, source);
}

/** Le seau seul, pour l'appelant qui a déjà cherché sur le disque et jugé que la clé peut s'y chercher. */
export async function locateBucketBytes(filePath: string, source: StoredBytesSource): Promise<StoredBytes | null> {
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

async function bucketBytes(mirror: MediaObjectStore, key: string): Promise<StoredBytes | null> {
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
    log.warn('Media bucket unreachable, file served as missing', { key, error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}
