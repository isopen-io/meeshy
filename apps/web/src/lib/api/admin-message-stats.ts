import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';

import type { AdminDeps } from './admin';
import { countEntries, decoded, nonNegative, recordOf, textOf, withQuery } from './admin-analytics-decode';
import type { ApiResult } from './http';

/**
 * **LES STATISTIQUES DE MESSAGES — SANS UN SEUL CONTENU** (#8876, #6728) —
 * `GET /admin/messages/{stats,trends,engagement}`.
 *
 * **Ce port n'appelle JAMAIS `adminEndpoints.messages` ni
 * `adminEndpoints.translations`** (#6919) : ces deux routes rendent le TEXTE des
 * messages de toutes les conversations, sans motif écrit. Le contenu d'un
 * message ne se lit que par la lecture souveraine d'une conversation, qui exige
 * un motif. Ici, des COMPTES — et un témoin (`admin-analytics.test.tsx`) relit
 * les appels partis pour le garantir.
 *
 * ## Le pic se lit par INDICE
 *
 * `messagesTrends` sert « Dimanche », « Mardi » en français : on lit l'indice
 * (0 = dimanche) et le jour se nomme dans la langue d'interface. Les heures et
 * les jours sont comptés en UTC par la passerelle.
 *
 * Clés sous `['admin', 'analytics', 'messages']` : jamais persistées.
 */
export type MessagesPeriod = '24h' | '7d' | '30d' | '90d';
export type EngagementPeriod = '7d' | '30d';

export const messageStatsKeys = {
  stats: (period: MessagesPeriod) => ['admin', 'analytics', 'messages', 'stats', period] as const,
  trends: () => ['admin', 'analytics', 'messages', 'trends'] as const,
  engagement: (period: EngagementPeriod) => ['admin', 'analytics', 'messages', 'engagement', period] as const,
};

type Request = AdminDeps & { readonly signal?: AbortSignal };

const read = (params: Request, path: string): Promise<ApiResult<unknown>> =>
  params.transport.request<unknown>({ method: 'GET', path, ...(params.signal === undefined ? {} : { signal: params.signal }) });

// --- Les statistiques de la période ---------------------------------------------

/**
 * Un des dix comptes qui ont envoyé le plus de messages. **`guest`** : la
 * passerelle ne résout que les comptes (`Participant.user`) ; pour un invité elle
 * sert le littéral `Unknown` à la place du pseudo et l'identifiant du
 * PARTICIPANT à la place de celui du membre. Ce décodeur lit ce signe UNE fois,
 * à la frontière : le reste de l'écran sait « invité » et n'a plus à connaître le
 * littéral.
 */
export type TopSender = {
  readonly userId: string;
  readonly username: string | null;
  readonly displayName: string | null;
  readonly messageCount: number;
  readonly guest: boolean;
};

export type DailyCount = { readonly date: string; readonly count: number };

/**
 * `translatedPercentage` et `attachmentRate` sont en 0–100 ; `averageLength`
 * en caractères ; `byType` est trié du plus fréquent au plus rare ; `byDay`
 * garde les dates réelles (`YYYY-MM-DD`, jours UTC) dans l'ordre servi.
 */
export type MessagesStats = {
  readonly totalMessages: number | null;
  readonly deletedMessages: number | null;
  readonly editedMessages: number | null;
  readonly averageLength: number | null;
  readonly translatedMessages: number | null;
  readonly translatedPercentage: number | null;
  readonly messagesWithAttachments: number | null;
  readonly attachmentRate: number | null;
  readonly byType: readonly { readonly type: string; readonly count: number }[];
  readonly byDay: readonly DailyCount[];
  readonly topSenders: readonly TopSender[];
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const GUEST_USERNAME = 'Unknown';

function decodeTopSender(raw: unknown): TopSender | null {
  const record = recordOf(raw);
  const userId = textOf(record?.userId);
  const messageCount = nonNegative(record?.messageCount);
  if (userId === null || messageCount === null) return null;

  const username = textOf(record?.username);
  const displayName = textOf(record?.displayName);
  const guest = displayName === null && (username === null || username === GUEST_USERNAME);
  return { userId, username: username === GUEST_USERNAME ? null : username, displayName, messageCount, guest };
}

function decodeDay(raw: unknown): DailyCount | null {
  const record = recordOf(raw);
  const date = textOf(record?.date);
  const count = nonNegative(record?.count);
  return date === null || !DAY.test(date) || count === null ? null : { date, count };
}

export function decodeMessagesStats(raw: unknown): MessagesStats | null {
  const payload = recordOf(raw);
  if (payload === null) return null;
  const list = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);

  return {
    totalMessages: nonNegative(payload.totalMessages),
    deletedMessages: nonNegative(payload.deletedMessages),
    editedMessages: nonNegative(payload.editedMessages),
    averageLength: nonNegative(payload.averageLength),
    translatedMessages: nonNegative(payload.translatedMessages),
    translatedPercentage: nonNegative(payload.translatedPercentage),
    messagesWithAttachments: nonNegative(payload.messagesWithAttachments),
    attachmentRate: nonNegative(payload.attachmentRate),
    byType: countEntries(payload.messagesByType).map((entry) => ({ type: entry.key, count: entry.count })),
    byDay: list(payload.messagesByPeriod).flatMap((row) => decodeDay(row) ?? []),
    topSenders: list(payload.topSenders).flatMap((row) => decodeTopSender(row) ?? []),
  };
}

