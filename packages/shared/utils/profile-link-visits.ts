/**
 * Les visites de mon lien de profil (#19206, chantier #18857) — « 1 719 visites ce mois ·
 * 57 aujourd'hui » sur le billet « Mon lien », le widget « Mon lien · 57 visites aujourd'hui ».
 *
 * La passerelle ne garde qu'un AGRÉGAT : une ligne par propriétaire et par jour UTC
 * (`ProfileLinkVisitDay`), sans IP, sans identifiant de visiteur, sans ville. Tout ce que le
 * propriétaire lit se déduit de ces lignes, ici, et nulle part ailleurs.
 *
 * Le jour et le mois sont ceux d'UTC : le serveur ne connaît pas le fuseau du lecteur au moment
 * du compte, et deux frontières différentes donneraient deux totaux pour la même visite.
 */
import { addUtcDays, utcDayKey, utcDayStart } from './iso-week';

/** La série rendue au propriétaire : les trente derniers jours, aujourd'hui compris. */
export const PROFILE_LINK_VISIT_SERIES_DAYS = 30;

/** Le mois calendaire le plus long (31 j) et la série (30 j), plus une marge de neuf jours. */
export const PROFILE_LINK_VISIT_RETENTION_DAYS = 40;

export type ProfileLinkVisitRow = { readonly day: Date; readonly visits: number };

export type ProfileLinkVisitPoint = { readonly day: string; readonly visits: number };

export type ProfileLinkVisitStats = {
  readonly today: number;
  readonly month: number;
  readonly series: readonly ProfileLinkVisitPoint[];
};

const monthKey = (date: Date): string => utcDayKey(date).slice(0, 7);

/** Le premier jour lu : celui de la série ou le 1er du mois, le plus ancien des deux. */
export function profileLinkVisitWindowStart(now: Date): Date {
  const seriesStart = addUtcDays(utcDayStart(now), -(PROFILE_LINK_VISIT_SERIES_DAYS - 1));
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return seriesStart < monthStart ? seriesStart : monthStart;
}

export function profileLinkVisitStats(rows: readonly ProfileLinkVisitRow[], now: Date): ProfileLinkVisitStats {
  const byDay = rows.reduce<ReadonlyMap<string, number>>((acc, row) => {
    const key = utcDayKey(row.day);
    return new Map(acc).set(key, (acc.get(key) ?? 0) + Math.max(0, row.visits));
  }, new Map());
  const todayStart = utcDayStart(now);
  const todayKey = utcDayKey(todayStart);
  const currentMonth = monthKey(todayStart);
  const series = Array.from({ length: PROFILE_LINK_VISIT_SERIES_DAYS }, (_, index) => {
    const key = utcDayKey(addUtcDays(todayStart, index - (PROFILE_LINK_VISIT_SERIES_DAYS - 1)));
    return { day: key, visits: byDay.get(key) ?? 0 };
  });
  const month = [...byDay.entries()]
    .filter(([key]) => key.slice(0, 7) === currentMonth && key <= todayKey)
    .reduce((sum, [, visits]) => sum + visits, 0);
  return { today: byDay.get(todayKey) ?? 0, month, series };
}

/** Le contrat JSON de `GET /users/me/profile-link/stats` (déclaré : `fast-json-stringify` retire le reste). */
export const profileLinkVisitStatsJsonSchema = {
  type: 'object',
  properties: {
    today: { type: 'integer' },
    month: { type: 'integer' },
    series: {
      type: 'array',
      items: {
        type: 'object',
        properties: { day: { type: 'string' }, visits: { type: 'integer' } },
      },
    },
  },
} as const;
