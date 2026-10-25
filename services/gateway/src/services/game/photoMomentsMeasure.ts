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
 * Ce que le rapport SORT — UN SEUL NIVEAU, la famille d'étape à la semaine (`photoMeasureKeyOf`, la loi partagée), et
 * rien d'autre, chaque nombre étant un nombre de comptes DISTINCTS :
 *
 *  - `families` : par famille, `announced` (comptes à qui un moment de la famille a été ANNONCÉ pour la première fois
 *    dans la semaine) et `kept` (ceux d'entre eux qui en ont gardé un avant sa fin) ;
 *  - `push` : `sent` (comptes poussés dans la semaine) et `read` (ceux d'entre eux qui en ont lu un avant sa fin).
 *
 * Chaque ligne ne dépend QUE de la semaine mesurée : un moment est annoncé dans une seule semaine, une notification
 * créée dans une seule, et une garde ne compte que dans la semaine d'annonce de son moment. Une garde posée plus tard
 * (un rattrapage depuis le carnet) n'entre dans aucune ligne : la publier reliait deux semaines, et les familles à un
 * seul moment par compte (`start`, une saison, un palier de sommet — `@@unique([userId, stepId])`) rendaient ces
 * lignes DISJOINTES, donc sommables jusqu'à un compte (troisième audit, #10176).
 *
 * Aucun jour, aucune clé, aucune surface, aucun nombre de lignes. Une ligne ne sort que si chacun de ses nombres ET
 * leur complément valent zéro ou au moins `PHOTO_MEASURE_MIN_ACCOUNTS`, et si elle ne s'emboîte dans aucune ligne
 * publiée à moins de dix comptes près (`photoMeasureRates.ts`) ; sinon elle est retenue et seul `suppressed` augmente.
 * Un compte qui a explicitement refusé l'analyse (`User.analyticsConsentWithdrawnAt`) ne compte nulle part.
 *
 * Un push LU n'est qu'un PLAFOND des push ouverts : depuis #10175, chaque visite du carnet pose `readAt` sur les lignes
 * `game_photo_moment`, tap ou non (`pushReadMeaning`). Un signal d'ouverture distinct est un lot à part.
 */

import { PHOTO_MEASURE_FAMILIES, photoMeasureKeyOf, type PhotoMeasureFamily } from '@meeshy/shared/utils/game/photo-measure';

import { complement, publishLines, type Accounts, type CandidateLine } from './photoMeasureRates';
import { isClosedWeek, isoWeekWindow, lastClosedIsoWeek, type IsoWeekWindow } from './photoMeasureWeek';

/** Le k-anonymat de la sortie : en dessous de dix comptes distincts, une ligne ne sort pas (D15). */
export const PHOTO_MEASURE_MIN_ACCOUNTS = 10;
/** La profondeur maximale de lecture : la durée de conservation de la fiche du registre des traitements. */
export const PHOTO_MEASURE_RETENTION_MONTHS = 25;
const PAGE = 1_000;

/** Le taux d'immortalisation d'une famille sur la semaine, en comptes. */
export type PhotoMeasureFamilyRate = {
  readonly family: PhotoMeasureFamily;
  readonly announced: number;
  readonly kept: number;
  readonly rate: number;
};
export type PhotoMeasurePush = { readonly sent: number; readonly read: number };

export type PhotoMeasureReport = {
  readonly window: { readonly week: string; readonly from: string; readonly to: string };
  readonly minAccounts: number;
  readonly families: readonly PhotoMeasureFamilyRate[];
  readonly push: PhotoMeasurePush | null;
  readonly pushReadMeaning: 'ceiling-includes-carnet-visits';
  /** Le nombre de lignes retenues, sans étiquette. */
  readonly suppressed: number;
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
        where: { OR: [{ presentedAt: DateRange }, { notifiedAt: DateRange }] };
        select: { id: true; userId: true; stepId: true; presentedAt: true; notifiedAt: true; keptAt: true };
      },
    ): Promise<readonly MomentRow[]>;
  };
  readonly notification: {
    findMany(
      args: Paging & { where: { type: 'game_photo_moment'; createdAt: DateRange }; select: { id: true; userId: true; createdAt: true; readAt: true } },
    ): Promise<readonly NotificationRow[]>;
  };
  readonly user: {
    findMany(args: Paging & { where: { analyticsConsentWithdrawnAt: { not: null } }; select: { id: true } }): Promise<readonly { readonly id: string }[]>;
  };
};

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

type Window = { readonly from: Date; readonly to: Date };

const inWindow = (date: Date | null, window: Window): date is Date =>
  date !== null && date.getTime() >= window.from.getTime() && date.getTime() < window.to.getTime();
const before = (date: Date | null, limit: Date): date is Date => date !== null && date.getTime() < limit.getTime();
const earliest = (a: Date | null, b: Date | null): Date | null => (a === null ? b : b === null || a.getTime() <= b.getTime() ? a : b);

/** Un moment de la mesure : sa famille, sa PREMIÈRE annonce, et sa garde. */
type Measured = { readonly userId: string; readonly family: PhotoMeasureFamily; readonly announcedAt: Date | null; readonly keptAt: Date | null };

/**
 * « Annoncé » ne se lit JAMAIS dans l'horodatage que la garde a posé elle-même. `GamePhotoService.markKept` pose
 * `presentedAt = keptAt` (au même instant) quand la présentation manque : une étape gardée depuis le carnet sans avoir
 * jamais été présentée porte donc une « présentation » qui n'en est pas une. Seule une présentation STRICTEMENT
 * antérieure à la garde (ou sans garde) est une annonce dans l'app ; `notifiedAt`, posé par l'envoi du push et jamais
 * par la garde, en est une autre. L'annonce d'un moment est la plus ancienne des deux : il est annoncé dans UNE semaine.
 */
