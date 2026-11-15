import { Readable } from 'node:stream';
import { enhancedLogger } from '../../../utils/logger-enhanced';
import type { ByteRange, MediaObjectStore, ObjectBody, StoredObjectHead } from './MediaObjectStore';

const logger = enhancedLogger.child({ module: 'MirroredObjectStore' });

/**
 * L'ÉCRITURE EN DOUBLE (#11267) : le support PRIMAIRE (le disque) fait foi, le
 * MIROIR (le seau S3) reçoit une copie.
 *
 * - écrire : le primaire d'abord — son échec fait échouer l'écriture ; puis le
 *   miroir — son échec est journalisé et signalé (`onMirrorFailure`) pour que le
 *   miroir continu ou la migration le reprennent, jamais remonté à l'envoi ;
 * - lire : le primaire, puis le miroir quand le primaire ne l'a plus. Une URL
 *   existante continue donc de servir pendant toute la migration ;
 * - effacer : les deux.
 *
 * Un flux ne se lit qu'une fois : le primaire l'écrit, puis le miroir relit ce
 * que le primaire a posé.
 */
export class MirroredObjectStore implements MediaObjectStore {
  private readonly primary: MediaObjectStore;
  private readonly mirror: MediaObjectStore;
  private readonly onMirrorFailure: (key: string) => void;

  constructor(options: { readonly primary: MediaObjectStore; readonly mirror: MediaObjectStore; readonly onMirrorFailure?: (key: string) => void }) {
    this.primary = options.primary;
    this.mirror = options.mirror;
    this.onMirrorFailure = options.onMirrorFailure ?? (() => undefined);
  }

  async head(key: string): Promise<StoredObjectHead | null> {
    return (await this.primary.head(key)) ?? (await this.mirror.head(key));
  }

  async read(key: string, range?: ByteRange): Promise<Readable | null> {
    return (await this.primary.read(key, range)) ?? (await this.mirror.read(key, range));
  }

  async write(key: string, object: ObjectBody): Promise<void> {
    await this.primary.write(key, object);
    try {
      const body = Buffer.isBuffer(object.body) ? object.body : await this.primary.read(key);
      if (body === null) throw new Error('primary lost the object it just wrote');
      await this.mirror.write(key, { ...object, body });
    } catch (error) {
      logger.warn('media mirror write failed, the primary copy stands', { key, error: error instanceof Error ? error.message : String(error) });
      this.onMirrorFailure(key);
    }
  }

  async remove(key: string): Promise<void> {
    await Promise.all([this.primary.remove(key), this.mirror.remove(key)]);
  }
}
