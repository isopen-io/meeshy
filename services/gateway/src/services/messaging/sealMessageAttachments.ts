/**
 * #13100 — un message d'une conversation `server` / `hybrid` ne laisse aucune
 * pièce jointe en clair sur le disque : chacune de ses pièces (déposée,
 * transférée ou recopiée par une diffusion) est scellée AVANT que le message
 * ne parte vers ses destinataires. Les adresses que `message:new` et la
 * réponse d'envoi portent sont donc déjà celles des fichiers scellés.
 *
 * Un échec de scellement n'efface rien et ne bloque pas l'envoi déjà écrit :
 * il est journalisé (`SERVER_AT_REST_FILE_SEAL_FAILED`, sans nom ni chemin),
 * et la migration de rattrapage, idempotente, le rejoue. La clé, elle, est
 * exigée AVANT l'écriture du message (`requireFileSealingKey`) : sans clé
 * maîtresse, l'envoi est refusé comme celui d'un texte.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { sealAttachmentFiles, type SealAttachmentDeps } from '../attachments/atRest/sealAttachmentFiles';
import type { AtRestFileAccess } from '../attachments/atRest/atRestFiles';
import { eraseMirroredCopy } from '../storage/objects/mirroredErasure';

const logger = enhancedLogger.child({ module: 'sealMessageAttachments' });

export const SERVER_AT_REST_FILE_SEAL_FAILED = 'SERVER_AT_REST_FILE_SEAL_FAILED';

export const uploadRootFromEnv = (): string => process.env.UPLOAD_PATH || '/app/uploads';

/** Les dépendances d'un scellement depuis la passerelle : la racine relue à l'appel, la copie du seau effacée. */
export function gatewaySealDeps(prisma: Pick<PrismaClient, 'messageAttachment' | 'message'>, access: AtRestFileAccess): SealAttachmentDeps {
  const uploadRoot = uploadRootFromEnv();
  return { prisma, uploadRoot, access, eraseMirrored: (absolute) => eraseMirroredCopy(absolute, uploadRoot) };
}

/** Un envoi qui porte des fichiers : pièces déposées, transfert, diffusion. */
export const sendCarriesFiles = (request: {
  readonly attachmentIds?: readonly string[];
  readonly forwardedFromId?: string;
  readonly copyAttachmentsFromMessageId?: string;
}): boolean => (request.attachmentIds?.length ?? 0) > 0 || Boolean(request.forwardedFromId) || Boolean(request.copyAttachmentsFromMessageId);

/** Refuse l'envoi (`SERVER_AT_REST_UNAVAILABLE`) quand aucune clé ne scellerait ses fichiers. */
export async function requireFileSealingKey(access: AtRestFileAccess, conversationId: string): Promise<void> {
  await access.keyring.fileSealingKey(conversationId);
}

export async function sealMessageAttachmentsAtRest(
  deps: SealAttachmentDeps,
  input: { readonly messageId: string; readonly conversationId: string }
): Promise<void> {
  const pieces = await deps.prisma.messageAttachment.findMany({ where: { messageId: input.messageId }, select: { id: true } });
  for (const piece of pieces) {
    try {
      await sealAttachmentFiles(deps, { attachmentId: piece.id, conversationId: input.conversationId });
    } catch (error) {
      logger.error('pièce jointe non scellée au repos : la migration de rattrapage la reprendra', undefined, {
        code: SERVER_AT_REST_FILE_SEAL_FAILED,
        attachmentId: piece.id,
        messageId: input.messageId,
        reason: error instanceof Error ? error.name : 'unknown',
      });
    }
  }
}
