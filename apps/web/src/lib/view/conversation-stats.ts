import type { ConversationStatsDay, ConversationStatsLanguage, ConversationStatsParticipant } from '@/lib/api/conversation-stats';

/**
 * **LES STATISTIQUES D'UNE CONVERSATION, MISES EN FORME** (#7835) — miroir des
 * calculs de `ConversationDashboardView.swift` : la série d'activité d'une
 * période, les participants les plus actifs, la part de chaque langue.
 *
 * Les jours sont des clés UTC `AAAA-MM-JJ`, celles que la passerelle écrit
 * (`ConversationMessageStatsService`, `toISOString().slice(0, 10)`), qui n'en
 * garde que quatre-vingt-dix.
 */
export type StatsPeriod = 'week' | 'month' | 'all';

export const STATS_PERIODS: readonly StatsPeriod[] = ['week', 'month', 'all'];

/** Les dix plus actifs, comme iOS (`participants.prefix(10)`). */
export const TOP_PARTICIPANTS = 10;

const DAY_MS = 86_400_000;

const PERIOD_DAYS: Readonly<Record<Exclude<StatsPeriod, 'all'>, number>> = { week: 7, month: 30 };

const dayKey = (time: number): string => new Date(time).toISOString().slice(0, 10);
const timeOf = (key: string): number => Date.parse(`${key}T00:00:00.000Z`);

/** Aujourd'hui, en clé UTC — l'horloge de la passerelle. */
export const todayKey = (now: number = Date.now()): string => dayKey(now);

/**
 * Une barre par jour, de la plus ancienne à aujourd'hui, les jours muets à
 * zéro. « Depuis le début » part du premier jour connu, et jamais de moins
 * d'une semaine : une conversation née hier ne se dessine pas en une barre.
 */
export function activitySeries(daily: readonly ConversationStatsDay[], period: StatsPeriod, today: string): ConversationStatsDay[] {
  const end = timeOf(today);
  const counts = new Map(daily.map((day) => [day.date, day.count]));
  const firstKnown = daily.reduce((earliest, day) => Math.min(earliest, timeOf(day.date)), end);
  const start = period === 'all' ? Math.min(firstKnown, end - (PERIOD_DAYS.week - 1) * DAY_MS) : end - (PERIOD_DAYS[period] - 1) * DAY_MS;
  const days = Math.round((end - start) / DAY_MS) + 1;
  return Array.from({ length: days }, (_, index) => {
    const date = dayKey(start + index * DAY_MS);
    return { date, count: counts.get(date) ?? 0 };
  });
}

export const seriesTotal = (series: readonly ConversationStatsDay[]): number => series.reduce((sum, day) => sum + day.count, 0);

/** Les plus actifs d'abord ; un participant sans nom n'est pas montré — un identifiant brut n'est pas un nom. */
export const topParticipants = (participants: readonly ConversationStatsParticipant[]): ConversationStatsParticipant[] =>
  participants
    .filter((participant) => participant.name.trim() !== '')
    .sort((left, right) => right.messageCount - left.messageCount)
    .slice(0, TOP_PARTICIPANTS);

export type LanguageShare = ConversationStatsLanguage & { readonly percent: number };

export function languageShares(languages: readonly ConversationStatsLanguage[]): LanguageShare[] {
  const total = languages.reduce((sum, entry) => sum + entry.count, 0);
  if (total === 0) return [];
  return languages
    .filter((entry) => entry.count > 0)
    .sort((left, right) => right.count - left.count)
    .map((entry) => ({ ...entry, percent: Math.round((entry.count / total) * 100) }));
}
