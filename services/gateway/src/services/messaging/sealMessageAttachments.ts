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
import { atRestFileSealingEnabled, type AtRestFileAccess } from '../attachments/atRest/atRestFiles';
import { eraseMirroredCopy } from '../storage/objects/mirroredErasure';
import { MESSAGE_ATTACHMENT_ORDER } from '../attachments/attachmentIncludes';
import { readerFileUrlSignerFromEnv } from '../attachments/readerFileSignature';
import { gatewaySealLock } from '../attachments/atRest/atRestFileAccessFor';
import { ServerAtRestUnavailableError } from './serverAtRest';
import { contentExitLawOfSource, type ContentExitProjection } from '@meeshy/shared/utils/content-exit-law';
import { protectionOfFullMessageRow } from '../../socketio/readerSignedDelivery';

const logger = enhancedLogger.child({ module: 'sealMessageAttachments' });

export const SERVER_AT_REST_FILE_SEAL_FAILED = 'SERVER_AT_REST_FILE_SEAL_FAILED';

export const uploadRootFromEnv = (): string => process.env.UPLOAD_PATH || '/app/uploads';

/** Les dépendances d'un scellement depuis la passerelle : la racine relue à l'appel, la copie du seau effacée. */
export function gatewaySealDeps(prisma: Pick<PrismaClient, 'messageAttachment' | 'message'>, access: AtRestFileAccess): SealAttachmentDeps {
  const uploadRoot = uploadRootFromEnv();
  return {
    prisma,
    uploadRoot,
    access,
    eraseMirrored: (absolute) => eraseMirroredCopy(absolute, uploadRoot),
    lock: access.lock ?? gatewaySealLock,
  };
}

/** Un envoi qui porte des fichiers : pièces déposées, transfert, diffusion. */
export const sendCarriesFiles = (request: {
  readonly attachmentIds?: readonly string[];
  readonly forwardedFromId?: string;
  readonly copyAttachmentsFromMessageId?: string;
}): boolean => (request.attachmentIds?.length ?? 0) > 0 || Boolean(request.forwardedFromId) || Boolean(request.copyAttachmentsFromMessageId);

/**
 * Refuse l'envoi (`SERVER_AT_REST_UNAVAILABLE`) quand ses fichiers ne
 * pourraient pas être scellés — aucune clé de conversation — ou, scellés, ne
 * pourraient être lus par personne : sans clé de signature des adresses
 * (`ATTACHMENT_URL_SIGNING_KEY`), aucune adresse signée ne les servirait, et
 * l'adresse nue d'un fichier scellé est refusée. Le scellement suspendu
 * (`AT_REST_FILE_SEALING=off`, retour arrière) n'exige rien : rien ne se scelle.
 */
export async function requireFileSealingKey(
  access: AtRestFileAccess,
  conversationId: string,
  signer: () => unknown = () => readerFileUrlSignerFromEnv(new Date())
): Promise<void> {
  if (!atRestFileSealingEnabled()) return;
  if (signer() === null) throw new ServerAtRestUnavailableError('reader-signing-unavailable');
  await access.keyring.fileSealingKey(conversationId);
}

export async function sealMessageAttachmentsAtRest(
  deps: SealAttachmentDeps,
  input: { readonly messageId: string; readonly conversationId: string }
): Promise<void> {
  const pieces = await deps.prisma.messageAttachment.findMany({ where: { messageId: input.messageId }, select: { id: true }, orderBy: MESSAGE_ATTACHMENT_ORDER });
  for (const piece of pieces) {
    try {
      const outcome = await sealAttachmentFiles(deps, { attachmentId: piece.id, conversationId: input.conversationId });
      if (outcome.status === 'skipped' && outcome.reason === 'busy') {
        logger.warn('pièce jointe non scellée à l’envoi (verrou occupé) : le balayage la reprendra', { code: SERVER_AT_REST_FILE_SEAL_FAILED, attachmentId: piece.id, messageId: input.messageId });
      }
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

/**
 * #13102 — le contenu de ce message est-il destiné à disparaître (vue unique,
 * flamme) ? Ses transcriptions et traductions ne se rangent alors nulle part
 * au translator : rien à oublier quand il brûle.
 */
export function contentDisappears(message: object): boolean {
  return contentExitLawOfSource({ ...protectionOfFullMessageRow(message), attachments: [] } as ContentExitProjection).nature !== 'ordinary';
}

