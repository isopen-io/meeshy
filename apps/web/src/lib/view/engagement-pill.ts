import { conversationEngagementForDay, type ConversationEngagementSnapshot } from '@meeshy/shared/types/engagement-scale';

import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { compactCount } from '@/lib/view/compact-count';

/**
 * LES POINTS D'UNE CONVERSATION (#8906, #9044, #9570) — ce que la pastille de
 * l'en-tête et la marque de la liste MONTRENT, loi pure, en TROIS formes :
 *
 * - `streak` — une série COURT : « 🔥 4 · 1,2 k », la série en jours et le
 *   total des points, abrégé dans la langue du lecteur (`compactCount`). Le
 *   rouge et la flamme appartiennent à cette forme seule ;
 * - `total` — aucune série ne court : le cumul SEUL, « 1,2 k », sans flamme ;
 *   la surface le peint à l'encre tertiaire (directive porteur 2026-10-07 :
 *   « lorsqu'une série n'est pas en cours on n'affiche pas la flamme, juste le
 *   cumul de points de la conversation ») ;
 * - `null` — aucun instantané, ou zéro point depuis toujours : rien.
 *
 * Les points du jour vivent sous l'avatar replié (`HeaderFlame`), qui ne lit
 * que la forme `streak`.
 *
 * Toujours relue au JOUR du lecteur (`conversationEngagementForDay`) : un
 * instantané d'hier affiche 0 aujourd'hui après minuit, et une série dont le
 * dernier geste date d'avant-hier tombe — la marque passe alors au cumul seul,
 * sans attendre un événement serveur.
 */
export type EngagementPillModel =
  | {
      readonly kind: 'streak';
      /** Série en jours, toujours > 0. */
      readonly streakDays: number;
      /** N — les points rapportés par la conversation depuis toujours, abrégés. */
      readonly totalText: string;
      /** Le nom accessible, en mots, dans la langue d'interface. */
      readonly label: string;
    }
  | {
      readonly kind: 'total';
      /** N, abrégé — toujours > 0. */
      readonly totalText: string;
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
  const totalText = compactCount(shown.totalPoints, language);
  if (shown.streakDays <= 0) {
    const key = shown.totalPoints === 1 ? 'engagement.pill.total.one' : 'engagement.pill.total.other';
    return { kind: 'total', totalText, label: translate(language, key, { total }) };
  }
  const points = translate(
    language,
    shown.totalPoints === 1 ? 'engagement.pill.points.one' : 'engagement.pill.points.other',
    { total, today: String(shown.todayPoints) },
  );
  const label = translate(language, 'engagement.pill.join', {
    streak: translate(language, shown.streakDays === 1 ? 'engagement.pill.streak.one' : 'engagement.pill.streak.other', {
      count: String(shown.streakDays),
    }),
    points,
  });
  return { kind: 'streak', streakDays: shown.streakDays, totalText, label };
}

/**
 * LA MARQUE À CÔTÉ DE L'HEURE (directive porteur 2026-10-01, #9570) —
 * « 🔥4 · 120 » tant que la série COURT, le cumul seul « 120 » sinon, rien
 * pour un cumul nul : la même loi que la pastille, relue au jour du lecteur.
 */
export type StreakMarkModel = EngagementPillModel;

export const streakMarkModel = engagementPillModel;
