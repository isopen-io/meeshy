/**
 * #13100 — une piste TTS d'une pièce `server` / `hybrid` ne passe jamais en
 * clair sous son adresse (`translated/<id>_<langue>.<ext>`). Elle s'écrit sous
 * un nom CACHÉ du même dossier (jamais servi), puis, si la pièce se scelle, le
 * chiffré prend l'adresse et le clair caché part ; sinon le clair la prend
 * d'un `rename`, comme avant.
 */
import { promises as fs } from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { atRestFileSealingEnabled, processAtRestFileAccess, sealStoredFile, storageKeyOfPath, type AtRestFileAccess } from './atRestFiles';
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
  const temporary = path.join(path.dirname(track.absolutePath), `.track-${randomBytes(8).toString('hex')}`);
  await fs.mkdir(path.dirname(track.absolutePath), { recursive: true });
  await fs.writeFile(temporary, track.bytes, { mode: 0o600 });
  try {
    const conversationId = access && atRestFileSealingEnabled() ? await atRestConversationFor({ prisma, access }, track.attachmentId) : null;
    const targetKey = storageKeyOfPath(track.absolutePath, uploadRoot);
    const sourceKey = storageKeyOfPath(temporary, uploadRoot);
    if (!conversationId || !access || !targetKey || !sourceKey) {
      await fs.rename(temporary, track.absolutePath);
      await fs.chmod(track.absolutePath, 0o644).catch(() => undefined);
      return;
    }
    const head = await prisma.messageAttachment.findUnique({ where: { id: track.attachmentId }, select: { filePath: true } });
    const held = head ? await holdSealLock(access, head.filePath) : null;
    try {
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
