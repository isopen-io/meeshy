/**
 * Admission des pièces jointes PRÉ-UPLOADÉES d'un envoi de message (#6870).
 *
 * Le transport WS (`MessageHandler.handleMessageSendWithAttachments`) valide
 * chaque `attachmentId` — existe, appartient à l'expéditeur — AVANT de créer
 * le message, et nomme la pièce fautive dans son refus
 * (`attachmentService.getAttachmentsByIds` + le contrôle `uploadedBy`).
 *
 * Le transport REST (`messages-send.ts`) n'avait AUCUN équivalent :
 * `AttachmentService.associateAttachmentsToMessage` est un `updateMany` qui ne
 * matche RIEN pour un id inconnu ou volé — sans lever, sans compter, avalé
 * plus loin par le `try/catch` de `MessageProcessor.handleAttachments`. Un
 * envoi portant un `attachmentId` invalide, ou une pièce dont la ligne n'est
 * pas encore visible par ce chemin, se persistait donc SANS sa pièce, en
 * silence — jamais l'erreur nommée que l'appelant peut corriger.
 *
 * Site unique pour les DEUX transports : c'est la même question
 * (« ces ids sont-ils de VRAIES pièces, et à MOI ? ») qui doit rendre le même
 * verdict, dans le même ordre, quel que soit le chemin.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';

/**
 * `ok: false` ⇒ `invalidAttachmentId` porte l'id fautif. Type PLAT, pas une
 * union discriminée : `tsconfig.json` du gateway porte `strictNullChecks:
 * false`, sous lequel le contrôle de flux ne narrows PAS une union sur son
 * discriminant (même patron que `AttachmentReplyAdmission`, dans
 * `attachmentReplySnapshot.ts`, pour la même raison).
 */
export type MessageAttachmentAdmission = {
  readonly ok: boolean;
  readonly invalidAttachmentId?: string;
};

/**
 * `ownerId` est la clé sous laquelle `UploadProcessor` a écrit `uploadedBy` —
 * `authContext.userId`, qui porte un `User.id` pour un compte enregistré et un
 * `Participant.id` pour un invité de lien partagé (`middleware/auth.ts`,
 * exactement ce que `POST /attachments/upload` (`routes/attachments/upload.ts`)
 * a persisté). Ne JAMAIS lui substituer le `Participant.id` résolu dans LA
 * conversation courante : les deux coïncident pour un anonyme, jamais pour un
 * compte enregistré.
 */
export async function admitMessageAttachments(
  prisma: Pick<PrismaClient, 'messageAttachment'>,
  params: { readonly attachmentIds: readonly string[]; readonly ownerId: string }
): Promise<MessageAttachmentAdmission> {
  const { attachmentIds, ownerId } = params;
  if (attachmentIds.length === 0) {
    return { ok: true };
  }

  const rows = await prisma.messageAttachment.findMany({
    where: { id: { in: [...new Set(attachmentIds)] } },
    select: { id: true, uploadedBy: true },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));

  for (const attachmentId of attachmentIds) {
    const row = byId.get(attachmentId);
    if (!row || row.uploadedBy !== ownerId) {
      return { ok: false, invalidAttachmentId: attachmentId };
    }
  }
  return { ok: true };
}
