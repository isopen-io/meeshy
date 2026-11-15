import type { QueryClient } from '@tanstack/react-query';
import type { MessageCitedPostWithdrawnEventData } from '@meeshy/shared/types/socketio-events/message';

import { patchThreadMessages } from './messages';
import type { Message } from './types';

/**
 * LE PUITS DE `message:cited-post-withdrawn` (#7969) — la story (ou tout post)
 * citée par des messages du fil a été RETIRÉE par son auteur ou la modération.
 * La passerelle l'annonce à la room de chaque conversation qui la cite
 * (`announceCitedPostWithdrawal.ts`).
 *
 * La lecture REST sert déjà `postReplyTo.deletedAt` avec un instantané vidé
 * (`servedPostReply.ts`, #7950), et `storyCitationOf` / `moodCitationOf` le
 * rendent « Story indisponible » (#7950). Ce puits pose le MÊME marqueur sur ce
 * que le cache détient, pour que la carte change sans navigation :
 *
 *  - la citation hissée (`postReplyTo`, racine) est remplacée par
 *    `{ id, deletedAt }` — rien de l'aperçu, de la vignette ni de l'emoji ne
 *    reste ;
 *  - `metadata.postReplyTo` (le repli REST) est RETIRÉ : laissé là, il
 *    garderait la vignette dans le cache, persisté ;
 *  - la citation embarquée d'une réponse À ce message (`replyTo`) suit.
 *
 * Miroir iOS : `MessagePersistenceActor.markCitedPostWithdrawn` (GRDB), relayé
 * conversation ouverte ET fermée par `ConversationSyncEngine`.
 */

export function isCitedPostWithdrawnEvent(payload: unknown): payload is MessageCitedPostWithdrawnEventData {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return typeof p.conversationId === 'string' && typeof p.postId === 'string' && typeof p.deletedAt === 'string';
}

/* `Message` ne déclare pas le champ hissé `postReplyTo` (même écart que
   `rawMessageFromSocket`, `realtime-apply.ts`) : il se lit comme la donnée non
   typée qu'il est. */
type HoistedPostReply = { readonly postReplyTo?: unknown };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const citedIdOf = (value: unknown): string | undefined =>
  isRecord(value) && typeof value.id === 'string' ? value.id : undefined;

const citesPost = (message: Message, postId: string): boolean => {
  const metadata = isRecord(message.metadata) ? message.metadata : undefined;
  return (
    message.storyReplyToId === postId ||
    citedIdOf((message as Message & HoistedPostReply).postReplyTo) === postId ||
    citedIdOf(metadata?.postReplyTo) === postId
  );
};

const withoutMetadataSnapshot = (metadata: Message['metadata']): Message['metadata'] => {
  if (!isRecord(metadata) || !('postReplyTo' in metadata)) return metadata;
  const { postReplyTo: _snapshot, ...rest } = metadata;
  return rest;
};

const withdrawn = (message: Message, data: MessageCitedPostWithdrawnEventData): Message =>
  ({
    ...message,
    metadata: withoutMetadataSnapshot(message.metadata),
    postReplyTo: { id: data.postId, deletedAt: data.deletedAt },
  }) as Message;

const followed = (message: Message, data: MessageCitedPostWithdrawnEventData): Message => {
  const ownChanges = citesPost(message, data.postId);
  const quote = message.replyTo;
  const quoteChanges = quote !== undefined && quote !== null && citesPost(quote, data.postId);
  if (!ownChanges && !quoteChanges) return message;
  const own = ownChanges ? withdrawn(message, data) : message;
  return quoteChanges ? { ...own, replyTo: withdrawn(quote, data) } : own;
};

export function applyCitedPostWithdrawn(queryClient: QueryClient, data: MessageCitedPostWithdrawnEventData): void {
  patchThreadMessages(queryClient, data.conversationId, (messages) => {
    const next = messages.map((m) => (m.conversationId === data.conversationId ? followed(m, data) : m));
    return next.some((m, index) => m !== messages[index]) ? next : messages;
  });
}
