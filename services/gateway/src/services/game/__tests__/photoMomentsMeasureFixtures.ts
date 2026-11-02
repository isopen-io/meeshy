/**
 * Le registre en mémoire des témoins de la mesure photo (#10176). Il APPLIQUE le `where` de chaque `findMany` (plages
 * de dates, `OR`, type de notification, `not`) et son curseur, CONSIGNE les lignes servies, et consigne tout autre
 * appel : une écriture tentée (create, update, upsert, delete, $runCommandRaw…) se voit dans `calls.writes`.
 *
 * Les lignes de moment ne prennent que des états que la PRODUCTION écrit (`GamePhotoService`,
 * `GamePhotoMomentService`) : une garde pose `presentedAt = keptAt` quand la présentation manque, donc aucune ligne
 * gardée n'a `presentedAt: null`, ni une présentation postérieure à sa garde ; et l'envoi du push n'annonce qu'une
 * étape ni présentée ni notifiée (`deliverTo`, filtre `PENDING`), donc aucune ligne n'a une présentation ANTÉRIEURE à
 * sa notification — le fabricant lève sur ces états.
 */

import type { PhotoMeasureReader } from '../photoMomentsMeasure';

/** Mardi 27 octobre 2026 : la semaine ISO 2026-W43 (lundi 19 → lundi 26) est close, la W44 ne l'est pas. */
export const NOW = new Date('2026-10-27T12:00:00.000Z');
export const WEEK = '2026-W43';
export const DAY = '2026-10-20';
export const at = (day: string, hour = 10): Date => new Date(`${day}T${String(hour).padStart(2, '0')}:00:00.000Z`);

export const accountId = (n: number): string => `65${String(n).padStart(22, '0')}`;
export const accounts = (count: number, offset = 0): readonly string[] => Array.from({ length: count }, (_, i) => accountId(offset + i + 1));

export type MomentRow = {
  readonly id: string;
  readonly userId: string;
  readonly stepId: string;
  readonly detectedAt: Date | null;
  readonly presentedAt: Date | null;
  readonly notifiedAt: Date | null;
  readonly keptAt: Date | null;
};
export type NotificationRow = { readonly id: string; readonly userId: string; readonly type: string; readonly createdAt: Date; readonly readAt: Date | null };

let sequence = 0;
const nextId = (prefix: string): string => `${prefix}${String((sequence += 1)).padStart(22, '0')}`;

/** Un moment dans un état que la production écrit — sinon le témoin lève, il ne prouverait rien. */
export function moment(overrides: Partial<MomentRow> & { readonly userId: string }): MomentRow {
  const row: MomentRow = { id: nextId('67'), stepId: 'rank:echo:5', detectedAt: null, presentedAt: at(DAY), notifiedAt: null, keptAt: null, ...overrides };
  if (row.keptAt !== null && (row.presentedAt === null || row.presentedAt.getTime() > row.keptAt.getTime())) {
    throw new Error(`état impossible : une garde pose presentedAt (${row.stepId})`);
  }
  if (row.presentedAt !== null && row.notifiedAt !== null && row.presentedAt.getTime() < row.notifiedAt.getTime()) {
    throw new Error(`état impossible : le push n'annonce pas une étape déjà présentée (${row.stepId})`);
  }
  return row;
}

/** Une garde depuis le carnet d'un moment jamais présenté : la garde a posé la présentation au même instant. */
export const carnetKept = (userId: string, keptAt: Date, overrides: Partial<MomentRow> = {}): MomentRow =>
  moment({ userId, presentedAt: keptAt, keptAt, ...overrides });

export const pushed = (userId: string, createdAt: Date, readAt: Date | null = null): NotificationRow => ({
  id: nextId('66'),
  userId,
  type: 'game_photo_moment',
  createdAt,
  readAt,
});

type Calls = { readonly reads: string[]; readonly writes: string[]; readonly served: string[] };
type Range = { readonly gte: Date; readonly lt: Date };

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === 'object' && value !== null;
const isRange = (value: unknown): value is Range => isRecord(value) && value.gte instanceof Date && value.lt instanceof Date;

