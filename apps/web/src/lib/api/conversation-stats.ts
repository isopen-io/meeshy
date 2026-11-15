import * as z from 'zod/mini';
import * as conversationsEndpoints from '@meeshy/shared/api/endpoints/conversations';

import { unwrap } from './client';
import type { ConversationsDeps } from './conversations';
import type { ApiResult } from './http';

/**
 * **LES STATISTIQUES D'UNE CONVERSATION** (#7835) — le port de l'onglet Stats
 * de `ConversationInfoSheet.swift` (`ConversationDashboardView`, qui lit
 * `ConversationAnalysisService.fetchStats`).
 *
 * `GET conversations.byIdStats` (`services/gateway/src/routes/conversations/stats.ts`) :
 * des compteurs PRÉ-AGRÉGÉS, servis à un membre INSCRIT (`requiredAuth`,
 * `allowAnonymous: false`) qui a accès à la conversation — refus sinon, comme
 * une conversation introuvable. La route ne porte AUCUN effectif de membres :
 * la règle `presentMemberCount` n'a rien à y plafonner. Les participants
 * nommés sont ceux qui ont ÉCRIT, et la feuille n'en montre que les dix plus
 * actifs, comme iOS — moins que le listing qu'un simple membre reçoit déjà
 * (`ACTIVE_MEMBER_LISTING_LIMIT`).
 *
 * Toute clé est facultative au décodage : une conversation sans message sert
 * une charge presque vide, qui se lit comme des zéros, jamais comme une erreur.
 */
export type ConversationStatsContentTypes = {
  readonly text: number;
  readonly image: number;
  readonly audio: number;
  readonly video: number;
  readonly file: number;
  readonly location: number;
};

export type ConversationStatsParticipant = {
  readonly userId: string;
  /** Nom affiché, sinon pseudo ; vide quand la passerelle ne connaît ni l'un ni l'autre. */
  readonly name: string;
  readonly avatar: string | undefined;
  readonly messageCount: number;
  readonly wordCount: number;
};

export type ConversationStatsDay = { readonly date: string; readonly count: number };
export type ConversationStatsLanguage = { readonly language: string; readonly count: number };

export type ConversationStats = {
  readonly totalMessages: number;
  readonly totalWords: number;
  readonly contentTypes: ConversationStatsContentTypes;
  readonly participants: readonly ConversationStatsParticipant[];
  readonly dailyActivity: readonly ConversationStatsDay[];
  readonly languages: readonly ConversationStatsLanguage[];
};

/** Des compteurs pré-agrégés : cinq minutes avant de revalider, comme une liste. */
export const CONVERSATION_STATS_STALE_TIME = 5 * 60_000;

/** Une clé HORS de `['conversations', …]` — même raison que `conversationMembersQueryKey`. */
export const conversationStatsQueryKey = (conversationId: string) => ['conversation-stats', conversationId] as const;

const count = z.optional(z.nullable(z.number()));
const text = z.optional(z.nullable(z.string()));

const WireParticipant = z.object({
  userId: z.string(),
  username: text,
  displayName: text,
  name: text,
  avatar: text,
  messageCount: count,
  wordCount: count,
});

const WireDay = z.object({ date: z.string(), count: count });
const WireLanguage = z.object({ language: z.string(), count: count });

const WireStats = z.object({
  totalMessages: count,
  totalWords: count,
  contentTypes: z.optional(
    z.nullable(z.object({ text: count, image: count, audio: count, video: count, file: count, location: count })),
  ),
  participantStats: z.optional(z.nullable(z.array(z.unknown()))),
  dailyActivity: z.optional(z.nullable(z.array(z.unknown()))),
  languageDistribution: z.optional(z.nullable(z.array(z.unknown()))),
});

const present = (value: string | null | undefined): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value : undefined;

const atLeastZero = (value: number | null | undefined): number => (typeof value === 'number' && value > 0 ? value : 0);

/** Une ligne illisible est ÉCARTÉE, jamais la charge entière : le reste des statistiques reste juste. */
type RowSchema<R> = { readonly safeParse: (raw: unknown) => { readonly success: true; readonly data: R } | { readonly success: false } };

const decodedRows = <R, T>(rows: readonly unknown[] | null | undefined, schema: RowSchema<R>, map: (row: R) => T): T[] =>
  (rows ?? []).flatMap((raw) => {
    const parsed = schema.safeParse(raw);
    return parsed.success ? [map(parsed.data)] : [];
  });

export function decodeConversationStats(raw: unknown): ConversationStats | null {
  const parsed = WireStats.safeParse(raw);
  if (!parsed.success) return null;
  const wire = parsed.data;
  const types = wire.contentTypes ?? {};
  return {
    totalMessages: atLeastZero(wire.totalMessages),
    totalWords: atLeastZero(wire.totalWords),
    contentTypes: {
      text: atLeastZero(types.text),
      image: atLeastZero(types.image),
      audio: atLeastZero(types.audio),
      video: atLeastZero(types.video),
      file: atLeastZero(types.file),
      location: atLeastZero(types.location),
    },
    participants: decodedRows(wire.participantStats, WireParticipant, (row) => ({
      userId: row.userId,
      name: present(row.displayName) ?? present(row.username) ?? present(row.name) ?? '',
      avatar: present(row.avatar),
      messageCount: atLeastZero(row.messageCount),
      wordCount: atLeastZero(row.wordCount),
    })),
    dailyActivity: decodedRows(wire.dailyActivity, WireDay, (row) => ({ date: row.date, count: atLeastZero(row.count) })),
    languages: decodedRows(wire.languageDistribution, WireLanguage, (row) => ({ language: row.language, count: atLeastZero(row.count) })),
  };
}

const EMPTY_STATS: ConversationStats = decodeConversationStats({}) as ConversationStats;

export async function loadConversationStats(
  params: ConversationsDeps & { readonly conversationId: string; readonly signal?: AbortSignal },
): Promise<ApiResult<ConversationStats>> {
  if (__FIXTURES__ && params.source === 'fixtures') return { ok: true, data: EMPTY_STATS };
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: conversationsEndpoints.byIdStats(params.conversationId),
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;
  const stats = decodeConversationStats(result.data);
  return stats === null ? { ok: false, status: 0, error: 'Statistiques illisibles' } : { ok: true, data: stats };
}

export function conversationStatsQueryOptions(deps: ConversationsDeps, conversationId: string) {
  return {
    queryKey: conversationStatsQueryKey(conversationId),
    staleTime: CONVERSATION_STATS_STALE_TIME,
    queryFn: async ({ signal }: { readonly signal?: AbortSignal }) =>
      unwrap(await loadConversationStats({ ...deps, conversationId, ...(signal === undefined ? {} : { signal }) })),
  };
}
