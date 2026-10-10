/**
 * Un double de `prisma.userSession` qui APPLIQUE le `where` qu'on lui donne.
 *
 * Un double qui rend ce qu'on lui dit, quel que soit le filtre, ne teste pas
 * la requête — or c'est la requête qui porte la garde des lots #9606 et #9607 :
 * « toutes les AUTRES » s'écrit dans le `where` de `updateMany`, et
 * l'échantillonnage de la dernière activité aussi. Ce double comprend donc les
 * seuls opérateurs que ces requêtes emploient — égalité, `not`, `gt`, `lt`,
 * `isSet`, `OR`, `AND`, `NOT` — et LÈVE sur tout autre, pour qu'un opérateur
 * nouveau ne passe jamais au vert par omission.
 */

export type StoredSession = {
  id: string;
  userId: string;
  sessionToken: string;
  isValid: boolean;
  invalidatedAt: Date | null;
  invalidatedReason: string | null;
  expiresAt: Date;
  createdAt: Date;
  lastActivityAt: Date;
  isTrusted: boolean;
  deviceType: string | null;
  deviceVendor: string | null;
  deviceModel: string | null;
  osName: string | null;
  osVersion: string | null;
  browserName: string | null;
  browserVersion: string | null;
  isMobile: boolean;
  userAgent: string | null;
  ipAddress: string | null;
  country: string | null;
  city: string | null;
  location: string | null;
};

type Where = Record<string, unknown>;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !(value instanceof Date) && !Array.isArray(value);

const same = (a: unknown, b: unknown): boolean =>
  a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b;

function matchesField(actual: unknown, condition: unknown): boolean {
  if (!isPlainObject(condition)) return same(actual, condition);
  return Object.entries(condition).every(([op, operand]) => {
    switch (op) {
      case 'not':
        return !same(actual, operand);
      case 'gt':
        return actual instanceof Date && operand instanceof Date && actual.getTime() > operand.getTime();
      case 'lt':
        return actual instanceof Date && operand instanceof Date && actual.getTime() < operand.getTime();
      case 'isSet':
        return operand === false ? actual === undefined : actual !== undefined;
      default:
        throw new Error(`user-session-store: opérateur non pris en charge « ${op} »`);
    }
  });
}

export function matchesWhere(row: StoredSession, where: Where | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'OR') return (condition as Where[]).some((w) => matchesWhere(row, w));
    if (key === 'AND') return (condition as Where[]).every((w) => matchesWhere(row, w));
    if (key === 'NOT') {
      const clauses = Array.isArray(condition) ? (condition as Where[]) : [condition as Where];
      return clauses.every((w) => !matchesWhere(row, w));
    }
    return matchesField((row as unknown as Record<string, unknown>)[key], condition);
  });
}

function project(row: StoredSession, select: Record<string, boolean> | undefined): Record<string, unknown> {
  if (!select) return { ...row };
  return Object.fromEntries(
    Object.entries(select)
      .filter(([, wanted]) => wanted)
      .map(([key]) => [key, (row as unknown as Record<string, unknown>)[key]])
  );
}

export function makeSession(overrides: Partial<StoredSession> & Pick<StoredSession, 'id' | 'userId' | 'sessionToken'>): StoredSession {
  const now = new Date();
  return {
    isValid: true,
    invalidatedAt: null,
    invalidatedReason: null,
    expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    createdAt: now,
    lastActivityAt: now,
    isTrusted: false,
    deviceType: null,
    deviceVendor: null,
    deviceModel: null,
    osName: null,
    osVersion: null,
    browserName: null,
    browserVersion: null,
    isMobile: false,
    userAgent: null,
    ipAddress: null,
    country: null,
    city: null,
    location: null,
    ...overrides,
  };
}

export function createUserSessionStore(initial: readonly StoredSession[]) {
  const rows = initial.map((row) => ({ ...row }));
  const calls = { update: 0, updateMany: 0 };

  const store = {
    rows,
    calls,
    async findFirst(args: { where?: Where; select?: Record<string, boolean> }) {
      const row = rows.find((r) => matchesWhere(r, args.where));
      return row ? project(row, args.select) : null;
    },
    async findMany(args: { where?: Where; select?: Record<string, boolean>; take?: number }) {
      const found = rows.filter((r) => matchesWhere(r, args.where));
      const bounded = typeof args.take === 'number' ? found.slice(0, args.take) : found;
      return bounded.map((r) => project(r, args.select));
    },
    async updateMany(args: { where?: Where; data: Partial<StoredSession> }) {
      calls.updateMany += 1;
      const targets = rows.filter((r) => matchesWhere(r, args.where));
      targets.forEach((r) => Object.assign(r, args.data));
      return { count: targets.length };
    },
    async update(args: { where: Where; data: Partial<StoredSession> }) {
      calls.update += 1;
      const row = rows.find((r) => matchesWhere(r, args.where));
      if (!row) throw new Error('user-session-store: update sans ligne (P2025)');
      Object.assign(row, args.data);
      return { ...row };
    },
    byId(id: string): StoredSession {
      const row = rows.find((r) => r.id === id);
      if (!row) throw new Error(`user-session-store: aucune session ${id}`);
      return row;
    },
  };
  return store;
}

export type UserSessionStore = ReturnType<typeof createUserSessionStore>;
