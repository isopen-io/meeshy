import * as z from 'zod/mini';

import type { ConversationCard } from '@meeshy/shared/types/conversation-card';

import type { ConversationLinkTarget } from '@/lib/links/conversation-link';

import { unwrap } from './client';
import type { DataSource } from './config';
import type { ApiResult, HttpTransport } from './http';

/**
 * **LE PORT DE LA CARTE DE CONVERSATION** (#8099) — ce qu'une bulle affiche à
 * la place d'un lien Meeshy de conversation.
 *
 * - lien de PARTAGE : `GET /api/v1/links/:identifier/card` — ce que le lien
 *   autorise déjà, à tout lecteur ;
 * - lien DIRECT : `GET /api/v1/conversations/:id/card` — au seul membre.
 *
 * **Le 404 n'est pas une panne.** La passerelle le rend, à l'identique, pour
 * un lien inconnu et pour une conversation dont le lecteur n'est pas membre
 * (anti-énumération) : le port le rend en `null`, que la carte dessine
 * « Conversation privée », sans « Réessayer » sur une porte fermée.
 *
 * **Cache d'abord** : la famille `['conversation-cards']` est persistée comme
 * les autres requêtes réussies (`query-client.ts`) et purgée quand l'identité
 * change — une carte déjà vue se peint sans squelette, puis se revalide en
 * silence au-delà d'une minute.
 */

export type ConversationCardDeps = { readonly source: DataSource; readonly transport: HttpTransport };

export const CONVERSATION_CARD_STALE_TIME = 60_000;

export const CONVERSATION_CARDS_QUERY_PREFIX = ['conversation-cards'] as const;

export const conversationCardQueryKey = (target: ConversationLinkTarget) =>
  [...CONVERSATION_CARDS_QUERY_PREFIX, target.kind, target.identifier] as const;

type CardQuery = { readonly queryKey: readonly unknown[]; readonly state: { readonly data: unknown } };

const conversationIdOfCard = (data: unknown): string | null | undefined => {
  if (typeof data !== 'object' || data === null || !('conversationId' in data)) return undefined;
  const value = data.conversationId;
  return typeof value === 'string' || value === null ? value : undefined;
};

/**
 * **TOUTES LES CARTES D'UNE CONVERSATION** (#8138) — le filtre que Rejoindre et
 * Quitter invalident. Un même fil peut porter la carte d'un lien de PARTAGE
 * (clé `share-link/<lien>`) et celle du lien DIRECT (clé `direct/<id>`) d'une
 * même conversation : le geste de l'une doit relire l'autre, sans quoi elles se
 * contredisent jusqu'à l'expiration du cache.
 *
 * Sont relues : la carte directe de la conversation (même si elle est en cache
 * « privée », `null`), toute carte qui la nomme, et les cartes de partage d'un
 * NON-membre — celles-là ne disent pas leur conversation (`conversationId` est
 * `null`, anti-énumération), donc aucune ne peut être écartée à coup sûr.
 */
export function conversationCardsFilter(conversationId: string) {
  return {
    queryKey: CONVERSATION_CARDS_QUERY_PREFIX,
    predicate: (query: CardQuery): boolean => {
      const [, kind, identifier] = query.queryKey;
      if (kind === 'direct' && identifier === conversationId) return true;
      const cardConversation = conversationIdOfCard(query.state.data);
      if (cardConversation === conversationId) return true;
      return kind === 'share-link' && cardConversation === null;
    },
  };
}

const nullableText = z.optional(z.nullable(z.string()));

const WireCard = z.object({
  kind: z.enum(['share-link', 'direct']),
  conversationId: nullableText,
  title: z.string(),
  description: nullableText,
  avatarUrl: nullableText,
  bannerUrl: nullableText,
  conversationType: z.string(),
  stats: z.object({
    memberCount: z.number(),
    messageCount: z.optional(z.nullable(z.number())),
    languages: z.optional(z.nullable(z.array(z.string()))),
  }),
  viewer: z.object({
    isMember: z.boolean(),
    canJoin: z.boolean(),
    requiresAccount: z.boolean(),
    canJoinAnonymously: z.optional(z.nullable(z.boolean())),
  }),
  link: z.optional(z.nullable(z.object({ identifier: z.string(), isActive: z.boolean(), expiresAt: nullableText }))),
  inviter: z.optional(
    z.nullable(z.object({ displayName: z.string(), username: nullableText, avatarUrl: nullableText })),
  ),
  inviteMessage: nullableText,
});

const textOrNull = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
};

const countOf = (value: number): number => (Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);

