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
 * La fenêtre est une SEMAINE ISO close, entière (`photoMeasureWeek.ts`) : deux rapports ne se chevauchent jamais.
 * Ce que le rapport SORT, et rien d'autre : jour UTC × famille d'étape × clé AGRÉGÉE (`photoMeasureKeyOf`, la loi
 * partagée : rang sans division, Meesh et Prestige sans numéro, aucune date dans la clé) × événement × surface
 * grossière, avec un nombre de comptes DISTINCTS et un nombre de lignes. Aucun identifiant (compte, ligne,
 * notification, étape individuelle) ; une cellule de moins de `PHOTO_MEASURE_MIN_ACCOUNTS` comptes distincts est
 * SUPPRIMÉE, et une ligne de taux aussi dès que la soustraire des lignes publiées plus fines isolerait moins de dix
 * comptes (`photoMeasureRates.ts`) ; un compte qui a explicitement refusé l'analyse (`User.analyticsConsentWithdrawnAt`) ne compte nulle part.
 *
 * Un push LU n'est qu'un PLAFOND des push ouverts : depuis #10175, chaque visite du carnet pose `readAt` sur les lignes
 * `game_photo_moment`, tap ou non (`pushReadMeaning`). Un signal d'ouverture distinct est un lot à part.
 */

import { photoMeasureKeyOf, type PhotoMeasureFamily } from '@meeshy/shared/utils/game/photo-measure';

import { publishedRates, type PhotoMeasureRate, type RateMoment } from './photoMeasureRates';
import { isClosedWeek, isoWeekWindow, lastClosedIsoWeek, type IsoWeekWindow } from './photoMeasureWeek';

/** Le k-anonymat de la sortie : en dessous de dix comptes distincts, une cellule ne sort pas (D15). */
export const PHOTO_MEASURE_MIN_ACCOUNTS = 10;
/** La profondeur maximale de lecture : la durée de conservation de la fiche du registre des traitements. */
export const PHOTO_MEASURE_RETENTION_MONTHS = 25;
const PAGE = 1_000;

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

export type { PhotoMeasureRate } from './photoMeasureRates';

export type PhotoPushCell = { readonly day: string; readonly event: 'sent' | 'read'; readonly accounts: number; readonly notifications: number };

