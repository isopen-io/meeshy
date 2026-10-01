import { conversationEngagementForDay, type ConversationEngagementSnapshot } from '@meeshy/shared/types/engagement-scale';

import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * LA PASTILLE « 🔥 4 · 120 » (#8906, #9044) — ce qu'elle MONTRE, loi pure :
 * la série en jours et le total des points. Les points du jour vivent sous
 * l'avatar replié (`HeaderFlame`), pas ici.
 *
 * Toujours relue au JOUR du lecteur (`conversationEngagementForDay`) : un
 * instantané d'hier affiche 0 aujourd'hui après minuit, et une série dont le
 * dernier geste date d'avant-hier tombe — sans attendre un événement serveur.
 * Aucun instantané, ou zéro point depuis toujours ⇒ rien (`null`).
 */
export type EngagementPillModel = {
  /** Série en jours, 0 quand elle est tombée. */
  readonly streakDays: number;
  /** N — les points rapportés par la conversation depuis toujours. */
  readonly totalPoints: number;
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
  const total = String(shown.totalPoints);
  const todayPoints = String(shown.todayPoints);
  const points = translate(
    language,
    shown.totalPoints === 1 ? 'engagement.pill.points.one' : 'engagement.pill.points.other',
    { total, today: todayPoints },
  );
  const label =
    shown.streakDays > 0
      ? translate(language, 'engagement.pill.join', {
          streak: translate(
            language,
            shown.streakDays === 1 ? 'engagement.pill.streak.one' : 'engagement.pill.streak.other',
            { count: String(shown.streakDays) },
          ),
          points,
        })
      : points;
  return { streakDays: shown.streakDays, totalPoints: shown.totalPoints, label };
}

/**
 * LA SÉRIE À CÔTÉ DE L'HEURE (directive porteur 2026-10-01) — « 🔥4 · 120 » :
 * la série en jours, puis le total des points de la conversation. Elle ne se
 * montre que tant que la série COURT, relue au jour du lecteur.
 */
export type StreakMarkModel = {
  readonly streakDays: number;
  readonly totalPoints: number;
  readonly label: string;
};

export function streakMarkModel(
  snapshot: ConversationEngagementSnapshot | undefined,
  today: string,
  language: InterfaceLanguage,
): StreakMarkModel | null {
  const pill = engagementPillModel(snapshot, today, language);
  if (snapshot === undefined || pill === null || pill.streakDays <= 0) return null;
  return pill;
}