/** Le sous-ensemble du `where` de Prisma que la mesure emploie : égalité, plage `[gte, lt)`, `not`, `OR`. */
function matches(row: Readonly<Record<string, unknown>>, where: unknown): boolean {
  if (!isRecord(where)) return false;
  return Object.entries(where).every(([field, condition]) => {
    if (field === 'OR') return Array.isArray(condition) && condition.some((branch) => matches(row, branch));
    const value = row[field];
    if (isRange(condition)) return value instanceof Date && value.getTime() >= condition.gte.getTime() && value.getTime() < condition.lt.getTime();
    if (isRecord(condition) && 'not' in condition) return value !== condition.not;
    return value === condition;
  });
}

export function registry(params: {
  readonly moments: readonly MomentRow[];
  readonly notifications?: readonly NotificationRow[];
  readonly withdrawn?: readonly string[];
}): { readonly reader: PhotoMeasureReader; readonly calls: Calls } {
  const calls: Calls = { reads: [], writes: [], served: [] };
  const withdrawn = new Set(params.withdrawn ?? []);
  const notifications = params.notifications ?? [];
  const users = [...new Set([...params.moments, ...notifications].map((row) => row.userId).concat([...withdrawn]))].map((id) => ({
    id,
    analyticsConsentWithdrawnAt: withdrawn.has(id) ? at('2026-10-01') : null,
  }));
  const serve = <T extends { readonly id: string }>(name: string, rows: readonly T[], args: { readonly where: unknown; readonly take: number; readonly cursor?: { readonly id: string } }) => {
    const sorted = rows.filter((row) => matches(row, args.where)).sort((a, b) => a.id.localeCompare(b.id));
    const start = args.cursor === undefined ? 0 : sorted.findIndex((row) => row.id === args.cursor?.id) + 1;
    const served = sorted.slice(start, start + args.take);
    calls.served.push(...served.map((row) => `${name}:${row.id}`));
    return served;
  };
  const tracked = <T extends object>(name: string, model: T): T =>
    new Proxy(model, {
      get: (target, method, receiver) => {
        if (method === 'findMany') {
          calls.reads.push(name);
          return Reflect.get(target, method, receiver);
        }
        return () => {
          calls.writes.push(`${name}.${String(method)}`);
          return Promise.resolve(null);
        };
      },
    });
  const reader: PhotoMeasureReader = {
    gamePhotoMoment: tracked('gamePhotoMoment', { findMany: (args) => Promise.resolve(serve('gamePhotoMoment', params.moments, args)) }),
    notification: tracked('notification', { findMany: (args) => Promise.resolve(serve('notification', notifications, args)) }),
    user: tracked('user', { findMany: (args) => Promise.resolve(serve('user', users, args).map(({ id }) => ({ id }))) }),
  };
  return { reader, calls };
}

const COUNT_KEYS: ReadonlySet<string> = new Set(['accounts', 'announced', 'kept', 'sent', 'read']);

/** Tous les nombres de comptes qu'un rapport publie, quelle que soit sa forme. */
function publishedCounts(value: unknown, key = ''): readonly number[] {
  if (typeof value === 'number') return COUNT_KEYS.has(key) ? [value] : [];
  if (Array.isArray(value)) return value.flatMap((item) => publishedCounts(item));
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([field, item]) => publishedCounts(item, field));
}

/**
 * Ce qu'un lecteur isole d'une LISTE de rapports publiés : un nombre de comptes de 1 à 9, ou une SOMME SIGNÉE de
 * nombres publiés — deux, trois ou davantage, pris dans un ou plusieurs rapports — qui vaut de 1 à 9 (`A − K − B − B`
 * quand des lignes sont disjointes par construction, `A(W41) + A(W42) − B(W43)`…). Les témoins de fuite construisent
 * des scénarios où AUCUNE combinaison de cette sorte n'est légitime, et exigent une liste vide.
 */
export function isolations(...reports: readonly unknown[]): readonly string[] {
  const counts = reports.flatMap((report) => publishedCounts(report)).filter((count) => count > 0);
  const reachable = counts.reduce<ReadonlyMap<number, string>>((sums, count) => {
    const next = new Map(sums);
    [...sums].forEach(([sum, expression]) => {
      const terms = expression === '' ? '' : `${expression} `;
      if (!next.has(sum + count)) next.set(sum + count, `${terms}+ ${count}`);
      if (!next.has(sum - count)) next.set(sum - count, `${terms}− ${count}`);
    });
    return next;
  }, new Map([[0, '']]));
  return [...reachable].filter(([sum]) => sum >= 1 && sum < 10).map(([sum, expression]) => `${expression} = ${sum}`);
}
