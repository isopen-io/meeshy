/**
 * #13100 — une piste TTS d'une pièce `server` / `hybrid` dont l'original est
 * scellé ne passe jamais en clair sous son adresse (`translated/<id>_<langue>.<ext>`).
 * Elle s'écrit sous un nom caché du dossier des temporaires (`.at-rest-tmp/`),
 * puis, sous le verrou de l'original, le chiffré prend l'adresse ; sinon le
 * clair la prend d'un `rename`, comme avant, et le rattrapage scellera la
 * pièce entière.
 */
import { promises as fs } from 'fs';
import path from 'path';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { atRestFileSealingEnabled, atRestTemporaryPath, processAtRestFileAccess, sealStoredFile, storageKeyOfPath, type AtRestFileAccess } from './atRestFiles';
import { atRestConversationFor, SERVER_AT_REST_SEAL_LOCK_UNAVAILABLE } from './sealAttachmentFiles';
import { enhancedLogger } from '../../../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'translatedTrackWrite' });

const SEAL_LOCK_TRIES = 40;
const SEAL_LOCK_WAIT_MS = 250;

/**
 * Le verrou du fichier d'origine de la pièce, celui que tient son scellement :
 * une piste ne s'écrit jamais PENDANT qu'il la scelle (il la rescellerait par-
 * dessus son propre chiffré). Occupé : attendu ; injoignable : la piste
 * s'écrit quand même (scellée), le défaut est journalisé.
 */
async function holdSealLock(access: AtRestFileAccess, filePath: string): Promise<{ readonly release: () => Promise<void> } | null> {
  if (!access.lock) return null;
  for (let attempt = 0; attempt < SEAL_LOCK_TRIES; attempt += 1) {
    const held = await access.lock(filePath).catch((error: unknown) => {
      logger.error('verrou de scellement injoignable : piste écrite sans lui', undefined, {
        code: SERVER_AT_REST_SEAL_LOCK_UNAVAILABLE,
        reason: error instanceof Error ? error.name : 'unknown',
      });
      return null;
    });
    if (held !== 'busy') return held;
    await new Promise((resolve) => setTimeout(resolve, SEAL_LOCK_WAIT_MS));
  }
  logger.warn('verrou de scellement occupé trop longtemps : piste écrite sans lui');
  return null;
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
    const held = access && head ? await holdSealLock(access, head.filePath) : null;
    try {
      const conversationId = access && head && targetKey && sourceKey ? await sealingConversation(prisma, access, track.attachmentId, head.filePath) : null;
      if (!conversationId || !access || !targetKey || !sourceKey) {
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
 * La conversation sous laquelle sceller la piste — seulement si son ORIGINAL
 * est déjà scellé : les adresses d'une pièce ne se signent pour le lecteur
 * que quand son original l'est, et une piste scellée sous une adresse nue ne
 * se lirait plus. Original encore en clair : la piste l'est aussi, le
 * rattrapage scellera la pièce entière.
 */
async function sealingConversation(
  prisma: Pick<PrismaClient, 'messageAttachment' | 'message'>,
  access: AtRestFileAccess,
  attachmentId: string,
  originalKey: string
): Promise<string | null> {
  if (!atRestFileSealingEnabled()) return null;
  if ((await access.store.find(originalKey)) === null) return null;
  return atRestConversationFor({ prisma, access }, attachmentId);
}

/** Une piste en clair prend l'adresse ; une ligne de scellement d'une version antérieure part avec elle. */
async function writePlain(temporary: string, target: string, targetKey: string | null, access: AtRestFileAccess | null): Promise<void> {
  await fs.rename(temporary, target);
  await fs.chmod(target, 0o644).catch(() => undefined);
  if (access && targetKey) await access.store.remove(targetKey);
}
