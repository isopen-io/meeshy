/**
 * Un faux client Prisma EN MÉMOIRE pour les tests du jeu : il ne reproduit que
 * ce que les services du jeu lisent et écrivent, mais il reproduit CE QUE
 * MONGODB FAIT — un champ absent se relit null mais ne matche PAS `{ f: null }`
 * (seul `isSet: false` l'atteint), seuls les `@default` du schéma sont posés à la
 * création, un index unique rejette avec
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
    // Prisma sur MongoDB : `{ f: null }` ne matche QUE le champ PRÉSENT à null,
    // jamais le champ ABSENT (leçon 318) — seul `isSet: false` l'atteint.
    if (expected === null) return actual === null;
    return actual instanceof Date && expected instanceof Date ? actual.getTime() === expected.getTime() : actual === expected;
  }
  return Object.entries(expected).every(([op, value]) => {
    if (op === 'in') return (value as unknown[]).includes(actual);
    if (op === 'gte') return typeof actual === 'number' ? actual >= (value as number) : actual instanceof Date ? actual >= (value as Date) : typeof actual === 'string' && actual >= (value as string);
    if (op === 'lt') return typeof actual === 'number' ? actual < (value as number) : actual instanceof Date ? actual < (value as Date) : typeof actual === 'string' && actual < (value as string);
    if (op === 'lte') return typeof actual === 'number' ? actual <= (value as number) : actual instanceof Date && actual <= (value as Date);
    if (op === 'notIn') return !(value as unknown[]).includes(actual);
    if (op === 'startsWith') return typeof actual === 'string' && actual.startsWith(value as string);
    if (op === 'gt') return typeof actual === 'number' && actual > (value as number);
    if (op === 'not') return !matchField(actual, value);
    if (op === 'has') return Array.isArray(actual) && actual.includes(value);
    if (op === 'isSet') return (actual !== undefined) === value;
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

type ModelOptions = {
  readonly uniques?: readonly (readonly string[])[];
  readonly defaults?: () => Record<string, unknown>;
  /** Les champs optionnels du schéma : ABSENTS en base, relus `null` par Prisma. */
  readonly optional?: readonly string[];
};

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

  private read(row: Row | undefined, select?: Record<string, boolean>): Row | null {
    if (!row || select) return project(row, select);
    const absent = (this.options.optional ?? []).filter((key) => row[key] === undefined);
    return { ...Object.fromEntries(absent.map((key) => [key, null])), ...project(row) } as Row;
  }

  async create(args: { data: Record<string, unknown>; select?: Record<string, boolean> }) {
    const row: Row = { id: nextId(), createdAt: new Date(), ...(this.options.defaults?.() ?? {}), ...args.data };
    this.assertUnique(row);
    this.rows.push(row);
    return project(row, args.select);
  }

  async findUnique(args: { where: Where; select?: Record<string, boolean> }) {
    return this.read(this.find(args.where), args.select);
  }

  async findFirst(args: { where?: Where; select?: Record<string, boolean> }) {
    return this.read(this.rows.find((row) => matches(row, args.where ?? {})), args.select);
  }

  async findMany(args: { where?: Where; select?: Record<string, boolean>; orderBy?: Record<string, 'asc' | 'desc'>; take?: number } = {}) {
    let found = this.rows.filter((row) => matches(row, args.where ?? {}));
    const order = args.orderBy && Object.entries(args.orderBy)[0];
    if (order) {
      const [field, dir] = order;
      const rank = (value: unknown): number | string => (value instanceof Date ? value.getTime() : (value as number | string));
      const compare = (a: Row, b: Row): number => {
        const left = rank(a[field]);
        const right = rank(b[field]);
        return left < right ? -1 : left > right ? 1 : 0;
      };
      found = [...found].sort((a, b) => compare(a, b) * (dir === 'asc' ? 1 : -1));
    }
    return found.slice(0, args.take ?? found.length).map((row) => this.read(row, args.select));
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

  async groupBy(args: { by: string[]; where?: Where; _count?: { _all?: boolean } }) {
    const found = this.rows.filter((row) => matches(row, args.where ?? {}));
    const groups = new Map<string, Row[]>();
    for (const row of found) {
      const key = args.by.map((field) => String(row[field])).join('|');
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    return [...groups.values()].map((rows) => ({
      ...Object.fromEntries(args.by.map((field) => [field, rows[0]![field]])),
      _count: { _all: rows.length },
    }));
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
  readonly conversationEngagement: Model;
  readonly gameProfile: Model;
  readonly leaguePseudonym: Model;
  readonly leagueGroupWeek: Model;
  readonly leagueMembership: Model;
  readonly gameWeekPoints: Model;
  readonly gameDuo: Model;
  readonly gameDuoSlot: Model;
  readonly gameSeason: Model;
  readonly gameTrophy: Model;
  readonly atlasStamp: Model;
  readonly achievementRarityStat: Model;
  readonly friendRequest: Model;
  readonly userPreferences: Model;
};

export function fakeGameDb(): FakeGameDb {
  const user = flattenCompound(new Model());
  const gloryLedger = flattenCompound(new Model({ uniques: [['userId', 'requestId']] }));
  const meeshLedger = flattenCompound(new Model({ uniques: [['userId', 'requestId']] }));
  const dailyMission = flattenCompound(new Model({ uniques: [['userId', 'dayKey', 'slot']], defaults: () => ({ progress: 0, seen: [], prism: false, glory: 0 }), optional: ['completedAt', 'paidPoints', 'rerolledAt'] }));
  const gameDay = flattenCompound(new Model({ uniques: [['userId', 'dayKey']], defaults: () => ({ rerollCount: 0 }), optional: ['chestClaimedAt', 'chestPoints', 'chestFragment', 'chestFreeze'] }));
  const engagementCounter = flattenCompound(new Model({ uniques: [['userId', 'axisKey']] }));
  const engagementQuota = flattenCompound(new Model({ uniques: [['userId', 'operationKey', 'bucket']] }));
  const engagementMilestone = flattenCompound(new Model({ uniques: [['userId', 'milestoneType', 'milestoneKey']] }));
  const participant = new Model();
  const message = new Model();
  const conversationEngagement = flattenCompound(new Model({ uniques: [['userId', 'conversationId']] }));
  const gameProfile = flattenCompound(new Model({ uniques: [['userId']] }));
  const leaguePseudonym = flattenCompound(new Model({ uniques: [['userId'], ['pseudonymKey']] }));
  const leagueGroupWeek = flattenCompound(new Model({ uniques: [['groupId']], optional: ['snapshotDay', 'snapshot', 'settledAt'] }));
  const leagueMembership = flattenCompound(
    new Model({ uniques: [['userId', 'weekKey']], optional: ['finalRank', 'finalPoints', 'zone', 'cup', 'settledAt'] }),
  );
  const gameWeekPoints = flattenCompound(new Model({ uniques: [['userId', 'weekKey']], defaults: () => ({ points: 0 }) }));
  const gameDuo = flattenCompound(
    new Model({
      defaults: () => ({ inviterProgress: 0, inviteeProgress: 0 }),
      optional: ['acceptedAt', 'endedAt', 'inviterPaidAt', 'inviteePaidAt', 'templateKey', 'signal', 'prism', 'partTarget', 'commonTarget'],
    }),
  );
  const gameDuoSlot = flattenCompound(new Model({ uniques: [['userId', 'weekKey']] }));
  const gameSeason = flattenCompound(
    new Model({ uniques: [['userId', 'number']], defaults: () => ({ stars: 0, claimedSteps: [] }), optional: ['sealOwnedAt', 'settledAt'] }),
  );
  const gameTrophy = flattenCompound(new Model({ uniques: [['userId', 'key']] }));
  const atlasStamp = flattenCompound(new Model({ uniques: [['userId', 'language']], optional: ['sentAt', 'receivedAt', 'stampedOn'] }));
  const achievementRarityStat = flattenCompound(new Model({ uniques: [['milestoneKey']] }));
  const friendRequest = new Model();
  const userPreferences = new Model();
  const models = {
    user,
    gloryLedger,
    meeshLedger,
    dailyMission,
    gameDay,
    engagementCounter,
    engagementQuota,
    engagementMilestone,
    participant,
    message,
    conversationEngagement,
    gameProfile,
    leaguePseudonym,
    leagueGroupWeek,
    leagueMembership,
    gameWeekPoints,
    gameDuo,
    gameDuoSlot,
    gameSeason,
    gameTrophy,
    atlasStamp,
    achievementRarityStat,
    friendRequest,
    userPreferences,
  };

  /**
   * La seule commande brute que le service émet : `findAndModify` sur `User`
   * avec un pipeline `$add` / `$ifNull` — l'incrément qui lit l'ABSENCE comme zéro.
   */
  const $runCommandRaw = async (command: {
    findAndModify: string;
    query: { _id: { $oid: string } };
    update: { $set: Record<string, { $add: [{ $ifNull: [string, number] }, number] }> }[];
    fields?: Record<string, number>;
  }) => {
    const row = user.rows.find((r) => r.id === command.query._id.$oid);
    if (!row) return { ok: 1, value: null };
    for (const [key, expression] of Object.entries(command.update[0]!.$set)) {
      const before = row[key];
      row[key] = (typeof before === 'number' ? before : expression.$add[0].$ifNull[1]) + expression.$add[1];
    }
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(command.fields ?? {})) out[key] = row[key] ?? null;
    return { ok: 1, value: out };
  };

  const client = { ...models, $runCommandRaw };
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
