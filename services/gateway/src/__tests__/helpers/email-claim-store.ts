/**
 * Une base en mémoire pour les témoins de la revendication d'adresse (#8214).
 *
 * Ce double tient les DEUX propriétés dont dépend le transfert, et qu'aucun
 * `mockResolvedValue` ne peut exprimer :
 *
 * - **l'index unique `User_email_key`** : toute écriture qui ferait porter la
 *   même adresse (casse ignorée) à deux lignes LÈVE, comme Mongo (`P2002`) ;
 * - **l'atomicité de `$transaction`** : les transactions s'exécutent l'une
 *   après l'autre, et celle qui lève est ANNULÉE en entier — la base revient à
 *   son état d'avant. Deux transactions concurrentes sur le même document se
 *   sérialisent ainsi comme le conflit d'écriture de Mongo les départage.
 *
 * Les lignes sont lues par le RÉSULTAT (`matchesMongoWhere`), jamais par la
 * clause reçue : un `where` faux rend une ligne fausse, pas un test vert.
 */
import { matchesMongoWhere, type MongoDocument } from './mongo-where';

type Row = MongoDocument & { id: string };

/**
 * Copie profonde qui garde les `Date` de CE royaume — `structuredClone` en rend
 * d'un autre sous Jest, et `toBeInstanceOf(Date)` les refuse.
 */
const clone = <T>(value: T): T => {
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (Array.isArray(value)) return value.map((v) => clone(v)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clone(v)])) as T;
  }
  return value;
};

/**
 * `{ equals, mode: 'insensitive' }` — la forme par laquelle le dépôt cherche une
 * adresse. `matchesMongoWhere` ne connaît pas `mode` : on l'évalue ici, et on
 * lui délègue tout le reste.
 */
function matches(row: MongoDocument, where: MongoDocument | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'OR') return (condition as MongoDocument[]).some((branch) => matches(row, branch));
    if (key === 'AND') return (condition as MongoDocument[]).every((branch) => matches(row, branch));
    const filter = condition as MongoDocument | null;
    if (filter && typeof filter === 'object' && !(filter instanceof Date) && filter.mode === 'insensitive') {
      const value = row[key];
      if (typeof value !== 'string') return false;
      if (typeof filter.equals === 'string') return value.toLowerCase() === filter.equals.toLowerCase();
      if (Array.isArray(filter.in)) return (filter.in as string[]).some((v) => v.toLowerCase() === value.toLowerCase());
      throw new Error(`double: filtre insensible non supporté sur « ${key} »`);
    }
    return matchesMongoWhere(row, { [key]: condition });
  });
}

const uniqueViolation = (): Error =>
  Object.assign(new Error('Unique constraint failed on the constraint: `User_email_key`'), { code: 'P2002' });

function table(rows: Row[], prefix: string) {
  let seq = 0;
  return {
    rows,
    findFirst: async (args: { where?: MongoDocument } = {}) => clone(rows.find((r) => matches(r, args.where)) ?? null),
    findMany: async (args: { where?: MongoDocument } = {}) => clone(rows.filter((r) => matches(r, args.where))),
    findUnique: async (args: { where: MongoDocument }) => clone(rows.find((r) => matches(r, args.where)) ?? null),
    create: async (args: { data: MongoDocument }) => {
      seq += 1;
      const row = { id: `${prefix}-${seq}`, createdAt: new Date(), ...clone(args.data) } as Row;
      rows.push(row);
      return clone(row);
    },
    updateMany: async (args: { where?: MongoDocument; data: MongoDocument }) => {
      const hits = rows.filter((r) => matches(r, args.where));
      hits.forEach((r) => Object.assign(r, clone(args.data)));
      return { count: hits.length };
    },
    update: async (args: { where: MongoDocument; data: MongoDocument }) => {
      const row = rows.find((r) => matches(r, args.where));
      if (!row) throw Object.assign(new Error('Record to update not found.'), { code: 'P2025' });
      Object.assign(row, clone(args.data));
      return clone(row);
    },
  };
}

export type EmailClaimStore = ReturnType<typeof emailClaimStore>;

export function emailClaimStore(initialUsers: readonly MongoDocument[] = []) {
  const state = {
    users: initialUsers.map((u, i) => ({ id: `user-${i + 1}`, createdAt: new Date(0), ...clone(u) })) as Row[],
    magicLinkTokens: [] as Row[],
    passwordResetTokens: [] as Row[],
    securityEvents: [] as Row[],
    watches: [] as Row[],
    participants: [] as Row[],
  };

  const guardUniqueEmail = (): void => {
    const seen = new Set<string>();
    state.users.forEach((u) => {
      const email = String(u.email).toLowerCase();
      if (seen.has(email)) throw uniqueViolation();
      seen.add(email);
    });
  };

  const users = table(state.users, 'user');
  const guarded = {
    ...users,
    create: async (args: { data: MongoDocument }) => {
      const created = await users.create(args);
      try {
        guardUniqueEmail();
      } catch (error) {
        state.users.pop();
        throw error;
      }
      return created;
    },
    updateMany: async (args: { where?: MongoDocument; data: MongoDocument }) => {
      const before = clone(state.users);
      const result = await users.updateMany(args);
      try {
        guardUniqueEmail();
      } catch (error) {
        state.users.splice(0, state.users.length, ...before);
        throw error;
      }
      return result;
    },
    update: async (args: { where: MongoDocument; data: MongoDocument }) => {
      const before = clone(state.users);
      const result = await users.update(args);
      try {
        guardUniqueEmail();
      } catch (error) {
        state.users.splice(0, state.users.length, ...before);
        throw error;
      }
      return result;
    },
  };

  const client = {
    user: guarded,
    magicLinkToken: table(state.magicLinkTokens, 'magic'),
    passwordResetToken: table(state.passwordResetTokens, 'reset'),
    securityEvent: table(state.securityEvents, 'event'),
    emailVerificationWatch: table(state.watches, 'watch'),
    participant: table(state.participants, 'participant'),
    conversation: { findFirst: async () => ({ id: 'conv-meeshy', identifier: 'meeshy' }) },
    message: { create: async () => ({ id: 'msg' }) },
  };

  let queue: Promise<unknown> = Promise.resolve();

  const $transaction = <T>(fn: (tx: typeof client) => Promise<T>): Promise<T> => {
    const run = queue.then(async () => {
      const snapshot = clone(state);
      try {
        return await fn(client);
      } catch (error) {
        (Object.keys(state) as Array<keyof typeof state>).forEach((k) => {
          state[k].splice(0, state[k].length, ...snapshot[k]);
        });
        throw error;
      }
    });
    queue = run.catch(() => undefined);
    return run;
  };

  const byEmail = (email: string): Row[] => state.users.filter((u) => String(u.email).toLowerCase() === email.toLowerCase());
  const byId = (id: string): Row | undefined => state.users.find((u) => u.id === id);

  return { prisma: { ...client, $transaction }, state, byEmail, byId };
}
