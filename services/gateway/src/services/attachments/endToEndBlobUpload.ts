/**
 * **Un blob chiffré de bout en bout se range opaque** (#10789).
 *
 * L'appareil a chiffré la pièce (format `client-v1`) et ne téléverse que le
 * chiffré, par la porte TUS, sous le contexte `e2ee-attachment`. Ce module est
 * la voie de ce contexte, que `routes/uploads/tus-handler.ts` prend AVANT tout
 * traitement de média :
 *  - à la création, la liste blanche des métadonnées (`E2EE_ATTACHMENT_METADATA_KEYS`) :
 *    un nom, un type, une durée, une transcription ou un ThumbHash diraient au
 *    serveur ce que le chiffré cache — refusés avant le premier octet ;
 *  - à la fin, le condensat déclaré est comparé à celui du fichier reçu, puis
 *    le blob est rangé tel quel. Ni reniflage, ni EXIF, ni extraction, ni
 *    vignette, ni normalisation, ni tâche différée.
 *
 * Modèle de menace : serveur compromis en lecture. Il garde un blob, sa taille
 * (arrondie par l'appareil), son condensat et son déposant ; rien d'autre.
 * Décision : `services/gateway/decisions/2026-10-25-la-passerelle-garde-une-piece-e2ee-comme-un-blob-opaque.md`.
 */
import { createHash, timingSafeEqual } from 'crypto';
import { createReadStream, promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  E2EE_ATTACHMENT_ERROR_CODES,
  E2EE_ATTACHMENT_FILE_NAME,
  E2EE_ATTACHMENT_METADATA_KEYS,
  E2EE_ATTACHMENT_MIME_TYPE,
  E2EE_ATTACHMENT_UPLOAD_CONTEXT,
} from '@meeshy/shared/types/e2ee-attachment';

/** La forme que `@tus/server` rend telle quelle au client. */
export type TusRefusal = { readonly status_code: number; readonly body: string };

type UploadMetadata = Readonly<Record<string, string | null | undefined>>;

const refusal = (status: number, code: string, reason: string): TusRefusal => ({ status_code: status, body: `${code}: ${reason}\n` });

export const isEndToEndUploadContext = (context: unknown): boolean => context === E2EE_ATTACHMENT_UPLOAD_CONTEXT;

/** Le condensat déclaré, s'il a la forme d'un SHA-256 en base64. */
function declaredDigest(metadata: UploadMetadata): Buffer | null {
  const declared = metadata.digest;
  if (typeof declared !== 'string') return null;
  const digest = Buffer.from(declared, 'base64');
  return digest.length === 32 && digest.toString('base64') === declared ? digest : null;
}

/**
 * Ce qui refuse la CRÉATION d'un blob, avant le premier octet : un invité de
 * lien (aucun appareil chiffrant), une métadonnée hors liste blanche, un type
 * ou un nom qui ne sont pas les neutres, un condensat absent ou mal formé.
 */
export function endToEndUploadRefusal(input: { readonly metadata: UploadMetadata; readonly isAnonymous: boolean }): TusRefusal | null {
  if (input.isAnonymous) {
    return refusal(403, E2EE_ATTACHMENT_ERROR_CODES.ANONYMOUS_REFUSED, 'a guest has no end-to-end encrypting device');
  }
  const allowed: readonly string[] = E2EE_ATTACHMENT_METADATA_KEYS;
  const foreign = Object.keys(input.metadata).filter((key) => input.metadata[key] != null && !allowed.includes(key));
  const { filetype, filename } = input.metadata;
  if (foreign.length > 0 || (filetype != null && filetype !== E2EE_ATTACHMENT_MIME_TYPE) || (filename != null && filename !== E2EE_ATTACHMENT_FILE_NAME)) {
    return refusal(400, E2EE_ATTACHMENT_ERROR_CODES.METADATA_REFUSED, 'an end-to-end encrypted blob carries no readable metadata');
  }
  if (!declaredDigest(input.metadata)) {
    return refusal(400, E2EE_ATTACHMENT_ERROR_CODES.DIGEST_MISMATCH, 'the SHA-256 digest of the blob is required');
  }
  return null;
}

async function sha256Of(filePath: string): Promise<Buffer> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk as Buffer);
  return hash.digest();
}

export type EndToEndBlobInput = {
  readonly sourcePath: string;
  readonly metadata: UploadMetadata;
  readonly userId: string;
  readonly now: Date;
};

/**
 * Range le blob reçu (`sourcePath`, fichier temporaire de TUS) après avoir
 * vérifié son condensat. Un condensat faux efface le fichier et rend 400 ;
 * aucune ligne n'est créée.
 */
export async function storeEndToEndBlob(
  deps: { readonly prisma: Pick<PrismaClient, 'messageAttachment'>; readonly uploadPath: string },
  input: EndToEndBlobInput,
): Promise<{ readonly status_code: number; readonly headers: Record<string, string>; readonly body: string }> {
  const expected = declaredDigest(input.metadata);
  const received = await sha256Of(input.sourcePath);
  if (!expected || !timingSafeEqual(expected, received)) {
    await fs.unlink(input.sourcePath).catch(() => undefined);
    throw refusal(400, E2EE_ATTACHMENT_ERROR_CODES.DIGEST_MISMATCH, 'the blob is not the one whose digest was declared');
  }

  const year = input.now.getFullYear().toString();
  const month = (input.now.getMonth() + 1).toString().padStart(2, '0');
  const storedName = `e2ee_${uuidv4()}.bin`;
  const relPath = path.join(year, month, input.userId, storedName);
  const destPath = path.join(deps.uploadPath, relPath);
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.rename(input.sourcePath, destPath).catch(async () => {
    await fs.copyFile(input.sourcePath, destPath);
    await fs.unlink(input.sourcePath).catch(() => undefined);
  });
  const fileSize = (await fs.stat(destPath)).size;
  const encryptedFileHash = received.toString('base64');

  const attachment = await deps.prisma.messageAttachment.create({
    data: {
      fileName: storedName,
      originalName: '',
      mimeType: E2EE_ATTACHMENT_MIME_TYPE,
      fileSize,
      filePath: relPath,
      fileUrl: relPath,
      uploadedBy: input.userId,
      isAnonymous: false,
      isEncrypted: true,
      encryptionMode: 'e2ee',
      encryptedFileHash,
    },
  });

  return {
    status_code: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      success: true,
      data: {
        attachment: {
          id: attachment.id,
          fileName: storedName,
          originalName: '',
          mimeType: E2EE_ATTACHMENT_MIME_TYPE,
          fileSize,
          fileUrl: relPath,
          uploadedBy: input.userId,
          isAnonymous: false,
          isEncrypted: true,
          encryptionMode: 'e2ee',
          encryptedFileHash,
          createdAt: input.now.toISOString(),
        },
      },
    }),
  };
}
