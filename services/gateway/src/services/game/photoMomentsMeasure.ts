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
 * grossière, avec un nombre de comptes DISTINCTS — et rien d'autre : aucun nombre de lignes, qui face au nombre de
 * comptes dirait combien de comptes ont eu deux moments. Aucun identifiant (compte, ligne, notification, étape
 * individuelle) ; une cellule de moins de `PHOTO_MEASURE_MIN_ACCOUNTS` comptes distincts est SUPPRIMÉE, et une ligne
 * de taux aussi dès que la soustraire des lignes publiées plus fines isolerait moins de dix comptes
 * (`photoMeasureRates.ts`) ; un compte qui a explicitement refusé l'analyse (`User.analyticsConsentWithdrawnAt`) ne
 * compte nulle part.
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

export type PhotoMeasureEvent = 'presented' | 'notified' | 'kept' | 'kept-backlog';
export type PhotoMeasureSurface = 'in-app' | 'push' | 'none';

export type PhotoMeasureCell = {
  readonly day: string;
  readonly family: PhotoMeasureFamily;
  readonly key: string;
  readonly event: PhotoMeasureEvent;
  readonly surface: PhotoMeasureSurface;
  readonly accounts: number;
};

export type { PhotoMeasureRate } from './photoMeasureRates';

export type PhotoPushCell = { readonly day: string; readonly event: 'sent' | 'read'; readonly accounts: number };

export type PhotoMeasureReport = {
  readonly window: { readonly week: string; readonly from: string; readonly to: string };
  readonly minAccounts: number;
  readonly cells: readonly PhotoMeasureCell[];
  readonly rates: readonly PhotoMeasureRate[];
  readonly push: readonly PhotoPushCell[];
  readonly pushReadMeaning: 'ceiling-includes-carnet-visits';
  readonly suppressed: { readonly cells: number };
};

type DateRange = { readonly gte: Date; readonly lt: Date };
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

