/**
 * Un magasin en mémoire qui imite les délégués Prisma et `$runCommandRaw`
 * (`findAndModify`) dont l'annuaire E2EE se sert.
 *
 * Chaque opération Prisma CÈDE la main avant de lire et après avoir écrit
 * (`tick`) : une réservation écrite en « lire puis écrire » y perd la course,
 * exactement comme contre MongoDB. `findAndModify`, lui, s'exécute d'un bloc —
 * c'est la seule opération atomique, comme sur le serveur.
 *
 * Il imite AUSSI le connecteur MongoDB de Prisma là où il diffère de MongoDB
 * brut (leçon 318, #12547) : un `create` n'écrit AUCUN champ facultatif omis
 * (seuls les `@default` du schéma), et un filtre Prisma `{ champ: null }` ne
 * trouve que les documents où le champ est PRÉSENT et nul — jamais ceux où il
 * est absent. `findAndModify`, commande brute, garde la sémantique de MongoDB :
 * `null` y trouve aussi l'absent. Les lignes semées par `insert()` portent,
 * elles, les nuls explicites qu'écrit le code de production.
 */
import { randomBytes } from 'crypto';

type Row = Record<string, unknown> & { id: string };
type Where = Record<string, unknown>;

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

const newId = () => randomBytes(12).toString('hex');

const isOperatorObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !(value instanceof Date) && !Array.isArray(value);

const comparable = (value: unknown): unknown => (value instanceof Date ? value.getTime() : value);

/** `prisma` : le connecteur (null = présent et nul) ; `raw` : MongoDB brut (null = nul ou absent). */
type Semantics = 'prisma' | 'raw';

const isNullUnder = (semantics: Semantics, actual: unknown): boolean =>
  actual === null || (semantics === 'raw' && actual === undefined);

const matchesCondition = (actual: unknown, condition: unknown, semantics: Semantics): boolean => {
  if (condition === null) return isNullUnder(semantics, actual);
  if (!isOperatorObject(condition)) return comparable(actual) === comparable(condition);
  return Object.entries(condition).every(([operator, operand]) => {
    switch (operator) {
      case 'in':
        return (operand as unknown[]).some((candidate) => comparable(candidate) === comparable(actual));
      case 'not':
        if (operand === null) return actual !== null && actual !== undefined;
        return !matchesCondition(actual, operand, semantics);
      case 'lt':
        return actual !== null && actual !== undefined && (comparable(actual) as number) < (comparable(operand) as number);
      case 'gt':
        return actual !== null && actual !== undefined && (comparable(actual) as number) > (comparable(operand) as number);
      case 'isSet':
        return operand ? actual !== undefined : actual === undefined;
      default:
        throw new Error(`opérateur non imité : ${operator}`);
    }
  });
};

const matches = (row: Row, where: Where = {}, semantics: Semantics = 'prisma'): boolean =>
  Object.entries(where).every(([field, condition]) => {
    if (field === 'OR') return (condition as Where[]).some((branch) => matches(row, branch, semantics));
    if (field === 'AND') return (condition as Where[]).every((branch) => matches(row, branch, semantics));
    return matchesCondition(row[field], condition, semantics);
  });

const ordered = (rows: Row[], orderBy?: Record<string, 'asc' | 'desc'>): Row[] => {
  if (!orderBy) return rows;
  const [[field, direction]] = Object.entries(orderBy);
  const sign = direction === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const left = comparable(a[field]) as number | string;
    const right = comparable(b[field]) as number | string;
    if (left === right) return 0;
    return left > right ? sign : -sign;
  });
};

/** Une lecture rend une COPIE, comme MongoDB : une écriture ultérieure ne la change pas sous les pieds du lecteur. */
const snapshot = (row: Row): Row => ({ ...row });

type UniqueKey = readonly string[];

class FakeCollection {
  readonly rows: Row[] = [];

