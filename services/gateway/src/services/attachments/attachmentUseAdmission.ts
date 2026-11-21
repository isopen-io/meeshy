import type { PrismaClient } from '@meeshy/shared/prisma/client';

/** Ce que cette porte demande à Prisma, et rien de plus. */
export type AttachmentUsePrisma = Pick<PrismaClient, 'participant'>;

/** La forme minimale qu'un appelant doit avoir chargée pour poser la question. */
export type AttachmentUseRow = {
  readonly uploadedBy?: string | null;
  readonly messageId?: string | null;
  readonly message?: { readonly conversationId?: string | null } | null;
};

/**
 * **PEUT-ON SE SERVIR DE CETTE PIÈCE JOINTE ? (#20113, constat F5)**
 *
 * Porte unique de `VoiceProfileService` (clonage de voix) et
 * `AttachmentTranslateService` (traduction d'une pièce), qui en portaient deux
 * exemplaires identiques — mêmes lignes, même commentaire, même défaut.
 *
 * ─── L'ORDRE DES DEUX QUESTIONS EST LA RÈGLE ───────────────────────────────
 *
 * Les deux exemplaires demandaient d'abord « l'ai-je déposée ? »
 * (`uploadedBy === userId`) et ne consultaient l'appartenance qu'ensuite. Ce
 * court-circuit contourne la conversation : **dès qu'une pièce est portée par
 * un message, c'est la conversation qui décide de qui la lit**, et celui qui
 * l'a quittée — ou qu'on y a banni — n'en fait plus partie.
 *
 * L'ordre est donc inversé : le PORTEUR d'abord, le déposant ensuite. C'est ce
 * que font déjà, correctement, `attachmentReadVerdict.ts` (« pas encore
 * rattachée : seul le déposant y accède ») et `routes/attachments/metadata.ts`.
 *
 * Le trou préexistait pour les téléversements, dont `uploadedBy` portait déjà
 * l'identité de compte ; l'unification de l'espace de clés (#20113) l'aurait
 * étendu aux COPIES, donc à toute pièce transférée par qui a ensuite quitté la
 * conversation. On le ferme plutôt que de l'étendre.
 *
 * ─── UN PORTEUR NON CHARGÉ REFUSE ──────────────────────────────────────────
 *
 * `messageId` posé mais `message.conversationId` absent, c'est une PROJECTION
 * incomplète, pas une pièce libre : la question d'appartenance ne peut pas être
 * posée, donc rien ne peut l'autoriser. Répondre `true` sur la foi du déposant
 * ferait d'un `select` oublié une porte ouverte — l'inverse exact de ce que
 * cette fonction garde.
 */
export async function callerMayUseAttachment(
  prisma: AttachmentUsePrisma,
  userId: string,
  attachment: AttachmentUseRow
): Promise<boolean> {
  const conversationId = attachment.message?.conversationId ?? null;

  if (attachment.messageId || conversationId) {
    if (!conversationId) return false;
    const member = await prisma.participant.findFirst({
      where: { conversationId, userId, isActive: true },
    });
    return member !== null && member !== undefined;
  }

  return Boolean(attachment.uploadedBy) && attachment.uploadedBy === userId;
}
