import type { QueryClient } from '@tanstack/react-query';

import { CONVERSATIONS_QUERY_KEY } from '@/lib/api/conversations';
import type { ConversationsInfiniteData } from '@/lib/api/conversations-pages';
import type { ApiResult } from '@/lib/api/http';
import type { Conversation } from '@/lib/api/types';
import type { Draft } from '@/lib/send/perform-send';

/**
 * **RÉPONDRE À UNE HUMEUR, EN PRIVÉ** (#10813) — miroir de
 * `Router.navigateToStoryReply` (iOS) : la réponse part dans la conversation
 * DIRECTE avec l'auteur, en CITANT l'humeur (`storyReplyToId`, que la
 * passerelle gèle en `metadata.postReplyTo` et n'admet que dans ce direct —
 * `storyReplyAdmission.ts`).
 *
 * Rien n'est réécrit : le direct se trouve d'abord dans la liste DÉJÀ servie
 * (aucun aller-retour), sinon par la création idempotente
 * (`createDirectConversation`, qui REND le direct existant) ; l'envoi passe
 * par `performSend` (outbox, bulle optimiste, relance). Ce module ne fait que
 * les enchaîner, derrière des ports que les témoins remplacent.
 */
export type MoodReplyPorts = {
  readonly online: () => boolean;
  /** L'id de la dernière conversation directe connue avec cette personne. */
  readonly cachedDirect: (userId: string) => string | undefined;
  readonly openDirect: (userId: string) => Promise<ApiResult<{ readonly id: string }>>;
  readonly send: (params: { readonly conversationId: string; readonly draft: Draft }) => Promise<void>;
};

export type MoodReplyOutcome =
  | { readonly status: 'sent'; readonly conversationId: string }
  | { readonly status: 'empty' | 'self' | 'offline' | 'failed' };

const timeOf = (value: Date | string | undefined): number => (value === undefined ? 0 : new Date(value).getTime() || 0);

const recency = (conversation: Conversation): number =>
  Math.max(timeOf(conversation.lastMessageAt), timeOf(conversation.updatedAt), timeOf(conversation.createdAt));

/**
 * LA DERNIÈRE CONVERSATION DIRECTE avec `userId` dans la liste en cache — un
 * groupe où il siège n'en est pas une : la citation y serait refusée.
 */
export function cachedDirectWith(queryClient: QueryClient, userId: string): string | undefined {
  const data = queryClient.getQueryData<ConversationsInfiniteData>(CONVERSATIONS_QUERY_KEY);
  const directs = (data?.pages ?? [])
    .flatMap((page) => page.conversations)
    .filter((conversation) => conversation.type === 'direct' && conversation.participants.some((p) => p.userId === userId));
  const latest = directs.reduce<Conversation | undefined>(
    (best, conversation) => (best === undefined || recency(conversation) > recency(best) ? conversation : best),
    undefined,
  );
  return latest?.id;
}

export async function performMoodReply(params: {
  readonly mood: { readonly postId: string; readonly authorId: string };
  readonly text: string;
  readonly language: string;
  readonly viewerId: string;
  readonly ports: MoodReplyPorts;
}): Promise<MoodReplyOutcome> {
  const { mood, ports } = params;
  const content = params.text.trim();
  if (content === '') return { status: 'empty' };
  if (mood.authorId === params.viewerId) return { status: 'self' };
  if (!ports.online()) return { status: 'offline' };

  const known = ports.cachedDirect(mood.authorId);
  const conversationId = known ?? (await openedDirect(ports, mood.authorId));
  if (conversationId === undefined) return { status: 'failed' };

  await ports.send({ conversationId, draft: { content, originalLanguage: params.language, storyReplyToId: mood.postId } });
  return { status: 'sent', conversationId };
}

async function openedDirect(ports: MoodReplyPorts, userId: string): Promise<string | undefined> {
  const result = await ports.openDirect(userId);
  return result.ok ? result.data.id : undefined;
}
