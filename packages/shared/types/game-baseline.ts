/**
 * LE POINT DE DÉPART DU JEU (#17363, #20617) — ce que `GET /api/v1/admin/analytics/game` sert à l'administration.
 *
 * Des AGRÉGATS sans identité : aucun identifiant de compte, aucun pseudonyme, aucune ligne par compte.
 *
 * @see services/gateway/src/services/game/gameBaselineAggregate.ts (la loi)
 * @see schema.prisma — `User.createdAt` / `lastActiveAt`, `GameDay.chestClaimedAt`, `MeeshLedger`, `GameProfile.gameHiddenAt`
 */

export const GAME_BASELINE_DEFAULT_WINDOW_DAYS = 14;
export const GAME_BASELINE_MAX_WINDOW_DAYS = 30;
/** Treize semaines d'inscription : la plus ancienne a toujours eu le temps d'atteindre le trentième jour. */
export const GAME_BASELINE_COHORT_WEEKS = 13;
/** Une Flamme « longue » a sept jours ou plus. */
export const GAME_BASELINE_LONG_FLAME_DAYS = 7;

export const RETENTION_HORIZON_DAYS = { day1: 1, day7: 7, day30: 30 } as const;
export type RetentionHorizon = keyof typeof RETENTION_HORIZON_DAYS;

/** `rate` en pour cent, `null` (jamais 0) quand aucun compte n'a encore pu atteindre l'horizon. */
export type RetentionCell = {
  readonly eligible: number;
  readonly returned: number;
  readonly rate: number | null;
};

/** `weekStart` : le lundi UTC de la semaine d'inscription, `AAAA-MM-JJ`. */
export type RetentionCohort = { readonly weekStart: string; readonly accounts: number } & Readonly<Record<RetentionHorizon, RetentionCell>>;

/** Un jour UTC de la fenêtre. Les Meeshes se comptent en unités (somme des écritures), pas en écritures. */
export type GameDailyCounters = {
  readonly day: string;
  readonly offeringsOpened: number;
  readonly meeshesMinted: number;
  readonly meeshesSpent: number;
};

export type GameBaselineSummary = {
  readonly windowDays: number;
  readonly cohortWeeks: number;
  /** Une lecture a atteint son plafond de lignes : les chiffres sont des minorants. */
  readonly sampled: boolean;
  /** De la semaine la plus récente à la plus ancienne. */
  readonly retention: readonly RetentionCohort[];
  /** Du jour le plus ancien à aujourd'hui, un jour par entrée, zéros compris. */
  readonly daily: readonly GameDailyCounters[];
  /** Les Flammes d'au moins `minDays` jours encore vivantes aujourd'hui (allumées, à risque ou couvertes). */
  readonly longFlames: { readonly minDays: number; readonly alive: number };
  readonly guards: {
    /** Comptes en « Jeu masqué ». */
    readonly gameHidden: number;
    /** Comptes qui ont coupé `notification.gameEnabled`. */
    readonly gameNotificationsOff: number;
  };
};
