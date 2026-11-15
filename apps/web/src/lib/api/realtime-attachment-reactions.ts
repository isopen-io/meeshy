import type { QueryClient } from '@tanstack/react-query';
import type { AttachmentReactionUpdateEventData } from '@meeshy/shared/types/socketio-events/reaction';

import { findCachedThreadMessage, patchThreadMessages } from './messages';
import type { Message } from './types';

/**
 * LE PUITS DE `attachment:reaction-added` / `attachment:reaction-removed`
 * (#7894) — la passerelle diffuse à la room de la conversation le résumé
 * ABSOLU de la pièce (`AttachmentReactionHandler.ts`) **et l'ACTEUR**
 * (`userId`, son `User.id` — `participantId` est un `Participant.id`, jamais
 * comparable au lecteur).
 *
 * **« Ma réaction » ne bascule QUE pour le geste du lecteur** (un autre de ses
 * appareils), exactement comme sur la jumelle message-level
 * (`realtime-message-reactions.ts`), `story:reacted` et `post:liked`.
 *
 * Ce doc-comment disait l'inverse jusqu'à #18124 — « une diffusion n'a pas de
 * lecteur, *ma réaction* reste celle que le REST a servie ». C'était vrai
 * TANT QUE l'événement ne nommait pas son auteur ; il le nomme désormais, et
 * la phrase qui l'exemptait était la seule raison de ne pas le lire.
 *
 * Le résumé se POSE, il ne s'additionne jamais, et « ma réaction » est
 * calculée par ensemble : l'écho de MON geste optimiste est donc inoffensif,
 * et une double livraison idempotente.
 *
 * `userId` à `null` désigne un invité de lien partagé, qui n'a pas de ligne
 * `User` : rien ne bascule pour personne — c'est le comportement d'avant ce
 * lot, et il est juste.
 *
 * Fail-closed, motif `applyMessageAttachmentUpdated` : fil fermé, message ou
 * pièce inconnus ⇒ rien ne change, et jamais un ajout de pièce.
 */
export function isAttachmentReactionUpdate(payload: unknown): payload is AttachmentReactionUpdateEventData {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  if (typeof p.attachmentId !== 'string' || typeof p.messageId !== 'string' || typeof p.conversationId !== 'string') {
    return false;
  }
  // `userId` est OPTIONNEL au contrat (compat descendante : un serveur d'avant
  // #18124 ne le sert pas, une entrée de file rejouée non plus) et NULLABLE
  // (invité de lien). Une valeur d'un autre type est en revanche une charge
  // qu'on refuse — la garde est fail-closed sur la forme, pas sur l'absence.
  if (p.userId !== undefined && p.userId !== null && typeof p.userId !== 'string') return false;
  const summary = p.reactionSummary;
  if (typeof summary !== 'object' || summary === null || Array.isArray(summary)) return false;
  return Object.values(summary).every((count) => typeof count === 'number');
}

/** L'ensemble des emojis du lecteur sur cette pièce, après SON geste. */
const nextMine = (
  current: readonly string[] | undefined,
  emoji: string,
  action: 'add' | 'remove',
): readonly string[] => {
  const mine = current ?? [];
  if (action === 'remove') return mine.filter((e) => e !== emoji);
  return mine.includes(emoji) ? mine : [...mine, emoji];
};

export function applyAttachmentReactionUpdate(
  queryClient: QueryClient,
  data: AttachmentReactionUpdateEventData,
  viewerId: string,
): void {
  const existing = findCachedThreadMessage(queryClient, data.conversationId, data.messageId);
  if (existing === undefined) return;
  const attachments = existing.attachments;
  if (attachments === undefined || !attachments.some((a) => a.id === data.attachmentId)) return;

  const mineMoved = typeof data.userId === 'string' && data.userId === viewerId;
  const next: Message = {
    ...existing,
    attachments: attachments.map((a) =>
      a.id === data.attachmentId
        ? {
            ...a,
            reactionSummary: { ...data.reactionSummary },
            ...(mineMoved ? { currentUserReactions: nextMine(a.currentUserReactions, data.emoji, data.action) } : {}),
          }
        : a,
    ),
  };
  patchThreadMessages(queryClient, data.conversationId, (messages) =>
    messages.map((m) => (m.id === data.messageId ? next : m)),
  );
}
