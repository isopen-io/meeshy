import type { QueryClient } from '@tanstack/react-query';
import type { AttachmentReactionUpdateEventData } from '@meeshy/shared/types/socketio-events/reaction';

import { findCachedThreadMessage, patchThreadMessages } from './messages';
import type { Message } from './types';

/**
 * LE PUITS DE `attachment:reaction-added` / `attachment:reaction-removed`
 * (#7894) — la passerelle diffuse à la room de la conversation le résumé
 * ABSOLU de la pièce (`AttachmentReactionHandler.ts`). Miroir iOS :
 * `ConversationViewModel.applyAttachmentReactionDelta` REMPLACE
 * `reactionSummary` et ne touche jamais `currentUserReactions` — une diffusion
 * n'a pas de lecteur, « ma réaction » reste celle que le REST a servie.
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
  const summary = p.reactionSummary;
  if (typeof summary !== 'object' || summary === null || Array.isArray(summary)) return false;
  return Object.values(summary).every((count) => typeof count === 'number');
}

export function applyAttachmentReactionUpdate(queryClient: QueryClient, data: AttachmentReactionUpdateEventData): void {
  const existing = findCachedThreadMessage(queryClient, data.conversationId, data.messageId);
  if (existing === undefined) return;
  const attachments = existing.attachments;
  if (attachments === undefined || !attachments.some((a) => a.id === data.attachmentId)) return;

  const next: Message = {
    ...existing,
    attachments: attachments.map((a) =>
      a.id === data.attachmentId ? { ...a, reactionSummary: { ...data.reactionSummary } } : a,
    ),
  };
  patchThreadMessages(queryClient, data.conversationId, (messages) =>
    messages.map((m) => (m.id === data.messageId ? next : m)),
  );
}
