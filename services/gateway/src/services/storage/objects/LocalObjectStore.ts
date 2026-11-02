import { createReadStream } from 'node:fs';
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import type { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { assertSafeStorageKey, isSafeStorageKey, type ByteRange, type MediaObjectStore, type ObjectBody, type StoredObjectHead } from './MediaObjectStore';
import { storedFileETag } from '../../../utils/etag';

/**
 * Le volume des dépôts (`UPLOAD_PATH`) vu comme un stockage d'objets (#11267).
 * L'écriture passe par un fichier temporaire caché puis un renommage : un
 * lecteur ne voit jamais un fichier à moitié écrit. Le validateur reprend la
 * forme de la route de fichiers (taille, date, inode).
 */
export class LocalObjectStore implements MediaObjectStore {
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  /** Le chemin absolu d'une clé, seulement s'il reste sous la racine. */
  pathOf(key: string): string | null {
    if (!isSafeStorageKey(key)) return null;
    const resolved = path.resolve(this.root, key);
    return resolved.startsWith(this.root + path.sep) ? resolved : null;
  }

  async head(key: string): Promise<StoredObjectHead | null> {
    const filePath = this.pathOf(key);
    if (filePath === null) return null;
    try {
      const stats = await stat(filePath);
      if (!stats.isFile()) return null;
      return { size: stats.size, etag: storedFileETag(stats), lastModified: stats.mtime, contentType: null };
    } catch {
      return null;
    }
  }

  async read(key: string, range?: ByteRange): Promise<Readable | null> {
    const filePath = this.pathOf(key);
    if (filePath === null || (await this.head(key)) === null) return null;
    return range === undefined ? createReadStream(filePath) : createReadStream(filePath, { start: range.start, end: range.end });
  }

  async write(key: string, object: ObjectBody): Promise<void> {
    assertSafeStorageKey(key);
    const filePath = this.pathOf(key);
    if (filePath === null) throw new Error('unsafe storage key');
    await mkdir(path.dirname(filePath), { recursive: true });
    const temporary = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${randomUUID()}.tmp`);
    try {
      if (Buffer.isBuffer(object.body)) await writeFile(temporary, object.body);
      else await pipeline(object.body, createWriteStream(temporary));
      await rename(temporary, filePath);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  async remove(key: string): Promise<void> {
    const filePath = this.pathOf(key);
    if (filePath === null) return;
    await rm(filePath, { force: true });
  }
}
