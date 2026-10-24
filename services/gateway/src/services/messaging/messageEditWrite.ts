import type { Prisma, PrismaClient } from '@meeshy/shared/prisma/client';
import type { MessageEditorColumns } from '@meeshy/shared/utils/message-edit-attribution';
import { editAttributionOf, type MessageEditAdmission } from './messageEditAdmission';
import { applyMessageEditEffects, type EditedMessageRecord } from './messageEditEffects';

export type GuardedMessageEdit = {
  readonly prisma: PrismaClient;
  readonly messageId: string;
  readonly content: string;
  readonly admission: MessageEditAdmission;
  readonly editorUserId: string;
  /** `{ metadata }` quand la réconciliation des liens a établi une carte, `{}` sinon. */
  readonly nextMetadata: { readonly metadata?: Prisma.MessageUpdateManyMutationInput['metadata'] };
  /** Le message d'AVANT l'écriture, tel que les effets durables le lisent. */
  readonly previous: Omit<EditedMessageRecord, 'content' | 'editedAt'>;
};

export type GuardedMessageEditResult = {
  readonly written: boolean;
  /** L'instant ÉCRIT dans `Message.editedAt`, remis tel quel aux effets et à la diffusion. */
  readonly editedAt: Date;
  /** L'auteur de la modification ÉCRIT (#11375) : le transport compose sa charge depuis la ligne d'AVANT. */
  readonly editedBy: MessageEditorColumns;
};

/**
 * L'ÉCRITURE d'une édition par le transport socket `message:edit`, extraite du
 * handler (hors budget de taille) pour y poser l'auteur de la modification.
 *
 * Optimistic-concurrency guard: only write while the message is still
 * non-deleted. A `message:delete` landing between the read and this write
 * would otherwise resurrect the row with edited content (unconditional
 * `update` by id succeeds regardless of `deletedAt`), and the gateway would
 * broadcast MESSAGE_EDITED for a message clients already removed. Mirrors the
 * guarded `updateMany` used by handleMessageDelete's lastMessageAt recompute.
 *
 * #11375 — le modérateur de plateforme qui modifie le message d'autrui est
 * enregistré avec son rôle ; l'auteur qui réécrit efface la mention.
 *
 * L'écriture vide `translations` : ses effets DURABLES (compteurs,
 * notifications, traductions partagées d'avant, #9899) la suivent ici même,
 * par `applyMessageEditEffects`, avec l'instant ÉCRIT — la version de source
 * d'une traduction partagée en est l'ISO.
 */
export async function writeGuardedMessageEdit(edit: GuardedMessageEdit): Promise<GuardedMessageEditResult> {
  const editedAt = new Date();
  const editedBy = editAttributionOf(edit.admission, edit.editorUserId);
  const result = await edit.prisma.message.updateMany({
    where: { id: edit.messageId, deletedAt: null },
    data: {
      content: edit.content,
      isEdited: true,
      editedAt,
      ...editedBy,
      translations: null,
      ...edit.nextMetadata,
    },
  });
  if (result.count === 0) return { written: false, editedAt, editedBy };
  await applyMessageEditEffects(edit.prisma, { ...edit.previous, content: edit.content, editedAt });
  return { written: true, editedAt, editedBy };
}
