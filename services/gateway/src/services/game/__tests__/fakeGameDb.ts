/**
 * Un faux client Prisma EN MÉMOIRE pour les tests du jeu : il ne reproduit que
 * ce que les services du jeu lisent et écrivent, mais il reproduit CE QUE
 * MONGODB FAIT — un champ absent se relit null, un index unique rejette avec
 * `P2002`, une transaction s'annule en bloc, `NOT`/absence ne s'inventent pas.
 *
 * Un faux qui traiterait l'absence comme un zéro ferait passer pour correct le
 * code qui incrémente une colonne (leçon #6428).
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';

type Row = Record<string, unknown> & { id: string };
type Where = Record<string, unknown>;

let sequence = 0;
const nextId = (): string => (++sequence).toString(16).padStart(24, '0');

export const uniqueViolation = () => Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
export const writeConflict = () => Object.assign(new Error('write conflict'), { code: 'P2034' });

const isOperator = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !(value instanceof Date) && !Array.isArray(value);

const matchField = (actual: unknown, expected: unknown): boolean => {
  if (!isOperator(expected)) {
    if (expected === null) return actual === null || actual === undefined;
    return actual instanceof Date && expected instanceof Date ? actual.getTime() === expected.getTime() : actual === expected;
  }
  return Object.entries(expected).every(([op, value]) => {
    if (op === 'in') return (value as unknown[]).includes(actual);
    if (op === 'gte') return typeof actual === 'number' ? actual >= (value as number) : actual instanceof Date && actual >= (value as Date);
    if (op === 'lt') return typeof actual === 'number' ? actual < (value as number) : actual instanceof Date && actual < (value as Date);
    if (op === 'gt') return typeof actual === 'number' && actual > (value as number);
    if (op === 'not') return !matchField(actual, value);
    if (op === 'has') return Array.isArray(actual) && actual.includes(value);
    throw new Error(`opérateur non reproduit par le faux : ${op}`);
  });
};

const matches = (row: Row, where: Where): boolean =>
  Object.entries(where).every(([key, expected]) => {
    if (key === 'OR') return (expected as Where[]).some((clause) => matches(row, clause));
    if (key === 'AND') return (expected as Where[]).every((clause) => matches(row, clause));
    return matchField(row[key], expected);
  });

const applyData = (row: Row, data: Record<string, unknown>): void => {
  for (const [key, value] of Object.entries(data)) {
    if (isOperator(value) && ('increment' in value || 'decrement' in value || 'push' in value)) {
      if ('push' in value) {
        const current = Array.isArray(row[key]) ? (row[key] as unknown[]) : [];
        row[key] = [...current, ...(Array.isArray(value.push) ? value.push : [value.push])];
        continue;
      }
      const before = row[key];
      if (typeof before !== 'number') {
        row[key] = null;
        continue;
      }
      row[key] = before + ((value.increment as number | undefined) ?? 0) - ((value.decrement as number | undefined) ?? 0);
      continue;
    }
    row[key] = value;
  }
};

const project = (row: Row | undefined, select?: Record<string, boolean>): Row | null => {
  if (!row) return null;
  if (!select) return { ...row };
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(select)) if (select[key]) out[key] = row[key] ?? null;
  return out as Row;
};

type ModelOptions = { readonly uniques?: readonly (readonly string[])[]; readonly defaults?: () => Record<string, unknown> };

class Model {
  rows: Row[] = [];
  constructor(private readonly options: ModelOptions = {}) {}

  private assertUnique(candidate: Row, ignore?: Row): void {
    for (const keys of this.options.uniques ?? []) {
      const clash = this.rows.some(
        (row) => row !== ignore && keys.every((key) => row[key] !== undefined && row[key] === candidate[key]),
      );
      if (clash) throw uniqueViolation();
    }
  }

  private find(where: Where): Row | undefined {
    return this.rows.find((row) => matches(row, where));
  }

  async create(args: { data: Record<string, unknown>; select?: Record<string, boolean> }) {
    const row: Row = { id: nextId(), createdAt: new Date(), ...(this.options.defaults?.() ?? {}), ...args.data };
    this.assertUnique(row);
    this.rows.push(row);
    return project(row, args.select);
  }

  async findUnique(args: { where: Where; select?: Record<string, boolean> }) {
    return project(this.find(args.where), args.select);
  }

  async findFirst(args: { where?: Where; select?: Record<string, boolean> }) {
    return project(this.rows.find((row) => matches(row, args.where ?? {})), args.select);
  }

  async findMany(args: { where?: Where; select?: Record<string, boolean>; orderBy?: Record<string, 'asc' | 'desc'>; take?: number } = {}) {
    let found = this.rows.filter((row) => matches(row, args.where ?? {}));
    const order = args.orderBy && Object.entries(args.orderBy)[0];
    if (order) {
      const [field, dir] = order;
      found = [...found].sort((a, b) => ((a[field] as number) - (b[field] as number)) * (dir === 'asc' ? 1 : -1));
    }
    return found.slice(0, args.take ?? found.length).map((row) => project(row, args.select));
  }

  async count(args: { where?: Where } = {}) {
    return this.rows.filter((row) => matches(row, args.where ?? {})).length;
  }

  async update(args: { where: Where; data: Record<string, unknown>; select?: Record<string, boolean> }) {
    const row = this.find(args.where);
    if (!row) throw Object.assign(new Error('Record not found'), { code: 'P2025' });
    const copy = { ...row };
    applyData(copy, args.data);
    this.assertUnique(copy, row);
    Object.assign(row, copy);
    return project(row, args.select);
  }

  async updateMany(args: { where?: Where; data: Record<string, unknown> }) {
    const targets = this.rows.filter((row) => matches(row, args.where ?? {}));
    for (const row of targets) applyData(row, args.data);
    return { count: targets.length };
  }

  async upsert(args: { where: Where; create: Record<string, unknown>; update: Record<string, unknown>; select?: Record<string, boolean> }) {
    const row = this.find(args.where);
    if (row) return this.update({ where: args.where, data: args.update, ...(args.select ? { select: args.select } : {}) });
    return this.create({ data: args.create, ...(args.select ? { select: args.select } : {}) });
  }

  async deleteMany(args: { where?: Where } = {}) {
    const before = this.rows.length;
    this.rows = this.rows.filter((row) => !matches(row, args.where ?? {}));
    return { count: before - this.rows.length };
  }

  async aggregate(args: { where?: Where; _sum?: Record<string, boolean> }) {
    const found = this.rows.filter((row) => matches(row, args.where ?? {}));
    const field = Object.keys(args._sum ?? {})[0];
    return { _sum: { [field ?? 'x']: found.length === 0 || !field ? null : found.reduce((s, r) => s + (r[field] as number), 0) } };
  }

  snapshot(): Row[] {
    return this.rows.map((row) => ({ ...row }));
  }

  restore(rows: Row[]): void {
    this.rows = rows.map((row) => ({ ...row }));
  }
}

/** Les clés composées de Prisma (`userId_requestId`) se lisent comme leurs champs. */
const flattenCompound = (model: Model): Model => {
  const proto = model as unknown as Record<string, (args: { where?: Where }) => unknown>;
  for (const method of ['findUnique', 'update', 'upsert'] as const) {
    const original = proto[method]!.bind(model);
    proto[method] = (args: { where?: Where }) => {
      const where: Where = {};
      for (const [key, value] of Object.entries(args.where ?? {})) {
        if (key.includes('_') && isOperator(value)) Object.assign(where, value);
        else where[key] = value;
      }
      return original({ ...args, where });
    };
  }
  return model;
};

