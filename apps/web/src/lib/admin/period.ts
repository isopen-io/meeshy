/**
 * LES PÉRIODES D'ADMINISTRATION (#8876) — 24 h, 7 j, 30 j, 90 j : les fenêtres
 * que la passerelle comprend (`createdAfter`, `period=7d`…) et que les écrans
 * offrent sous le même libellé (`admin.kit.period.*`).
 */
export const ADMIN_PERIODS = ['24h', '7d', '30d', '90d'] as const;

export type AdminPeriod = (typeof ADMIN_PERIODS)[number];

const HOURS: Readonly<Record<AdminPeriod, number>> = { '24h': 24, '7d': 7 * 24, '30d': 30 * 24, '90d': 90 * 24 };

/** Le début de la période, en ISO : à passer tel quel en `createdAfter`. `now` est injecté — la fonction ne lit jamais l'horloge. */
export function periodStart(period: AdminPeriod, now: Date): string {
  return new Date(now.getTime() - HOURS[period] * 3_600_000).toISOString();
}

export function isAdminPeriod(value: string): value is AdminPeriod {
  return ADMIN_PERIODS.some((period) => period === value);
}
