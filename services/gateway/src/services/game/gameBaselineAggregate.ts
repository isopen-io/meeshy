/**
 * LE POINT DE DÉPART DU JEU (#17363) — le retour des comptes, par semaine d'inscription.
 *
 * Le retour est GLISSANT : un compte est « revenu au jour N » s'il a encore été actif N jours pleins, ou plus, après
 * son inscription. Il se lit de deux colonnes que chaque compte porte déjà (`createdAt`, `lastActiveAt`) : aucune
 * trace d'activité par jour n'est gardée pour le calculer. Un horizon ne s'observe que sur les comptes qui ont eu le
 * temps de l'atteindre ; sans compte observable, le taux est `null`, jamais zéro.
 *
 * Pur et total : aucune lecture, aucune levée.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export const RETENTION_HORIZON_DAYS = { day1: 1, day7: 7, day30: 30 } as const;
export type RetentionHorizon = keyof typeof RETENTION_HORIZON_DAYS;

export type SignupActivityRow = {
  readonly createdAt: Date;
  readonly lastActiveAt: Date;
};

export type RetentionCell = {
  readonly eligible: number;
  readonly returned: number;
  readonly rate: number | null;
};

export type RetentionCohort = { readonly weekStart: string; readonly accounts: number } & Readonly<Record<RetentionHorizon, RetentionCell>>;

const HORIZONS = Object.keys(RETENTION_HORIZON_DAYS) as readonly RetentionHorizon[];

export const signupWeekOf = (createdAt: Date): string => {
  const day = new Date(Date.UTC(createdAt.getUTCFullYear(), createdAt.getUTCMonth(), createdAt.getUTCDate()));
  const daysSinceMonday = (day.getUTCDay() + 6) % 7;
  return new Date(day.getTime() - daysSinceMonday * DAY_MS).toISOString().slice(0, 10);
};

const isReadable = (row: SignupActivityRow): boolean => {
  const created = row.createdAt.getTime();
  const active = row.lastActiveAt.getTime();
  return Number.isFinite(created) && Number.isFinite(active);
};

const cellOf = (rows: readonly SignupActivityRow[], days: number, now: Date): RetentionCell => {
  const observable = rows.filter((row) => row.createdAt.getTime() + days * DAY_MS <= now.getTime());
  const returned = observable.filter((row) => row.lastActiveAt.getTime() - row.createdAt.getTime() >= days * DAY_MS).length;
  return {
    eligible: observable.length,
    returned,
    rate: observable.length === 0 ? null : Math.round((returned / observable.length) * 100),
  };
};

export function summarizeRollingRetention(params: { readonly rows: readonly SignupActivityRow[]; readonly now: Date }): RetentionCohort[] {
  const byWeek = params.rows.filter(isReadable).reduce<ReadonlyMap<string, readonly SignupActivityRow[]>>((weeks, row) => {
    const week = signupWeekOf(row.createdAt);
    return new Map([...weeks, [week, [...(weeks.get(week) ?? []), row]]]);
  }, new Map());

  return [...byWeek.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([weekStart, rows]) => ({
      weekStart,
      accounts: rows.length,
      ...(Object.fromEntries(HORIZONS.map((horizon) => [horizon, cellOf(rows, RETENTION_HORIZON_DAYS[horizon], params.now)])) as Record<RetentionHorizon, RetentionCell>),
    }));
}