  constructor(
    private readonly uniques: readonly UniqueKey[],
    private readonly defaults: () => Record<string, unknown>,
    private readonly schemaDefaults: () => Record<string, unknown> = () => ({}),
  ) {}

  private assertUnique(candidate: Row): void {
    this.uniques.forEach((key) => {
      const clash = this.rows.some((row) => row.id !== candidate.id && key.every((field) => comparable(row[field]) === comparable(candidate[field])));
      if (clash) throw Object.assign(new Error(`Unique constraint failed on ${key.join(',')}`), { code: 'P2002' });
    });
  }

  /** Une ligne SEMÉE par un test : elle porte les nuls explicites qu'écrit le code de production. */
  insert(data: Record<string, unknown>): Row {
    return this.store({ ...this.defaults(), ...data });
  }

  /** Une ligne écrite par `create` : seuls les `@default` du schéma s'ajoutent, comme avec le connecteur. */
  private created(data: Record<string, unknown>): Row {
    return this.store({ ...this.schemaDefaults(), ...data });
  }

  private store(data: Record<string, unknown>): Row {
    const row: Row = { ...data, id: (data.id as string | undefined) ?? newId() };
    this.assertUnique(row);
    this.rows.push(row);
    return row;
  }

  delegate() {
    return {
      findFirst: async (args: { where?: Where; orderBy?: Record<string, 'asc' | 'desc'> } = {}) => {
        await tick();
        const found = ordered(this.rows.filter((row) => matches(row, args.where)), args.orderBy)[0];
        return found ? snapshot(found) : null;
      },
      findUnique: async (args: { where: Where }) => {
        await tick();
        const found = this.rows.find((row) => matches(row, args.where));
        return found ? snapshot(found) : null;
      },
      findMany: async (args: { where?: Where; orderBy?: Record<string, 'asc' | 'desc'>; take?: number } = {}) => {
        await tick();
        const found = ordered(this.rows.filter((row) => matches(row, args.where)), args.orderBy).map(snapshot);
        return args.take === undefined ? found : found.slice(0, args.take);
      },
      count: async (args: { where?: Where } = {}) => {
        await tick();
        return this.rows.filter((row) => matches(row, args.where)).length;
      },
      create: async (args: { data: Record<string, unknown> }) => {
        await tick();
        return this.created(args.data);
      },
      createMany: async (args: { data: Record<string, unknown>[] }) => {
        await tick();
        args.data.forEach((data) => this.created(data));
        return { count: args.data.length };
      },
      update: async (args: { where: Where; data: Record<string, unknown> }) => {
        await tick();
        const row = this.rows.find((candidate) => matches(candidate, args.where));
        if (!row) throw Object.assign(new Error('Record to update not found'), { code: 'P2025' });
        Object.assign(row, args.data);
        this.assertUnique(row);
        return row;
      },
      upsert: async (args: { where: Where; create: Record<string, unknown>; update: Record<string, unknown> }) => {
        await tick();
        const [unique] = Object.values(args.where) as Where[];
        const row = this.rows.find((candidate) => matches(candidate, unique));
        if (row) return Object.assign(row, args.update);
        return this.created(args.create);
      },
      updateMany: async (args: { where: Where; data: Record<string, unknown> }) => {
        await tick();
        const found = this.rows.filter((row) => matches(row, args.where));
        found.forEach((row) => Object.assign(row, args.data));
        return { count: found.length };
      },
      deleteMany: async (args: { where?: Where } = {}) => {
        await tick();
        const kept = this.rows.filter((row) => !matches(row, args.where));
        const count = this.rows.length - kept.length;
        this.rows.splice(0, this.rows.length, ...kept);
        return { count };
      },
    };
  }
}

const decodeExtendedJson = (value: unknown): unknown => {
  if (!isOperatorObject(value)) return value;
  if ('$oid' in value) return value.$oid;
  if ('$date' in value) return new Date(value.$date as string);
  return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, decodeExtendedJson(inner)]));
};

