import type { QueryClient } from '@tanstack/react-query';

import { patchThreadMessages } from './messages';
import type { Message } from './types';

/**
 * LA PIERRE TOMBALE D'UN MESSAGE DÉTRUIT, et celle de ses citations — sortie
 * de `realtime-message-mutations.ts` (#8304) pour que le fil puisse sceller
 * les citations d'une flamme-œil consommée SANS importer statiquement le
 * chunk `realtime` (`budgets.json › on_demand_chunks.realtime.dynamic_only`).
 */
export const tombstone = (message: Message, deletedAt: string): Message => {
  const { attachments: _attachments, ...rest } = message;
  return { ...rest, content: '', translations: [], deletedAt: deletedAt as unknown as Date };
};

export const quotes = (message: Message, quotedId: string): boolean =>
  message.replyTo !== undefined && message.replyTo !== null && message.replyTo.id === quotedId;

export const belongsTo = (message: Message, conversationId: string): boolean => message.conversationId === conversationId;

/**
 * Les citations (`replyTo`) d'un message DÉTRUIT deviennent des pierres
 * tombales dans le fil de sa conversation — sa suppression (#7926) comme son
 * expiration (#7960) : plus rien de lui ne se lit dans les réponses.
 */
export function tombstoneQuotesOf(
  queryClient: QueryClient,
  params: { readonly conversationId: string; readonly messageId: string; readonly deletedAt: string },
): void {
  const citing = (m: Message): boolean => quotes(m, params.messageId) && belongsTo(m, params.conversationId);
  patchThreadMessages(queryClient, params.conversationId, (messages) =>
    messages.some(citing)
      ? messages.map((m) => (citing(m) ? { ...m, replyTo: tombstone(m.replyTo as Message, params.deletedAt) } : m))
      : messages,
  );
}
