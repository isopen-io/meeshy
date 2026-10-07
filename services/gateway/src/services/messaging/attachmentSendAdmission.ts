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

export type MessageAttachmentSend = {
  readonly attachmentIds: readonly string[];
  readonly ownerId: string;
  /** Avec `clientMessageId`, ils nomment le message d'un RÉESSAI du même envoi. */
  readonly conversationId?: string;
  readonly clientMessageId?: string;
};

type LoadedAttachment = { readonly uploadedBy?: string | null; readonly messageId?: string | null };

/**
 * `ownerId` est la clé sous laquelle `UploadProcessor` a écrit `uploadedBy` —
 * `authContext.userId`, qui porte un `User.id` pour un compte enregistré et un
 * `Participant.id` pour un invité de lien partagé (`middleware/auth.ts`,
 * exactement ce que `POST /attachments/upload` (`routes/attachments/upload.ts`)
 * a persisté). Ne JAMAIS lui substituer le `Participant.id` résolu dans LA
 * conversation courante : les deux coïncident pour un anonyme, jamais pour un
 * compte enregistré.
 *
 * UNE PIÈCE DÉJÀ ATTACHÉE NE SE RÉ-ATTACHE PAS (#9587). L'identité ne suffit
 * pas : la pièce d'une copie transférée naît sous l'identité de celui qui
 * transfère, et un auteur possède toujours ses pièces déjà envoyées. La
 * re-lier la déplacerait hors de son message — bulle d'origine vidée — et lui
 * ferait porter la protection du nouveau. Seule exception, le RÉESSAI du même
 * envoi : la pièce est déjà sur le message de ce `clientMessageId`, dans cette
 * conversation, et `saveMessage` rend ce message sans rien réécrire.
 */
export async function admitMessageAttachments(
  prisma: Pick<PrismaClient, 'messageAttachment' | 'message'>,
  params: MessageAttachmentSend
): Promise<MessageAttachmentAdmission> {
  if (params.attachmentIds.length === 0) {
    return { ok: true };
  }

  const rows = await prisma.messageAttachment.findMany({
    where: { id: { in: [...new Set(params.attachmentIds)] } },
    select: { id: true, uploadedBy: true, messageId: true },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  return admitLoadedMessageAttachments(prisma, {
    ...params,
    attachments: params.attachmentIds.map((attachmentId) => byId.get(attachmentId) ?? null),
  });
}

/**
 * La même admission pour un transport qui a DÉJÀ chargé ses pièces (le WS en
 * lit le MIME) : `attachments` est aligné sur `attachmentIds`, `null` pour une
 * pièce introuvable.
 */
export async function admitLoadedMessageAttachments(
  prisma: Pick<PrismaClient, 'message'>,
  params: MessageAttachmentSend & { readonly attachments: ReadonlyArray<LoadedAttachment | null | undefined> }
): Promise<MessageAttachmentAdmission> {
  const { attachmentIds, attachments, ownerId } = params;
  const carrierIds = [...new Set(attachments.flatMap((row) => (row?.messageId ? [row.messageId] : [])))];
  const retried = await carriersOfThisSend(prisma, carrierIds, params);

  const invalidIndex = attachments.findIndex((row) => {
    if (!row || row.uploadedBy !== ownerId) return true;
    return Boolean(row.messageId) && !retried.has(row.messageId);
  });
  return invalidIndex === -1 ? { ok: true } : { ok: false, invalidAttachmentId: attachmentIds[invalidIndex] };
}

/**
 * Lu par identifiant puis comparé EN MÉMOIRE : le transport WS adresse une
 * conversation par son `ObjectId` ou par son `identifier`, et un filtre Prisma
 * sur `conversationId` lèverait sur le second.
 */
async function carriersOfThisSend(
  prisma: Pick<PrismaClient, 'message'>,
  carrierIds: readonly string[],
  send: Pick<MessageAttachmentSend, 'conversationId' | 'clientMessageId'>
): Promise<ReadonlySet<string>> {
  if (carrierIds.length === 0 || !send.conversationId || !send.clientMessageId) return new Set();
  const carriers = await prisma.message.findMany({
    where: { id: { in: [...carrierIds] } },
    select: { id: true, conversationId: true, clientMessageId: true, conversation: { select: { identifier: true } } },
  });
  return new Set(
    carriers
      .filter(
        (carrier) =>
          carrier.clientMessageId === send.clientMessageId &&
          (carrier.conversationId === send.conversationId || carrier.conversation?.identifier === send.conversationId),
      )
      .map((carrier) => carrier.id),
  );
}