type FindAndModify = {
  findAndModify: string;
  query: Where;
  sort?: Record<string, 1 | -1>;
  update: { $set?: Record<string, unknown>; $inc?: Record<string, number>; $setOnInsert?: Record<string, unknown> };
  new?: boolean;
  upsert?: boolean;
};

export function createFakeE2EEStore() {
  const collections = {
    E2EEDevice: new FakeCollection(
      [['userId', 'deviceId']],
      () => ({ retiredAt: null, pushTokenId: null, label: null, createdAt: new Date(), lastSeenAt: new Date(), signedPreKeyRotatedAt: new Date() }),
      () => ({ createdAt: new Date(), lastSeenAt: new Date(), signedPreKeyRotatedAt: new Date() }),
    ),
    E2EEOneTimePreKey: new FakeCollection(
      [['userId', 'deviceId', 'registrationId', 'kind', 'keyId']],
      () => ({ usedAt: null, usedBy: null, signature: null, createdAt: new Date() }),
      () => ({ createdAt: new Date() }),
    ),
    MessageEnvelope: new FakeCollection([['messageId', 'recipientUserId', 'recipientDeviceId']], () => ({ createdAt: new Date() }), () => ({ createdAt: new Date() })),
    E2EERevokedIdentity: new FakeCollection([['userId', 'identityKey']], () => ({ revokedAt: new Date() }), () => ({ revokedAt: new Date() })),
    E2EEBindingProof: new FakeCollection([['userId', 'identityKey', 'registrationId']], () => ({})),
    Participant: new FakeCollection([], () => ({ isActive: true, type: 'user' })),
    UserSession: new FakeCollection([], () => ({ isValid: true, invalidatedAt: null, expiresAt: new Date(Date.now() + 86_400_000) })),
  };

  const findAndModify = (command: FindAndModify) => {
    const collection = collections[command.findAndModify as keyof typeof collections];
    if (!collection) throw new Error(`collection non imitée : ${command.findAndModify}`);
    const query = decodeExtendedJson(command.query) as Where;
    const sortEntries = Object.entries(command.sort ?? {});
    const candidates = collection.rows.filter((row) => matches(row, query, 'raw'));
    const sorted = sortEntries.length
      ? ordered(candidates, { [sortEntries[0][0]]: sortEntries[0][1] === -1 ? 'desc' : 'asc' })
      : candidates;
    const set = decodeExtendedJson(command.update.$set ?? {}) as Record<string, unknown>;
    const increments = command.update.$inc ?? {};
    const applyTo = (row: Row) => {
      Object.assign(row, set);
      Object.entries(increments).forEach(([field, by]) => {
        row[field] = ((row[field] as number | undefined) ?? 0) + by;
      });
    };
    const target = sorted[0];
    if (!target && !command.upsert) return { value: null, ok: 1 };
    const row = target ?? collection.insert({ ...query, ...Object.fromEntries(Object.keys(increments).map((field) => [field, 0])) });
    const before = { ...row };
    applyTo(row);
    const value = command.new ? row : before;
    return { value: { ...value, _id: { $oid: row.id } }, ok: 1 };
  };

  const prisma = {
    e2EEDevice: collections.E2EEDevice.delegate(),
    e2EEOneTimePreKey: collections.E2EEOneTimePreKey.delegate(),
    messageEnvelope: collections.MessageEnvelope.delegate(),
    e2EERevokedIdentity: collections.E2EERevokedIdentity.delegate(),
    e2EEBindingProof: collections.E2EEBindingProof.delegate(),
    participant: collections.Participant.delegate(),
    userSession: collections.UserSession.delegate(),
    $runCommandRaw: async (command: unknown) => {
      await tick();
      const typed = command as FindAndModify;
      if (!typed.findAndModify) throw new Error('commande brute non imitée');
      return findAndModify(typed);
    },
  };

  return { prisma, collections };
}

export type FakeE2EEStore = ReturnType<typeof createFakeE2EEStore>;
