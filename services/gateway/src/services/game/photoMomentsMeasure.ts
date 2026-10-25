/**
 * LA MESURE DE L'IMMORTALISATION (D15 tranchée par #10185 — lot L20 #10176, chantier « Cadres de gloire »,
 * `docs/product/cadres-de-gloire/PROMPT-developpement.md` § 5.16.5).
 *
 * Des AGRÉGATS ANONYMES, calculés côté serveur, en LECTURE SEULE, depuis des lignes que la fonctionnalité tient déjà
 * (intérêt légitime, RGPD art. 6.1.f) — aucune route d'ingestion, aucune collection, aucun événement client :
 *
 *  - le registre `GamePhotoMoment` : `presentedAt` (présentée dans l'app), `notifiedAt` (annoncée par push),
 *    `keptAt` (immortalisée, D22 b) ;
 *  - les lignes `Notification` de type `game_photo_moment` : envoyées (`createdAt`) et lues (`readAt`).
 *
 * Ce que le rapport SORT, et rien d'autre : jour UTC × famille d'étape × clé AGRÉGÉE (`photoMeasureKeyOf`, la loi
 * partagée : rang sans division, Meesh et Prestige sans numéro, aucune date dans la clé) × événement × surface
 * grossière, avec un nombre de comptes DISTINCTS et un nombre de lignes. Aucun identifiant (compte, ligne,
 * notification, étape individuelle) ; une cellule de moins de `PHOTO_MEASURE_MIN_ACCOUNTS` comptes distincts est
 * SUPPRIMÉE ; un compte qui a explicitement refusé l'analyse (`User.analyticsConsentWithdrawnAt`) ne compte nulle part.
 *
 * Un push LU n'est qu'un PLAFOND des push ouverts : depuis #10175, chaque visite du carnet pose `readAt` sur les lignes
 * `game_photo_moment`, tap ou non (`pushReadMeaning`). Un signal d'ouverture distinct est un lot à part.
 */

import { photoMeasureKeyOf, type PhotoMeasureFamily } from '@meeshy/shared/utils/game/photo-measure';
import { isDayKey } from '@meeshy/shared/utils/game/day-prng';

/** Le k-anonymat de la sortie : en dessous de dix comptes distincts, une cellule ne sort pas (D15). */
export const PHOTO_MEASURE_MIN_ACCOUNTS = 10;
/** La profondeur maximale de lecture : la durée de conservation de la fiche du registre des traitements. */
export const PHOTO_MEASURE_RETENTION_MONTHS = 25;
const PAGE = 1_000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type PhotoMeasureEvent = 'presented' | 'notified' | 'kept';
export type PhotoMeasureSurface = 'in-app' | 'push' | 'none';

export type PhotoMeasureCell = {
  readonly day: string;
  readonly family: PhotoMeasureFamily;
  readonly key: string;
  readonly event: PhotoMeasureEvent;
  readonly surface: PhotoMeasureSurface;
  readonly accounts: number;
  readonly moments: number;
};

/** Le taux d'immortalisation sur la fenêtre : `kept / announced` des étapes annoncées dedans ; `key: null` = la famille. */
export type PhotoMeasureRate = {
  readonly family: PhotoMeasureFamily;
  readonly key: string | null;
  readonly announced: number;
  readonly kept: number;
  readonly accounts: number;
  readonly rate: number;
};

export type PhotoPushCell = { readonly day: string; readonly event: 'sent' | 'read'; readonly accounts: number; readonly notifications: number };

export type PhotoMeasureReport = {
  readonly window: { readonly from: string; readonly to: string };
  readonly minAccounts: number;
  readonly cells: readonly PhotoMeasureCell[];
  readonly rates: readonly PhotoMeasureRate[];
  readonly push: readonly PhotoPushCell[];
  readonly pushReadMeaning: 'ceiling-includes-carnet-visits';
  readonly suppressed: { readonly cells: number };
};

type DateRange = { gte: Date; lt: Date };
type Paging = { take: number; skip?: number; cursor?: { id: string }; orderBy: { id: 'asc' } };

type MomentRow = {
  readonly id: string;
  readonly userId: string;
  readonly stepId: string;
  readonly presentedAt: Date | null;
  readonly notifiedAt: Date | null;
  readonly keptAt: Date | null;
};
type NotificationRow = { readonly id: string; readonly userId: string; readonly createdAt: Date; readonly readAt: Date | null };