export type FakeGameDb = {
  readonly prisma: PrismaClient;
  readonly user: Model;
  readonly gloryLedger: Model;
  readonly meeshLedger: Model;
  readonly dailyMission: Model;
  readonly gameDay: Model;
  readonly engagementCounter: Model;
  readonly engagementQuota: Model;
  readonly engagementMilestone: Model;
  readonly participant: Model;
  readonly message: Model;
};

export function fakeGameDb(): FakeGameDb {
  const user = flattenCompound(new Model());
  const gloryLedger = flattenCompound(new Model({ uniques: [['userId', 'requestId']] }));
  const meeshLedger = flattenCompound(new Model({ uniques: [['userId', 'requestId']] }));
  const dailyMission = flattenCompound(new Model({ uniques: [['userId', 'dayKey', 'slot']], defaults: () => ({ progress: 0, seen: [], prism: false, glory: 0, completedAt: null, rerolledAt: null, paidPoints: null }) }));
  const gameDay = flattenCompound(new Model({ uniques: [['userId', 'dayKey']], defaults: () => ({ rerollCount: 0, chestClaimedAt: null, chestPoints: null, chestFragment: null, chestFreeze: null }) }));
  const engagementCounter = flattenCompound(new Model({ uniques: [['userId', 'axisKey']] }));
  const engagementQuota = flattenCompound(new Model({ uniques: [['userId', 'operationKey', 'bucket']] }));
  const engagementMilestone = flattenCompound(new Model({ uniques: [['userId', 'milestoneType', 'milestoneKey']] }));
  const participant = new Model();
  const message = new Model();
  const models = { user, gloryLedger, meeshLedger, dailyMission, gameDay, engagementCounter, engagementQuota, engagementMilestone, participant, message };

  const client = { ...models };
  // Les transactions se SÉRIALISENT : Mongo n'en laisse pas deux écrire le même
  // document, la perdante est annulée seule. Sans verrou, l'annulation d'une
  // transaction (restauration de son instantané) effacerait l'écriture d'une
  // autre qui s'est entrelacée — un défaut du faux, pas du code testé.
  let tail: Promise<unknown> = Promise.resolve();
  const $transaction = async <T>(work: (tx: typeof client) => Promise<T>): Promise<T> => {
    const run = async (): Promise<T> => {
      const saved = Object.entries(models).map(([name, model]) => [name, model.snapshot()] as const);
      try {
        return await work(client);
      } catch (error) {
        for (const [name, rows] of saved) models[name as keyof typeof models].restore(rows);
        throw error;
      }
    };
    const result = tail.then(run, run);
    tail = result.catch(() => undefined);
    return result;
  };
  const prisma = { ...client, $transaction } as unknown as PrismaClient;
  return { prisma, ...models };
}

export const USER = '68a000000000000000000001';
export const OTHER = '68a000000000000000000002';

/** Un compte tel qu'un test le pose — jamais plus que ce qu'il dit. */
export const seedUser = (db: FakeGameDb, fields: Record<string, unknown> = {}, id = USER): Row => {
  const row: Row = { id, timezone: 'UTC', createdAt: new Date('2026-01-01T00:00:00Z'), blockedUserIds: [], guideSeen: [], ...fields };
  db.user.rows.push(row);
  return row;
};
