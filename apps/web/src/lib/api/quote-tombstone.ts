import type { QueryClient } from '@tanstack/react-query';

import { patchThreadMessages } from './messages';
import type { Message } from './types';

/**
 * LA PIERRE TOMBALE D'UN MESSAGE DÉTRUIT, et celle de ses citations — sortie
 * de `realtime-message-mutations.ts` (#8304) pour que le fil puisse sceller
 * les citations d'une flamme-œil consommée SANS importer statiquement le
 * chunk `realtime` (`budgets.json › on_demand_chunks.realtime.dynamic_only`).
 */
export const tombstone = (message: Message, deletedAt: string, expired = false): Message => {
  const { attachments: _attachments, ...rest } = message;
  const sealed = { ...rest, content: '', translations: [], deletedAt: deletedAt as unknown as Date };
  return expired ? { ...sealed, expiresAt: deletedAt as unknown as Date } : sealed;
};

export const quotes = (message: Message, quotedId: string): boolean =>
  message.replyTo !== undefined && message.replyTo !== null && message.replyTo.id === quotedId;

export const belongsTo = (message: Message, conversationId: string): boolean => message.conversationId === conversationId;

/**
 * Les citations (`replyTo`) d'un message DÉTRUIT deviennent des pierres
 * tombales dans le fil de sa conversation — sa suppression (#7926) comme son
 * expiration (#7960) : plus rien de lui ne se lit dans les réponses.
 *
 * `expired` (#8631) : le scellement vient d'une EXPIRATION (éphémère échu,
 * flamme-œil consommée) — la citation porte alors `expiresAt` = `deletedAt`,
 * la forme que sert la passerelle, et se lit « Message éphémère expiré ».
 */
export function tombstoneQuotesOf(
  queryClient: QueryClient,
  params: { readonly conversationId: string; readonly messageId: string; readonly deletedAt: string; readonly expired?: boolean },
): void {
  const citing = (m: Message): boolean => quotes(m, params.messageId) && belongsTo(m, params.conversationId);
  patchThreadMessages(queryClient, params.conversationId, (messages) =>
    messages.some(citing)
      ? messages.map((m) => (citing(m) ? { ...m, replyTo: tombstone(m.replyTo as Message, params.deletedAt, params.expired === true) } : m))
      : messages,
  );
}
