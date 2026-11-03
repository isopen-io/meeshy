/**
 * Une table `report` en mémoire qui ÉVALUE ce que la file de modération lui
 * demande (`priorityFirst`, #14110) : `AND`, `NOT`, `priority.gte`, `status`
 * (valeur ou `in`), les égalités simples, `createdAt.gte` ; `orderBy` en objet
 * ou en tableau de clés ; `skip` et `take` ; `findFirst` (le dédoublonnage d'un
 * signalement ouvert, #14627). Un champ absent se lit comme Mongo :
 * `priority` absente ne vaut pas `>= 1`.
 */
import { jest } from '@jest/globals';

export type ReportRow = {
  readonly id: string;
  readonly createdAt: Date;
  readonly status: string;
  readonly reportType: string;
  readonly reportedType: string;
  readonly reportedEntityId: string;
  readonly priority?: number;
  readonly [key: string]: unknown;
};

type Where = { readonly [key: string]: unknown };
type Order = Record<string, 'asc' | 'desc'>;

const isRecord = (value: unknown): value is Where => typeof value === 'object' && value !== null && !(value instanceof Date) && !Array.isArray(value);

function fieldMatches(value: unknown, condition: unknown): boolean {
  if (!isRecord(condition)) return value === condition;
  if ('in' in condition) return (condition.in as unknown[]).includes(value);
  if ('gte' in condition) return value !== undefined && value !== null && (value as number | Date) >= (condition.gte as number | Date);
  return value === condition;
}

export function reportMatches(row: ReportRow, where: Where = {}): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'AND') return (condition as Where[]).every((part) => reportMatches(row, part));
    if (key === 'NOT') return !reportMatches(row, condition as Where);
    return fieldMatches(row[key], condition);
  });
}

const sortable = (value: unknown): number | string => (value instanceof Date ? value.getTime() : (value as number | string | undefined) ?? -Infinity);

function compare(orders: readonly Order[]) {
  return (a: ReportRow, b: ReportRow): number => {
    for (const order of orders) {
      const [key, dir] = Object.entries(order)[0];
      const [x, y] = [sortable(a[key]), sortable(b[key])];
      if (x !== y) return (x < y ? -1 : 1) * (dir === 'asc' ? 1 : -1);
    }
    return 0;
  };
}

export function reportTable(rows: readonly ReportRow[]) {
  const ordered = (args: { where?: Where; orderBy?: Order | Order[] }) => {
    const orders = Array.isArray(args.orderBy) ? args.orderBy : [args.orderBy ?? { createdAt: 'desc' }];
    return rows.filter((row) => reportMatches(row, args.where)).sort(compare(orders));
  };
  return {
    count: jest.fn(async (args: { where?: Where } = {}) => rows.filter((row) => reportMatches(row, args.where)).length),
    findFirst: jest.fn(async (args: { where?: Where; orderBy?: Order | Order[] } = {}) => ordered(args)[0] ?? null),
    findMany: jest.fn(async (args: { where?: Where; orderBy?: Order | Order[]; skip?: number; take?: number } = {}) => {
      const sorted = ordered(args);
      const skip = args.skip ?? 0;
      return sorted.slice(skip, args.take === undefined ? undefined : skip + args.take);
    }),
  };
}