const genuinePresentation = (row: MomentRow): Date | null =>
  row.presentedAt !== null && (row.keptAt === null || row.presentedAt.getTime() < row.keptAt.getTime()) ? row.presentedAt : null;

const measured = (rows: readonly MomentRow[]): readonly Measured[] =>
  rows.flatMap((row) => {
    const measure = photoMeasureKeyOf(row.stepId);
    return measure === null ? [] : [{ userId: row.userId, family: measure.family, announcedAt: earliest(row.notifiedAt, genuinePresentation(row)), keptAt: row.keptAt }];
  });

const accountsOf = (moments: readonly Measured[]): Accounts => new Set(moments.map((moment) => moment.userId));

/** Ce qu'une famille publie d'une semaine : les comptes annoncés, et ceux d'entre eux qui ont gardé avant sa fin. */
type Population = { readonly announced: Accounts; readonly kept: Accounts };

function populationOf(moments: readonly Measured[], window: Window): Population {
  const announced = moments.filter((moment) => inWindow(moment.announcedAt, window));
  return { announced: accountsOf(announced), kept: accountsOf(announced.filter((moment) => before(moment.keptAt, window.to))) };
}

const byFamily = (moments: readonly Measured[], window: Window): ReadonlyMap<PhotoMeasureFamily, Population> =>
  new Map(PHOTO_MEASURE_FAMILIES.map((family) => [family, populationOf(moments.filter((moment) => moment.family === family), window)]));

type Line =
  | { readonly kind: 'family'; readonly value: PhotoMeasureFamilyRate }
  | { readonly kind: 'push'; readonly value: PhotoMeasurePush };

const rateOf = (kept: number, announced: number): number => Math.round((kept / announced) * 1000) / 1000;

const familyCandidates = (populations: ReadonlyMap<PhotoMeasureFamily, Population>): readonly CandidateLine<Line>[] =>
  [...populations].flatMap(([family, { announced, kept }]) =>
    announced.size === 0
      ? []
      : [{ line: { kind: 'family', value: { family, announced: announced.size, kept: kept.size, rate: rateOf(kept.size, announced.size) } }, base: announced, sets: [announced, kept, complement(announced, kept)] }],
  );

function pushCandidates(notifications: readonly NotificationRow[], window: Window): readonly CandidateLine<Line>[] {
  const sentRows = notifications.filter((row) => inWindow(row.createdAt, window));
  const sent: Accounts = new Set(sentRows.map((row) => row.userId));
  const read: Accounts = new Set(sentRows.filter((row) => before(row.readAt, window.to)).map((row) => row.userId));
  return sent.size === 0 ? [] : [{ line: { kind: 'push', value: { sent: sent.size, read: read.size } }, base: sent, sets: [sent, read, complement(sent, read)] }];
}

const momentsOf = (reader: PhotoMeasureReader, range: DateRange): Promise<readonly MomentRow[]> =>
  readAll((paging) =>
    reader.gamePhotoMoment.findMany({
      ...paging,
      where: { OR: [{ presentedAt: range }, { notifiedAt: range }] },
      select: { id: true, userId: true, stepId: true, presentedAt: true, notifiedAt: true, keptAt: true },
    }),
  );

/**
 * Lit une semaine ISO CLOSE, dans la conservation, et rend le rapport anonyme. Seules des lectures partent : rejouer
 * ne change rien en base. Une semaine invalide, encore ouverte ou au-delà de la conservation lève (`invalid-week`,
 * `week-not-closed`, `beyond-retention`) avant toute lecture.
 *
 * Seuls les moments présentés ou notifiés DANS la semaine sont lus — une garde seule ne fait pas servir sa ligne,
 * puisqu'elle n'entre dans aucun nombre —, et les notifications créées dans la semaine. Tout ce que le rapport dit
 * d'un moment se lit AVANT la fin de la semaine (première annonce, garde, lecture du push) :
 * une présentation, une garde ou une lecture postérieure ne change pas une semaine close. Mais une semaine relue plus
 * tard ne rend PAS forcément le même rapport — les lignes lues, elles, changent (refus de l'analyse posé ou retiré,
 * compte purgé, notifications supprimées) : le compte rendu se lit UNE fois par semaine, jamais deux pour comparaison
 * (fiche de décision, « Limites connues »).
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
    momentsOf(reader, range),
    readAll((paging) =>
      reader.notification.findMany({ ...paging, where: { type: 'game_photo_moment', createdAt: range }, select: { id: true, userId: true, createdAt: true, readAt: true } }),
    ),
  ]);
  const refused = new Set(withdrawn.map((row) => row.id));
  const consenting = <T extends { readonly userId: string }>(rows: readonly T[]): readonly T[] => rows.filter((row) => !refused.has(row.userId));
  const window: Window = { from: week.from, to: week.to };

  const candidates = [...familyCandidates(byFamily(measured(consenting(moments)), window)), ...pushCandidates(consenting(notifications), window)];
  const { published, withheld } = publishLines(candidates, PHOTO_MEASURE_MIN_ACCOUNTS);

  return {
    window: { week: week.week, from: week.from.toISOString(), to: week.to.toISOString() },
    minAccounts: PHOTO_MEASURE_MIN_ACCOUNTS,
    families: published.flatMap((line) => (line.kind === 'family' ? [line.value] : [])),
    push: published.flatMap((line) => (line.kind === 'push' ? [line.value] : []))[0] ?? null,
    pushReadMeaning: 'ceiling-includes-carnet-visits',
    suppressed: withheld,
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
