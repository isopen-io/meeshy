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
import { processAtRestFileAccess, sealStoredFile, storageKeyOfPath, type AtRestFileAccess } from './atRestFiles';
import { atRestConversationFor } from './sealAttachmentFiles';

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
    const conversationId = access ? await atRestConversationFor({ prisma, access }, track.attachmentId) : null;
    const targetKey = storageKeyOfPath(track.absolutePath, uploadRoot);
    const sourceKey = storageKeyOfPath(temporary, uploadRoot);
    if (!conversationId || !access || !targetKey || !sourceKey) {
      await fs.rename(temporary, track.absolutePath);
      await fs.chmod(track.absolutePath, 0o644).catch(() => undefined);
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
    await fs.unlink(temporary).catch(() => undefined);
  }
}