/** Ce que la mesure a le droit de toucher : trois `findMany`, rien qui écrive. */
export type PhotoMeasureReader = {
  readonly gamePhotoMoment: {
    findMany(
      args: Paging & {
        where: { OR: [{ presentedAt: DateRange }, { notifiedAt: DateRange }, { keptAt: DateRange }] };
        select: { id: true; userId: true; stepId: true; presentedAt: true; notifiedAt: true; keptAt: true };
      },
    ): Promise<readonly MomentRow[]>;
  };
  readonly notification: {
    findMany(
      args: Paging & {
        where: { type: 'game_photo_moment'; OR: [{ createdAt: DateRange }, { readAt: DateRange }] };
        select: { id: true; userId: true; createdAt: true; readAt: true };
      },
    ): Promise<readonly NotificationRow[]>;
  };
  readonly user: {
    findMany(args: Paging & { where: { analyticsConsentWithdrawnAt: { not: null } }; select: { id: true } }): Promise<readonly { readonly id: string }[]>;
  };
};

export type PhotoMeasureWindow = { readonly from: Date; readonly to: Date };

async function readAll<T extends { readonly id: string }>(page: (paging: Paging) => Promise<readonly T[]>): Promise<readonly T[]> {
  const rows: T[] = [];
  let cursor: string | undefined;
  for (;;) {
    const batch = await page(cursor === undefined ? { take: PAGE, orderBy: { id: 'asc' } } : { take: PAGE, skip: 1, cursor: { id: cursor }, orderBy: { id: 'asc' } });
    rows.push(...batch);
    const last = batch[batch.length - 1];
    if (batch.length < PAGE || last === undefined) return rows;
    cursor = last.id;
  }
}

const utcDay = (date: Date): string => date.toISOString().slice(0, 10);
const inWindow = (date: Date | null, window: PhotoMeasureWindow): date is Date =>
  date !== null && date.getTime() >= window.from.getTime() && date.getTime() < window.to.getTime();

const surfaceOf = (row: MomentRow): PhotoMeasureSurface => (row.presentedAt !== null ? 'in-app' : row.notifiedAt !== null ? 'push' : 'none');

type Tally = { readonly accounts: Set<string>; count: number };
const tally = (map: Map<string, Tally>, key: string, userId: string): void => {
  const entry = map.get(key) ?? { accounts: new Set<string>(), count: 0 };
  entry.accounts.add(userId);
  entry.count += 1;
  map.set(key, entry);
};

const SEP = '\u0000';

function momentCells(moments: readonly MomentRow[], window: PhotoMeasureWindow): Map<string, Tally> {
  const cells = new Map<string, Tally>();
  moments.forEach((row) => {
    const measure = photoMeasureKeyOf(row.stepId);
    if (measure === null) return;
    const surface = surfaceOf(row);
    const events: readonly [PhotoMeasureEvent, Date | null][] = [['presented', row.presentedAt], ['notified', row.notifiedAt], ['kept', row.keptAt]];
    events.forEach(([event, date]) => {
      if (inWindow(date, window)) tally(cells, [utcDay(date), measure.family, measure.key, event, surface].join(SEP), row.userId);
    });
  });
  return cells;
}

type RateTally = { readonly accounts: Set<string>; announced: number; kept: number };

function momentRates(moments: readonly MomentRow[], window: PhotoMeasureWindow): Map<string, RateTally> {
  const rates = new Map<string, RateTally>();
  moments.forEach((row) => {
    const measure = photoMeasureKeyOf(row.stepId);
    if (measure === null || !(inWindow(row.presentedAt, window) || inWindow(row.notifiedAt, window))) return;
    [measure.family, `${measure.family}${SEP}${measure.key}`].forEach((key) => {
      const entry = rates.get(key) ?? { accounts: new Set<string>(), announced: 0, kept: 0 };
      entry.accounts.add(row.userId);
      entry.announced += 1;
      entry.kept += row.keptAt !== null ? 1 : 0;
      rates.set(key, entry);
    });
  });
  return rates;
}

function pushCells(notifications: readonly NotificationRow[], window: PhotoMeasureWindow): Map<string, Tally> {
  const cells = new Map<string, Tally>();
  notifications.forEach((row) => {
    if (inWindow(row.createdAt, window)) tally(cells, [utcDay(row.createdAt), 'sent'].join(SEP), row.userId);
    if (inWindow(row.readAt, window)) tally(cells, [utcDay(row.readAt), 'read'].join(SEP), row.userId);
  });
  return cells;
}

