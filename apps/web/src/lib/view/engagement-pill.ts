import { conversationEngagementForDay, type ConversationEngagementSnapshot } from '@meeshy/shared/types/engagement-scale';

import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { compactCount } from '@/lib/view/compact-count';

/**
 * LA PASTILLE « 🔥 4 · 1,2 k » (#8906, #9044) — ce qu'elle MONTRE, loi pure :
 * la série en jours et le total des points, abrégé dans la langue du lecteur
 * (`compactCount`). Sans série EN COURS, rien : ni flamme ni points. Les
 * points du jour vivent sous l'avatar replié (`HeaderFlame`), pas ici.
 *
 * Toujours relue au JOUR du lecteur (`conversationEngagementForDay`) : un
 * instantané d'hier affiche 0 aujourd'hui après minuit, et une série dont le
 * dernier geste date d'avant-hier tombe — sans attendre un événement serveur.
 * Aucun instantané, ou zéro point depuis toujours ⇒ rien (`null`).
 */
export type EngagementPillModel = {
  /** Série en jours, toujours > 0. */
  readonly streakDays: number;
  /** N — les points rapportés par la conversation depuis toujours, abrégés. */
  readonly totalText: string;
  /** Le nom accessible, en mots, dans la langue d'interface. */
  readonly label: string;
};

const pad = (value: number): string => String(value).padStart(2, '0');

/** Le jour civil LOCAL (`YYYY-MM-DD`) d'un instant — le fuseau du lecteur, jamais UTC. */
export function localDayOf(epochMs: number): string {
  const date = new Date(epochMs);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function engagementPillModel(
  snapshot: ConversationEngagementSnapshot | undefined,
  today: string,
  language: InterfaceLanguage,
): EngagementPillModel | null {
  if (snapshot === undefined || snapshot.totalPoints <= 0) return null;
  const shown = conversationEngagementForDay(snapshot, today);
  if (shown.streakDays <= 0) return null;
  const total = String(shown.totalPoints);
  const todayPoints = String(shown.todayPoints);
  const points = translate(
    language,
    shown.totalPoints === 1 ? 'engagement.pill.points.one' : 'engagement.pill.points.other',
    { total, today: todayPoints },
  );
  const label = translate(language, 'engagement.pill.join', {
    streak: translate(language, shown.streakDays === 1 ? 'engagement.pill.streak.one' : 'engagement.pill.streak.other', {
      count: String(shown.streakDays),
    }),
    points,
  });
  return { streakDays: shown.streakDays, totalText: compactCount(shown.totalPoints, language), label };
}

/**
 * LA SÉRIE À CÔTÉ DE L'HEURE (directive porteur 2026-10-01) — « 🔥4 · 120 » :
 * la série en jours, puis le total abrégé des points de la conversation. Elle
 * ne se montre que tant que la série COURT, relue au jour du lecteur — la
 * même loi que la pastille.
 */
export type StreakMarkModel = EngagementPillModel;

export const streakMarkModel = engagementPillModel;