export type PhotoMeasureReport = {
  readonly window: { readonly week: string; readonly from: string; readonly to: string };
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

type PhotoMeasureWindow = { readonly from: Date; readonly to: Date };

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

const before = (date: Date | null, window: PhotoMeasureWindow): boolean => date !== null && date.getTime() < window.to.getTime();

/**
 * La surface se lit À LA FIN de la semaine, jamais à l'instant de la lecture : une étape notifiée dans la semaine et
 * présentée la suivante reste `push` pour sa semaine. Sans cela, relire une semaine close après une présentation ou
 * une garde tardive déplacerait un compte d'une cellule à l'autre, et la différence entre les deux lectures le montrerait.
 */
const surfaceOf = (row: MomentRow, window: PhotoMeasureWindow): PhotoMeasureSurface =>
  before(row.presentedAt, window) ? 'in-app' : before(row.notifiedAt, window) ? 'push' : 'none';

type Tally = { readonly accounts: Set<string>; count: number };
const tally = (map: Map<string, Tally>, key: string, userId: string): void => {
  const entry = map.get(key) ?? { accounts: new Set<string>(), count: 0 };
  entry.accounts.add(userId);
  entry.count += 1;
  map.set(key, entry);
};

const SEP = '\u0000';

/** Un moment lu dans la semaine : sa clé agrégée, les cellules où il compte, et ce que sa ligne de taux en dit. */
type MeasuredMoment = {
  readonly userId: string;
  readonly family: PhotoMeasureFamily;
  readonly key: string;
  readonly announced: boolean;
  readonly kept: boolean;
  readonly cells: readonly { readonly event: PhotoMeasureEvent; readonly cell: string }[];
};

function measuredMoments(moments: readonly MomentRow[], window: PhotoMeasureWindow): readonly MeasuredMoment[] {
  return moments.flatMap((row): MeasuredMoment[] => {
    const measure = photoMeasureKeyOf(row.stepId);
    if (measure === null) return [];
    const surface = surfaceOf(row, window);
    const events: readonly [PhotoMeasureEvent, Date | null][] = [['presented', row.presentedAt], ['notified', row.notifiedAt], ['kept', row.keptAt]];
    const cells = events.flatMap(([event, date]) =>
      inWindow(date, window) ? [{ event, cell: [utcDay(date), measure.family, measure.key, event, surface].join(SEP) }] : [],
    );
    const announced = inWindow(row.presentedAt, window) || inWindow(row.notifiedAt, window);
    return [{ userId: row.userId, family: measure.family, key: measure.key, announced, kept: announced && before(row.keptAt, window), cells }];
  });
}

function momentCells(moments: readonly MeasuredMoment[]): Map<string, Tally> {
  const cells = new Map<string, Tally>();
  moments.forEach((moment) => moment.cells.forEach(({ cell }) => tally(cells, cell, moment.userId)));
  return cells;
}

const rateMoments = (moments: readonly MeasuredMoment[], shownCells: ReadonlySet<string>): readonly RateMoment[] =>
  moments
    .filter((moment) => moment.announced)
    .map((moment) => ({
      userId: moment.userId,
      family: moment.family,
      key: moment.key,
      kept: moment.kept,
      announcementShown: moment.cells.some(({ event, cell }) => event !== 'kept' && shownCells.has(cell)),
      keepingShown: moment.cells.some(({ event, cell }) => event === 'kept' && shownCells.has(cell)),
    }));

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
 * Lit une semaine ISO CLOSE et rend le rapport anonyme. Rejouer ne change rien : seules des lectures partent, et une
 * semaine close relue plus tard rend le même rapport (tout se lit avant sa fin). Une semaine invalide ou encore ouverte
 * lève (`invalid-week`, `week-not-closed`).
 */
export async function measurePhotoMoments(
  reader: PhotoMeasureReader,
  params: { readonly week: string; readonly now: Date },
): Promise<PhotoMeasureReport> {
  const week = closedWeek(params.week, params.now);
  const range: DateRange = { gte: week.from, lt: week.to };
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
  const window: PhotoMeasureWindow = { from: week.from, to: week.to };
  const enough = (accounts: Set<string>): boolean => accounts.size >= PHOTO_MEASURE_MIN_ACCOUNTS;

  const measured = measuredMoments(consenting(moments), window);
  const rawCells = byKey([...momentCells(measured)]);
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
  const { rates, withheld } = publishedRates(
    rateMoments(measured, new Set(rawCells.filter(([, value]) => enough(value.accounts)).map(([key]) => key))),
    PHOTO_MEASURE_MIN_ACCOUNTS,
  );
  const push = rawPush.filter(([, value]) => enough(value.accounts)).map(([key, value]): PhotoPushCell => {
    const [day = '', event] = key.split(SEP);
    return { day, event: event as PhotoPushCell['event'], accounts: value.accounts.size, notifications: value.count };
  });

  return {
    window: { week: week.week, from: week.from.toISOString(), to: week.to.toISOString() },
    minAccounts: PHOTO_MEASURE_MIN_ACCOUNTS,
    cells,
    rates,
    push,
    pushReadMeaning: 'ceiling-includes-carnet-visits',
    suppressed: { cells: rawCells.length - cells.length + withheld + rawPush.length - push.length },
  };
}

function closedWeek(week: string, now: Date): IsoWeekWindow {
  const window = isoWeekWindow(week);
  if (window === null) throw new Error('invalid-week');
  if (!isClosedWeek(window, now)) throw new Error('week-not-closed');
  return window;
}

export type PhotoMeasureArgs = { readonly week: string };
export type PhotoMeasureArgsRefusal = { readonly reason: 'invalid-week' | 'week-not-closed' | 'beyond-retention' | 'unknown-argument' };

/**
 * `--week AAAA-Www` : une semaine ISO CLOSE, entière ; par défaut la dernière close. Aucune autre fenêtre ne se demande
 * (`--from` / `--to` sont refusés) : deux semaines ISO ne se chevauchent jamais, donc aucune différence entre deux
 * rapports ne descend sous la semaine. Une semaine qui commence au-delà de la conservation (25 mois) est refusée.
 */
export function parsePhotoMeasureArgs(argv: readonly string[], now: Date): PhotoMeasureArgs | PhotoMeasureArgsRefusal {
  const [flag, value, ...rest] = argv;
  if (flag === undefined) return { week: lastClosedIsoWeek(now) };
  if (flag !== '--week' || value === undefined || rest.length > 0) return { reason: 'unknown-argument' };
  const window = isoWeekWindow(value);
  if (window === null) return { reason: 'invalid-week' };
  if (!isClosedWeek(window, now)) return { reason: 'week-not-closed' };
  const oldest = new Date(`${utcDay(now)}T00:00:00.000Z`);
  oldest.setUTCMonth(oldest.getUTCMonth() - PHOTO_MEASURE_RETENTION_MONTHS);
  return window.from.getTime() < oldest.getTime() ? { reason: 'beyond-retention' } : { week: value };
}