const byKey = <T>(entries: readonly (readonly [string, T])[]): (readonly [string, T])[] => [...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

/**
 * Lit la fenêtre `[from, to)` et rend le rapport anonyme. Rejouer ne change rien : seules des lectures partent.
 */
export async function measurePhotoMoments(
  reader: PhotoMeasureReader,
  params: PhotoMeasureWindow & { readonly now: Date },
): Promise<PhotoMeasureReport> {
  const range: DateRange = { gte: params.from, lt: params.to };
  const [withdrawn, moments, notifications] = await Promise.all([
    readAll((paging) => reader.user.findMany({ ...paging, where: { analyticsConsentWithdrawnAt: { not: null } }, select: { id: true } })),
    readAll((paging) =>
      reader.gamePhotoMoment.findMany({
        ...paging,
        where: { OR: [{ presentedAt: range }, { notifiedAt: range }, { keptAt: range }] },
        select: { id: true, userId: true, stepId: true, presentedAt: true, notifiedAt: true, keptAt: true },
      }),
    ),
    readAll((paging) =>
      reader.notification.findMany({
        ...paging,
        where: { type: 'game_photo_moment', OR: [{ createdAt: range }, { readAt: range }] },
        select: { id: true, userId: true, createdAt: true, readAt: true },
      }),
    ),
  ]);
  const refused = new Set(withdrawn.map((row) => row.id));
  const consenting = <T extends { readonly userId: string }>(rows: readonly T[]): readonly T[] => rows.filter((row) => !refused.has(row.userId));
  const window: PhotoMeasureWindow = { from: params.from, to: params.to };
  const enough = (accounts: Set<string>): boolean => accounts.size >= PHOTO_MEASURE_MIN_ACCOUNTS;

  const rawCells = byKey([...momentCells(consenting(moments), window)]);
  const rawRates = byKey([...momentRates(consenting(moments), window)]);
  const rawPush = byKey([...pushCells(consenting(notifications), window)]);

  const cells = rawCells.filter(([, value]) => enough(value.accounts)).map(([key, value]): PhotoMeasureCell => {
    const [day = '', family, measureKey = '', event, surface] = key.split(SEP);
    return {
      day,
      family: family as PhotoMeasureFamily,
      key: measureKey,
      event: event as PhotoMeasureEvent,
      surface: surface as PhotoMeasureSurface,
      accounts: value.accounts.size,
      moments: value.count,
    };
  });
  const rates = rawRates.filter(([, value]) => enough(value.accounts)).map(([key, value]): PhotoMeasureRate => {
    const [family, measureKey] = key.split(SEP);
    return {
      family: family as PhotoMeasureFamily,
      key: measureKey ?? null,
      announced: value.announced,
      kept: value.kept,
      accounts: value.accounts.size,
      rate: Math.round((value.kept / value.announced) * 1000) / 1000,
    };
  });
  const push = rawPush.filter(([, value]) => enough(value.accounts)).map(([key, value]): PhotoPushCell => {
    const [day = '', event] = key.split(SEP);
    return { day, event: event as PhotoPushCell['event'], accounts: value.accounts.size, notifications: value.count };
  });

  return {
    window: { from: params.from.toISOString(), to: params.to.toISOString() },
    minAccounts: PHOTO_MEASURE_MIN_ACCOUNTS,
    cells,
    rates,
    push,
    pushReadMeaning: 'ceiling-includes-carnet-visits',
    suppressed: { cells: rawCells.length - cells.length + rawRates.length - rates.length + rawPush.length - push.length },
  };
}

const midnight = (day: string): Date => new Date(`${day}T00:00:00.000Z`);

export type PhotoMeasureArgsRefusal = { readonly reason: 'invalid-day' | 'empty-window' | 'beyond-retention' | 'unknown-argument' };

/**
 * `--from AAAA-MM-JJ` (inclus) et `--to AAAA-MM-JJ` (exclu), en jours UTC ; par défaut les sept derniers jours
 * complets. Une fenêtre qui remonte au-delà de la conservation (25 mois) est refusée.
 */
export function parsePhotoMeasureArgs(argv: readonly string[], now: Date): PhotoMeasureWindow | PhotoMeasureArgsRefusal {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if ((flag !== '--from' && flag !== '--to') || value === undefined) return { reason: 'unknown-argument' };
    if (!isDayKey(value)) return { reason: 'invalid-day' };
    values.set(flag, value);
  }
  const today = midnight(utcDay(now));
  const to = values.has('--to') ? midnight(values.get('--to') ?? '') : today;
  const from = values.has('--from') ? midnight(values.get('--from') ?? '') : new Date(to.getTime() - 7 * DAY_MS);
  if (from.getTime() >= to.getTime()) return { reason: 'empty-window' };
  const oldest = new Date(today);
  oldest.setUTCMonth(oldest.getUTCMonth() - PHOTO_MEASURE_RETENTION_MONTHS);
  return from.getTime() < oldest.getTime() ? { reason: 'beyond-retention' } : { from, to };
}
