import type { InfiniteData } from '@tanstack/react-query';
import * as z from 'zod/mini';

import { unwrap } from './client';
import type { ConversationsDeps } from './conversations';
import type { ApiResult } from './http';
import type { Participant } from './types';
import { participantAvatarOf } from '@/lib/view/conversation';

/**
 * **LES MEMBRES D'UNE CONVERSATION** (#7829) — le port de l'onglet « Membres »
 * de la feuille de détails, miroir de ce que lit `ConversationInfoSheet.swift`.
 *
 * `GET /api/v1/conversations/:id/participants?limit=&cursor=`
 * (`services/gateway/src/routes/conversations/participants-reads.ts:89`) —
 * paginé par CURSEUR (id du participant), `pagination` posée à la RACINE de
 * l'enveloppe (`{ nextCursor, hasMore, totalCount }`, la route ne passe pas
 * par `sendSuccess`, son doc-comment dit pourquoi). Chaque ligne est
 * `serializeConversationParticipant` (`packages/shared/utils/participant-helpers.ts`) :
 * une forme APLATIE, où la photo est DÉJÀ résolue et où `username` vaut le
 * NOM LOCAL quand le participant n'a pas de compte — d'où la règle ci-dessous.
 *
 * La présence n'est pas lue ici : la feuille n'en peint aucune, et la
 * passerelle ne la sert qu'aux amis (directive 2026-08-25).
 */
export type ConversationMember = {
  readonly id: string;
  readonly userId: string | null;
  /** `null` pour un participant ANONYME : son « pseudo » servi est son nom local, pas une adresse. */
  readonly username: string | null;
  readonly displayName: string;
  readonly avatar: string | undefined;
  /** `creator` · `admin` · `moderator` · `member`, tel que la conversation le stocke. */
  readonly role: string;
};

export type ConversationMembersPage = {
  readonly members: readonly ConversationMember[];
  readonly nextCursor: string | null;
  readonly totalCount: number | null;
};

export type ConversationMembersData = InfiniteData<ConversationMembersPage, unknown>;

export const MEMBERS_PAGE_SIZE = 50;
export const MEMBERS_STALE_TIME = 60_000;

/**
 * Une clé HORS de `['conversations', …]` : ce préfixe porte des conversations,
 * et plusieurs sites le parcourent en supposant cette forme.
 */
export const conversationMembersQueryKey = (conversationId: string) => ['conversation-members', conversationId] as const;

const text = z.optional(z.nullable(z.string()));

const WireMember = z.object({
  id: z.string(),
  userId: text,
  type: text,
  username: text,
  displayName: text,
  firstName: text,
  lastName: text,
  avatar: text,
  conversationRole: text,
});

const WirePagination = z.object({
  hasMore: z.optional(z.boolean()),
  nextCursor: text,
  totalCount: z.optional(z.number()),
});

const present = (value: string | null | undefined): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value : undefined;

export function decodeConversationMember(raw: unknown): ConversationMember | null {
  const parsed = WireMember.safeParse(raw);
  if (!parsed.success) return null;
  const wire = parsed.data;
  const userId = present(wire.userId) ?? null;
  const anonymous = wire.type === 'anonymous' || userId === null;
  const fullName = [present(wire.firstName), present(wire.lastName)].filter((part) => part !== undefined).join(' ');
  const username = anonymous ? null : (present(wire.username) ?? null);
  return {
    id: wire.id,
    userId,
    username,
    displayName: present(wire.displayName) ?? present(fullName) ?? username ?? '',
    avatar: present(wire.avatar),
    role: present(wire.conversationRole) ?? 'member',
  };
}

/**
 * LA MÊME FORME DEPUIS LE CACHE — les participants que la conversation porte
 * déjà (la passerelle en sert cinq dans la liste). C'est ce que la feuille
 * peint à l'ouverture, avant toute réponse : cache d'abord.
 */
export function memberFromParticipant(participant: Participant): ConversationMember {
  const anonymous = participant.type === 'anonymous' || participant.userId === undefined;
  const username = anonymous ? null : (present(participant.user?.username) ?? null);
  return {
    id: participant.id,
    userId: participant.userId ?? null,
    username,
    displayName: present(participant.displayName) ?? present(participant.user?.displayName) ?? username ?? '',
    avatar: participantAvatarOf(participant),
    role: present(participant.role) ?? 'member',
  };
}

const membersPath = (conversationId: string, cursor: string | null): string => {
  const query = new URLSearchParams({ limit: String(MEMBERS_PAGE_SIZE) });
  if (cursor !== null) query.set('cursor', cursor);
  return `/api/v1/conversations/${encodeURIComponent(conversationId)}/participants?${query.toString()}`;
};

export async function loadConversationMembers(
  params: ConversationsDeps & { readonly conversationId: string; readonly cursor: string | null; readonly signal?: AbortSignal },
): Promise<ApiResult<ConversationMembersPage>> {
  if (__FIXTURES__ && params.source === 'fixtures') {
    const { conversationById } = await import('./fixtures');
    const conversation = conversationById(params.conversationId);
    if (conversation === undefined) return { ok: false, status: 404, error: 'Conversation not found' };
    return {
      ok: true,
      data: { members: conversation.participants.map(memberFromParticipant), nextCursor: null, totalCount: conversation.memberCount },
    };
  }
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: membersPath(params.conversationId, params.cursor),
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;
  const members = (Array.isArray(result.data) ? result.data : []).flatMap((raw) => {
    const member = decodeConversationMember(raw);
    return member === null ? [] : [member];
  });
  const pagination = WirePagination.safeParse(result.pagination);
  const paged = pagination.success ? pagination.data : {};
  const cursor = paged.hasMore === true ? (present(paged.nextCursor) ?? null) : null;
  return { ok: true, data: { members, nextCursor: cursor, totalCount: paged.totalCount ?? null } };
}

type PageContext = { readonly pageParam: string | null; readonly signal?: AbortSignal };

export function conversationMembersQueryOptions(deps: ConversationsDeps, conversationId: string) {
  return {
    queryKey: conversationMembersQueryKey(conversationId),
    staleTime: MEMBERS_STALE_TIME,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }: PageContext) =>
      unwrap(
        await loadConversationMembers({ ...deps, conversationId, cursor: pageParam, ...(signal === undefined ? {} : { signal }) }),
      ),
    getNextPageParam: (page: ConversationMembersPage) => page.nextCursor ?? undefined,
  };
}

export const flattenConversationMembers = (data: ConversationMembersData | undefined): readonly ConversationMember[] | undefined =>
  data?.pages.flatMap((page) => page.members);
