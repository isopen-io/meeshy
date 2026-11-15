/**
 * #13100 — une piste TTS d'une pièce `server` / `hybrid` dont l'original est
 * scellé ne passe jamais en clair sous son adresse (`translated/<id>_<langue>.<ext>`).
 * Elle s'écrit sous un nom caché du dossier des temporaires (`.at-rest-tmp/`).
 * Pour une pièce au repos, le verrou de l'original est pris D'ABORD, et l'état
 * scellé de l'original se lit SOUS lui : scellé, le chiffré prend l'adresse ;
 * encore en clair, le clair la prend et le rattrapage scellera la pièce
 * entière. Aucun scellement ne peut s'intercaler entre la lecture et
 * l'écriture. Une pièce d'une conversation en clair ne touche pas au verrou.
 */
import { promises as fs } from 'fs';
import path from 'path';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { atRestFileSealingEnabled, atRestTemporaryPath, processAtRestFileAccess, sealStoredFile, storageKeyOfPath, type AtRestFileAccess } from './atRestFiles';
import { atRestConversationFor, SERVER_AT_REST_SEAL_LOCK_UNAVAILABLE } from './sealAttachmentFiles';
import { SealLockUnavailableError } from './sealLock';
import { enhancedLogger } from '../../../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'translatedTrackWrite' });

const SEAL_LOCK_TRIES = 40;
const SEAL_LOCK_WAIT_MS = 250;

/**
 * Le verrou du fichier d'origine de la pièce, celui que tient son scellement.
 * Occupé : attendu (10 s au plus), puis l'écriture échoue — jamais sans lui.
 * Injoignable : l'écriture échoue tout de suite (fail-closed), journalisée.
 */
async function holdSealLock(access: AtRestFileAccess, filePath: string): Promise<{ readonly release: () => Promise<void> } | null> {
  if (!access.lock) return null;
  for (let attempt = 0; attempt < SEAL_LOCK_TRIES; attempt += 1) {
    const held = await access.lock(filePath).catch((error: unknown) => {
      logger.error('verrou de scellement injoignable : piste non écrite', undefined, {
        code: SERVER_AT_REST_SEAL_LOCK_UNAVAILABLE,
        reason: error instanceof Error ? error.name : 'unknown',
      });
      throw error instanceof SealLockUnavailableError ? error : new SealLockUnavailableError(error);
    });
    if (held !== 'busy') return held;
    await new Promise((resolve) => setTimeout(resolve, SEAL_LOCK_WAIT_MS));
  }
  throw new SealLockUnavailableError(new Error('seal lock busy for too long'));
}

export async function writeTranslatedTrack(
  prisma: Pick<PrismaClient, 'messageAttachment' | 'message'>,
  track: {
    readonly absolutePath: string;
    readonly bytes: Buffer;
    readonly attachmentId: string;
    readonly language: string;
    readonly uploadRoot?: string;
    readonly access?: AtRestFileAccess | null;
  }
): Promise<void> {
  const uploadRoot = track.uploadRoot ?? (process.env.UPLOAD_PATH || '/app/uploads');
  const access = track.access === undefined ? processAtRestFileAccess() : track.access;
  const temporary = atRestTemporaryPath(uploadRoot, 'track');
  await fs.mkdir(path.dirname(track.absolutePath), { recursive: true });
  await fs.mkdir(path.dirname(temporary), { recursive: true, mode: 0o700 });
  await fs.writeFile(temporary, track.bytes, { mode: 0o600 });
  try {
    const targetKey = storageKeyOfPath(track.absolutePath, uploadRoot);
    const sourceKey = storageKeyOfPath(temporary, uploadRoot);
    const head = await prisma.messageAttachment.findUnique({ where: { id: track.attachmentId }, select: { filePath: true } });
    // Le RÉGIME (conversation au repos, ou original déjà scellé) ne dépend pas
    // d'un scellement en cours : il décide seul s'il faut le verrou.
    const conversationId = access && head && atRestFileSealingEnabled() ? await atRestConversationFor({ prisma, access }, track.attachmentId) : null;
    if (!conversationId || !access || !head || !targetKey || !sourceKey) {
      await writePlain(temporary, track.absolutePath, targetKey, access);
      return;
    }
    const held = await holdSealLock(access, head.filePath);
    try {
      // Sous le verrou : l'original a pu être scellé (et repointé) pendant l'attente.
      const current = await prisma.messageAttachment.findUnique({ where: { id: track.attachmentId }, select: { filePath: true } });
      const originalSealed = current !== null && (await access.store.find(current.filePath)) !== null;
      if (!originalSealed) {
        await writePlain(temporary, track.absolutePath, targetKey, access);
        return;
      }
      await sealStoredFile({
        uploadRoot,
        sourceKey,
        targetKey,
        binding: { conversationId, attachmentId: track.attachmentId, role: `track-${track.language.toLowerCase().replace(/[^a-z0-9]/g, '')}` },
        access,
      });
    } finally {
      await held?.release().catch(() => undefined);
    }
  } finally {
    await fs.unlink(temporary).catch(() => undefined);
  }
}

/**
 * Une piste en clair prend l'adresse ; la ligne de scellement d'une version
 * antérieure part AVANT — un retrait qui échoue laisse l'ancienne piste
 * lisible plutôt qu'une ligne périmée sur un clair illisible.
 */
async function writePlain(temporary: string, target: string, targetKey: string | null, access: AtRestFileAccess | null): Promise<void> {
  if (access && targetKey && (await access.store.find(targetKey)) !== null) await access.store.remove(targetKey);
  await fs.rename(temporary, target);
  await fs.chmod(target, 0o644).catch(() => undefined);
}