export async function loadMessagesStats(params: Request & { readonly period: MessagesPeriod }): Promise<ApiResult<MessagesStats>> {
  return decoded(await read(params, withQuery(adminEndpoints.messagesStats, { period: params.period })), decodeMessagesStats, 'Statistiques de messages');
}

// --- Le rythme de la semaine ----------------------------------------------------

export type Peak = { readonly index: number; readonly count: number };

/**
 * Les 24 heures et les 7 jours, par POSITION (l'heure 0 à 23 ; le jour 0 =
 * dimanche), sur les 7 derniers jours en UTC. `peakHour` / `peakWeekday` sont
 * `null` quand aucun message n'a été écrit : un « pic à minuit » sans message
 * serait un mensonge que le serveur sert (son repli vaut heure 0, compte 0).
 */
export type MessagesTrends = {
  readonly peakHour: Peak | null;
  readonly peakWeekday: Peak | null;
  readonly hourly: readonly number[];
  readonly weekday: readonly number[];
};

function decodeCounts(raw: unknown, length: number, key: string): readonly number[] | null {
  if (!Array.isArray(raw) || raw.length !== length) return null;
  const counts = raw.map((row) => nonNegative(recordOf(row)?.[key]));
  return counts.every((count): count is number => count !== null) ? counts : null;
}

function decodePeak(raw: unknown, indexKey: string, limit: number): Peak | null {
  const record = recordOf(raw);
  const index = nonNegative(record?.[indexKey]);
  const count = nonNegative(record?.count);
  if (index === null || count === null || count === 0 || !Number.isInteger(index) || index >= limit) return null;
  return { index, count };
}

export function decodeMessagesTrends(raw: unknown): MessagesTrends | null {
  const payload = recordOf(raw);
  const hourly = decodeCounts(payload?.hourlyActivity, 24, 'count');
  const weekday = decodeCounts(payload?.weekdayActivity, 7, 'count');
  if (payload === null || hourly === null || weekday === null) return null;
  return {
    peakHour: decodePeak(payload.peakHour, 'hour', 24),
    peakWeekday: decodePeak(payload.peakWeekday, 'day', 7),
    hourly,
    weekday,
  };
}

export async function loadMessagesTrends(params: Request): Promise<ApiResult<MessagesTrends>> {
  return decoded(await read(params, adminEndpoints.messagesTrends), decodeMessagesTrends, 'Tendances');
}

// --- L'engagement --------------------------------------------------------------

/** `reactionRate` et `replyRate` sont en 0–100 ; les moyennes par message ont une décimale. */
export type MessagesEngagement = {
  readonly totalMessages: number | null;
  readonly messagesWithReactions: number | null;
  readonly messagesWithReplies: number | null;
  readonly totalReactions: number | null;
  readonly totalReplies: number | null;
  readonly reactionRate: number | null;
  readonly replyRate: number | null;
  readonly avgReactionsPerMessage: number | null;
  readonly avgRepliesPerMessage: number | null;
};

export function decodeMessagesEngagement(raw: unknown): MessagesEngagement | null {
  const payload = recordOf(raw);
  if (payload === null) return null;
  return {
    totalMessages: nonNegative(payload.totalMessages),
    messagesWithReactions: nonNegative(payload.messagesWithReactions),
    messagesWithReplies: nonNegative(payload.messagesWithReplies),
    totalReactions: nonNegative(payload.totalReactions),
    totalReplies: nonNegative(payload.totalReplies),
    reactionRate: nonNegative(payload.reactionRate),
    replyRate: nonNegative(payload.replyRate),
    avgReactionsPerMessage: nonNegative(payload.avgReactionsPerMessage),
    avgRepliesPerMessage: nonNegative(payload.avgRepliesPerMessage),
  };
}

export async function loadMessagesEngagement(params: Request & { readonly period: EngagementPeriod }): Promise<ApiResult<MessagesEngagement>> {
  return decoded(await read(params, withQuery(adminEndpoints.messagesEngagement, { period: params.period })), decodeMessagesEngagement, 'Engagement');
}