export function decodeConversationCard(raw: unknown): ConversationCard | null {
  const parsed = WireCard.safeParse(raw);
  if (!parsed.success) return null;
  const wire = parsed.data;
  const inviterName = textOrNull(wire.inviter?.displayName);
  return {
    kind: wire.kind,
    conversationId: textOrNull(wire.conversationId),
    title: wire.title,
    description: textOrNull(wire.description),
    avatarUrl: textOrNull(wire.avatarUrl),
    bannerUrl: textOrNull(wire.bannerUrl),
    conversationType: wire.conversationType,
    stats: {
      memberCount: countOf(wire.stats.memberCount),
      onlineCount: null,
      messageCount: typeof wire.stats.messageCount === 'number' ? countOf(wire.stats.messageCount) : null,
      languages: (wire.stats.languages ?? []).map((code) => code.trim().toLowerCase()).filter((code) => code !== ''),
    },
    viewer: {
      isMember: wire.viewer.isMember,
      canJoin: wire.viewer.canJoin,
      requiresAccount: wire.viewer.requiresAccount,
      canJoinAnonymously: wire.viewer.canJoinAnonymously === true,
    },
    link: wire.link
      ? { identifier: wire.link.identifier, isActive: wire.link.isActive, expiresAt: textOrNull(wire.link.expiresAt) }
      : null,
    inviter:
      wire.inviter && inviterName !== null
        ? { displayName: inviterName, username: textOrNull(wire.inviter.username), avatarUrl: textOrNull(wire.inviter.avatarUrl) }
        : null,
    inviteMessage: textOrNull(wire.inviteMessage),
  };
}

const UNREADABLE_CARD = 'UNREADABLE_CONVERSATION_CARD';

const withSignal = (signal: AbortSignal | undefined) => (signal === undefined ? {} : { signal });

const cardPathOf = (target: ConversationLinkTarget): string =>
  target.kind === 'share-link'
    ? `/api/v1/links/${encodeURIComponent(target.identifier)}/card`
    : `/api/v1/conversations/${encodeURIComponent(target.identifier)}/card`;

export async function loadConversationCard(
  params: ConversationCardDeps & { readonly target: ConversationLinkTarget; readonly signal?: AbortSignal },
): Promise<ApiResult<ConversationCard | null>> {
  if (__FIXTURES__ && params.source === 'fixtures') return { ok: true, data: null };
  const result = await params.transport.request<unknown>({ method: 'GET', path: cardPathOf(params.target), ...withSignal(params.signal) });
  if (!result.ok) return result.status === 404 ? { ok: true, data: null } : result;
  const card = decodeConversationCard(result.data);
  return card === null ? { ok: false, status: 0, error: 'Carte illisible', code: UNREADABLE_CARD } : { ok: true, data: card };
}

export function conversationCardQueryOptions(deps: ConversationCardDeps, target: ConversationLinkTarget) {
  return {
    queryKey: conversationCardQueryKey(target),
    staleTime: CONVERSATION_CARD_STALE_TIME,
    retry: false,
    queryFn: async ({ signal }: { readonly signal?: AbortSignal }) =>
      unwrap(await loadConversationCard({ ...deps, target, ...withSignal(signal) })),
  };
}

/**
 * QUITTER — la route EXISTANTE `POST /api/v1/conversations/:id/leave`
 * (`routes/conversations/leave.ts`), jamais une jumelle : le participant passe
 * inactif, l'historique reste lisible.
 */
export async function leaveConversation(deps: ConversationCardDeps, conversationId: string): Promise<ApiResult<unknown>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return { ok: true, data: null };
  return deps.transport.request<unknown>({
    method: 'POST',
    path: `/api/v1/conversations/${encodeURIComponent(conversationId)}/leave`,
  });
}

/**
 * LA CARTE APRÈS LE GESTE, AVANT LA RÉPONSE — l'état optimiste de Rejoindre et
 * de Quitter. La jonction ne se rouvre que sur un lien de partage actif ; la
 * jonction anonyme, que si le lien n'exige pas de compte.
 */
export function cardWithMembership(
  card: ConversationCard,
  membership: { readonly isMember: boolean; readonly conversationId: string | null },
): ConversationCard {
  if (card.viewer.isMember === membership.isMember) return { ...card, conversationId: membership.conversationId ?? card.conversationId };
  const joinable = !membership.isMember && card.kind === 'share-link' && card.link?.isActive === true;
  return {
    ...card,
    conversationId: membership.conversationId,
    stats: { ...card.stats, memberCount: Math.max(0, card.stats.memberCount + (membership.isMember ? 1 : -1)) },
    viewer: {
      isMember: membership.isMember,
      canJoin: joinable,
      requiresAccount: card.viewer.requiresAccount,
      canJoinAnonymously: joinable && !card.viewer.requiresAccount,
    },
  };
}
