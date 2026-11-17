/**
 * Une table `user_preferences` en mémoire qui se comporte comme Mongo là où une
 * course se joue : une LECTURE rend l'instantané pris à l'appel, pas celui de
 * l'arrivée (`readLatencyMs`), et une mise à jour par PIPELINE (`$runCommandRaw`)
 * s'applique d'un seul tenant sur le document, au moment de l'appel.
 *
 * C'est exactement ce qui sépare « lire, fusionner côté serveur, écrire la
 * colonne entière » (deux gestes rapprochés se perdent) de « fusionner DANS la
 * base » (aucun ne se perd). Un double dont la lecture rend l'état courant à la
 * livraison masquerait la course : le témoin ne rougirait jamais.
 *
 * L'évaluateur ne connaît que les opérateurs que la route emploie ; un opérateur
 * inconnu LÈVE, au lieu d'être pris pour un littéral.
 */

type Doc = Record<string, unknown>;

const isObject = (value: unknown): value is Doc =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const typeOf = (value: unknown): string =>
  value === undefined ? 'missing' : value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;

function evaluate(expression: unknown, doc: Doc, now: Date): unknown {
  if (typeof expression === 'string') {
    if (expression === '$$NOW') return now;
    if (expression.startsWith('$')) return doc[expression.slice(1)];
    return expression;
  }
  if (Array.isArray(expression)) return expression.map((item) => evaluate(item, doc, now));
  if (!isObject(expression)) return expression;

  const entries = Object.entries(expression);
  const operator = entries.length === 1 && entries[0][0].startsWith('$') ? entries[0][0] : null;
  if (operator === null) return Object.fromEntries(entries.map(([key, value]) => [key, evaluate(value, doc, now)]));

  const argument = entries[0][1];
  switch (operator) {
    case '$literal':
      return structuredClone(argument);
    case '$mergeObjects':
      return Object.assign({}, ...(argument as unknown[]).map((item) => {
        const value = evaluate(item, doc, now);
        return isObject(value) ? value : {};
      }));
    case '$cond': {
      const [test, whenTrue, whenFalse] = argument as unknown[];
      return evaluate(test, doc, now) ? evaluate(whenTrue, doc, now) : evaluate(whenFalse, doc, now);
    }
    case '$eq': {
      const [left, right] = (argument as unknown[]).map((item) => evaluate(item, doc, now));
      return left === right;
    }
    case '$type':
      return typeOf(evaluate(argument, doc, now));
    default:
      throw new Error(`user-preferences-store : opérateur ${operator} non modélisé`);
  }
}

export type UserPreferencesStoreOptions = {
  readonly rows?: Readonly<Record<string, Doc>>;
  readonly readLatencyMs?: number;
};

export function makeUserPreferencesStore({ rows = {}, readLatencyMs = 0 }: UserPreferencesStoreOptions = {}) {
  const table = new Map<string, Doc>(Object.entries(rows).map(([userId, row]) => [userId, { id: `pref-${userId}`, userId, ...row }]));
  const project = (row: Doc | undefined, select?: Record<string, boolean>): Doc | null =>
    row === undefined
      ? null
      : select === undefined
        ? { ...row }
        : Object.fromEntries(Object.entries(select).filter(([, on]) => on).map(([key]) => [key, row[key]]));

  const userPreferences = {
    findUnique: async ({ where, select }: { where: { userId: string }; select?: Record<string, boolean> }) => {
      const snapshot = structuredClone(project(table.get(where.userId), select));
      if (readLatencyMs > 0) await new Promise((resolve) => setTimeout(resolve, readLatencyMs));
      return snapshot;
    },
    upsert: async ({ where, create, update, select }: {
      where: { userId: string }; create: Doc; update: Doc; select?: Record<string, boolean>;
    }) => {
      const existing = table.get(where.userId);
      const next = existing ? { ...existing, ...update } : { id: `pref-${where.userId}`, ...create };
      table.set(where.userId, next);
      return project(next, select);
    },
    updateMany: async ({ where, data }: { where: { userId: string }; data: Doc }) => {
      const existing = table.get(where.userId);
      if (existing) table.set(where.userId, { ...existing, ...data });
      return { count: existing ? 1 : 0 };
    },
  };

  const $runCommandRaw = async (command: Doc) => {
    if (command.update !== 'user_preferences') throw new Error(`user-preferences-store : collection ${String(command.update)} non modélisée`);
    let matched = 0;
    for (const statement of command.updates as Array<{ q: { userId: { $oid: string } }; u: Doc[] }>) {
      const row = table.get(statement.q.userId.$oid);
      if (!row) continue;
      matched += 1;
      const now = new Date();
      const next = statement.u.reduce<Doc>((current, stage) => {
        const set = stage.$set as Doc | undefined;
        if (!set) throw new Error('user-preferences-store : étage de pipeline non modélisé');
        return { ...current, ...Object.fromEntries(Object.entries(set).map(([key, value]) => [key, evaluate(value, current, now)])) };
      }, row);
      table.set(statement.q.userId.$oid, next);
    }
    return { ok: 1, n: matched, nModified: matched };
  };

  return { userPreferences, $runCommandRaw, rowOf: (userId: string) => table.get(userId) };
}