async function readAll<T extends { readonly id: string }>(
  page: (paging: Paging) => Promise<readonly T[]>,
  cursor?: string,
  pages: readonly (readonly T[])[] = [],
): Promise<readonly T[]> {
  const batch = await page(cursor === undefined ? { take: PAGE, orderBy: { id: 'asc' } } : { take: PAGE, skip: 1, cursor: { id: cursor }, orderBy: { id: 'asc' } });
  const read = [...pages, batch];
  const last = batch[batch.length - 1];
  return batch.length < PAGE || last === undefined ? read.flat() : readAll(page, last.id, read);
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

const SEP = '\u0000';

/** Une marque : un compte compté sous une étiquette, que `id` identifie sans ambiguïté. */
type Mark<L> = { readonly id: string; readonly label: L; readonly userId: string };
type Counted<L> = { readonly id: string; readonly label: L; readonly accounts: number };

/** Les comptes DISTINCTS par étiquette, triés par identifiant : une ligne de plus d'un même compte ne compte jamais. */
function distinctAccounts<L>(marks: readonly Mark<L>[]): readonly Counted<L>[] {
  const groups = new Map<string, { readonly label: L; readonly accounts: Set<string> }>();
  marks.forEach((mark) => {
    const group = groups.get(mark.id) ?? { label: mark.label, accounts: new Set<string>() };
    group.accounts.add(mark.userId);
    groups.set(mark.id, group);
  });
  return [...groups]
    .map(([id, group]) => ({ id, label: group.label, accounts: group.accounts.size }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

type CellLabel = Omit<PhotoMeasureCell, 'accounts'>;
type PushLabel = Omit<PhotoPushCell, 'accounts'>;

const cellMark = (label: CellLabel, userId: string): Mark<CellLabel> => ({
  id: [label.day, label.family, label.key, label.event, label.surface].join(SEP),
  label,
  userId,
});

/** Un moment lu dans la semaine : sa clé agrégée, les cellules où il compte, et ce que sa ligne de taux en dit. */
type MeasuredMoment = {
  readonly userId: string;
  readonly family: PhotoMeasureFamily;
  readonly key: string;
  readonly announced: boolean;
  readonly kept: boolean;
  readonly cells: readonly Mark<CellLabel>[];
};

/**
 * Une cellule `kept` et la ligne de taux de sa clé comptent la MÊME population : les moments ANNONCÉS dans la semaine.
 * Une garde posée dans la semaine d'un moment annoncé AVANT elle (ou jamais annoncé, surface `none`) sort sous
 * `kept-backlog`, une cellule à part soumise au même seuil, qu'aucune ligne de taux ne contient : sans cela, la cellule
 * `kept` moins le taux de sa clé rendait le compte qui seul avait gardé une annonce d'une semaine antérieure.
 */
function measuredMoments(moments: readonly MomentRow[], window: PhotoMeasureWindow): readonly MeasuredMoment[] {
  return moments.flatMap((row): MeasuredMoment[] => {
    const measure = photoMeasureKeyOf(row.stepId);
    if (measure === null) return [];
    const surface = surfaceOf(row, window);
    const announced = inWindow(row.presentedAt, window) || inWindow(row.notifiedAt, window);
    const events: readonly (readonly [PhotoMeasureEvent, Date | null])[] = [
      ['presented', row.presentedAt],
      ['notified', row.notifiedAt],
      [announced ? 'kept' : 'kept-backlog', row.keptAt],
    ];
    const cells = events.flatMap(([event, date]) =>
      inWindow(date, window) ? [cellMark({ day: utcDay(date), family: measure.family, key: measure.key, event, surface }, row.userId)] : [],
    );
    return [{ userId: row.userId, family: measure.family, key: measure.key, announced, kept: announced && before(row.keptAt, window), cells }];
  });
}

const rateMoments = (moments: readonly MeasuredMoment[], shownCells: ReadonlySet<string>): readonly RateMoment[] =>
  moments
    .filter((moment) => moment.announced)
    .map((moment) => ({
      userId: moment.userId,
      family: moment.family,
      key: moment.key,
      kept: moment.kept,
      announcementShown: moment.cells.some(({ label, id }) => (label.event === 'presented' || label.event === 'notified') && shownCells.has(id)),
      keepingShown: moment.cells.some(({ label, id }) => label.event === 'kept' && shownCells.has(id)),
    }));

function pushMarks(notifications: readonly NotificationRow[], window: PhotoMeasureWindow): readonly Mark<PushLabel>[] {
  const mark = (date: Date | null, event: PushLabel['event'], userId: string): readonly Mark<PushLabel>[] =>
    inWindow(date, window) ? [{ id: [utcDay(date), event].join(SEP), label: { day: utcDay(date), event }, userId }] : [];
  return notifications.flatMap((row) => [...mark(row.createdAt, 'sent', row.userId), ...mark(row.readAt, 'read', row.userId)]);
}

/**
 * Lit une semaine ISO CLOSE, dans la conservation, et rend le rapport anonyme. Seules des lectures partent : rejouer
 * ne change rien en base. Une semaine invalide, encore ouverte ou au-delà de la conservation lève (`invalid-week`,
 * `week-not-closed`, `beyond-retention`) avant toute lecture.
 *
 * Tout ce que le rapport dit d'un moment se lit AVANT la fin de la semaine (surface, garde comptée au taux) : une
 * présentation ou une garde postérieure ne change pas une semaine close. Mais une semaine relue plus tard ne rend PAS
 * forcément le même rapport — les lignes lues, elles, changent : (a) un refus de l'analyse posé ou RETIRÉ depuis
 * (`analyticsConsentWithdrawnAt` se relit à chaque lecture, et repasse à `null`), (b) un compte purgé (son registre
 * part avec lui), (c) « supprimer les notifications lues », qui efface les lignes `push` d'une semaine passée. La
 * différence de deux lectures d'une même semaine peut alors porter sur un seul compte : le compte rendu se lit UNE
 * fois par semaine, jamais deux pour comparaison (fiche de décision, « Limites connues »).
 */
export async function measurePhotoMoments(
  reader: PhotoMeasureReader,
  params: { readonly week: string; readonly now: Date },
): Promise<PhotoMeasureReport> {
  const week = measurableWeek(params.week, params.now);
  if ('reason' in week) throw new Error(week.reason);
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
  const enough = (counted: { readonly accounts: number }): boolean => counted.accounts >= PHOTO_MEASURE_MIN_ACCOUNTS;

  const measured = measuredMoments(consenting(moments), window);
  const rawCells = distinctAccounts(measured.flatMap((moment) => moment.cells));
  const rawPush = distinctAccounts(pushMarks(consenting(notifications), window));
  const shownCells = rawCells.filter(enough);
  const shownPush = rawPush.filter(enough);
  const { rates, withheld } = publishedRates(rateMoments(measured, new Set(shownCells.map((cell) => cell.id))), PHOTO_MEASURE_MIN_ACCOUNTS);

  return {
    window: { week: week.week, from: week.from.toISOString(), to: week.to.toISOString() },
    minAccounts: PHOTO_MEASURE_MIN_ACCOUNTS,
    cells: shownCells.map(({ label, accounts }) => ({ ...label, accounts })),
    rates,
    push: shownPush.map(({ label, accounts }) => ({ ...label, accounts })),
    pushReadMeaning: 'ceiling-includes-carnet-visits',
    suppressed: { cells: rawCells.length - shownCells.length + withheld + rawPush.length - shownPush.length },
  };
}

export type PhotoMeasureArgs = { readonly week: string };
export type PhotoMeasureArgsRefusal = { readonly reason: 'invalid-week' | 'week-not-closed' | 'beyond-retention' | 'unknown-argument' };

/** Le premier instant que la conservation laisse lire : minuit UTC du jour de `now`, 25 mois plus tôt. */
const retentionStart = (now: Date): Date =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - PHOTO_MEASURE_RETENTION_MONTHS, now.getUTCDate()));

/** La SEULE règle de ce qui se mesure, partagée par la mesure et sa ligne de commande : une semaine ISO close, dans la conservation. */
function measurableWeek(week: string, now: Date): IsoWeekWindow | PhotoMeasureArgsRefusal {
  const window = isoWeekWindow(week);
  if (window === null) return { reason: 'invalid-week' };
  if (!isClosedWeek(window, now)) return { reason: 'week-not-closed' };
  return window.from.getTime() < retentionStart(now).getTime() ? { reason: 'beyond-retention' } : window;
}

/**
 * `--week AAAA-Www` : une semaine ISO CLOSE, entière ; par défaut la dernière close. Aucune autre fenêtre ne se demande
 * (`--from` / `--to` sont refusés) : deux semaines ISO ne se chevauchent jamais, donc aucune différence entre deux
 * rapports ne descend sous la semaine. Une semaine qui commence au-delà de la conservation (25 mois) est refusée.
 */
export function parsePhotoMeasureArgs(argv: readonly string[], now: Date): PhotoMeasureArgs | PhotoMeasureArgsRefusal {
  const [flag, value, ...rest] = argv;
  if (flag === undefined) return { week: lastClosedIsoWeek(now) };
  if (flag !== '--week' || value === undefined || rest.length > 0) return { reason: 'unknown-argument' };
  const window = measurableWeek(value, now);
  return 'reason' in window ? window : { week: value };
}
