/**
 * CE QUE MONGODB FAIT D'UNE COMMANDE DU COMPTEUR — pour les doubles de test (#10541).
 *
 * `EngagementCounterWrites` écrit par `findAndModify` et pipeline d'agrégation.
 * Un double qui additionnerait `undefined + n` comme `n` rendrait vert le code
 * qui oublie `$ifNull` : c'est exactement le défaut de production. Les règles
 * reproduites ici sont celles MESURÉES le 2026-10-13 sur un MongoDB 8.0.4
 * jetable, avec le client Prisma du dépôt :
 *
 *  - `$add` et `$subtract` rendent `null` dès qu'un opérande est absent ou `null` ;
 *  - `$ifNull` remplace `null` ET l'absence ;
 *  - `$max` ignore les opérandes `null` ;
 *  - un filtre `{ $gte: n }` ou `{ $gt: n }` ne matche ni `null` ni l'absence ;
 *  - `upsert: true` crée la ligne avec les champs d'égalité de la requête, et le
 *    pipeline s'y applique comme à un document vide ;
 *  - `new: false` rend l'image d'AVANT, `null` quand rien n'a matché.
 *
 * Rien d'autre n'est reproduit : un opérateur inconnu LÈVE, pour qu'une commande
 * nouvelle ne passe pas en silence sur un double qui ne la comprend pas.
 */

export type MongoLikeRow = Record<string, unknown>;

type Expression = unknown;

const isAbsent = (value: unknown): value is null | undefined => value === null || value === undefined;

export function evaluateExpression(expression: Expression, row: MongoLikeRow): unknown {
  if (typeof expression === 'number' || typeof expression === 'boolean') return expression;
  if (typeof expression === 'string') {
    if (expression === '$$NOW') return new Date();
    return expression.startsWith('$') ? row[expression.slice(1)] : expression;
  }
  const [operator, operands] = Object.entries(expression as Record<string, Expression[]>)[0]!;
  if (operator === '$ifNull') {
    const value = evaluateExpression(operands[0], row);
    return isAbsent(value) ? evaluateExpression(operands[1], row) : value;
  }
  if (operator === '$toLong') {
    // `$toLong` (#10912) : un opérande unique, `null` ou absent rend `null` ; un `long` déjà gravé (BigInt du client) se relit en nombre.
    const value = evaluateExpression(Array.isArray(operands) ? operands[0] : operands, row);
    if (isAbsent(value)) return null;
    return typeof value === 'bigint' ? Number(value) : Math.trunc(Number(value));
  }
  const values = operands.map((operand) => evaluateExpression(operand, row));
  if (operator === '$max') {
    const present = values.filter((value): value is number => typeof value === 'number');
    return present.length === 0 ? null : Math.max(...present);
  }
  if (operator === '$min') {
    const present = values.filter((value): value is number => typeof value === 'number');
    return present.length === 0 ? null : Math.min(...present);
  }
  if (operator === '$add' || operator === '$subtract') {
    if (!values.every((value): value is number => typeof value === 'number')) return null;
    return operator === '$add' ? values.reduce((sum, value) => sum + value, 0) : values[0]! - values[1]!;
  }
  throw new Error(`opérateur de pipeline non reproduit par le double : ${operator}`);
}

const matchesCondition = (actual: unknown, condition: unknown): boolean => {
  if (typeof condition !== 'object' || condition === null) return actual === condition;
  return Object.entries(condition as Record<string, unknown>).every(([operator, expected]) => {
    if (operator === '$oid') return actual === expected;
    if (operator === '$gte') return typeof actual === 'number' && actual >= (expected as number);
    if (operator === '$gt') return typeof actual === 'number' && actual > (expected as number);
    // `$in` : `null` y couvre aussi l'absence ; `$exists` : la présence du champ, `null` compris (rattrapage #10845).
    if (operator === '$in') return (expected as unknown[]).some((candidate) => (candidate === null ? isAbsent(actual) : actual === candidate));
    if (operator === '$exists') return (actual !== undefined) === expected;
    throw new Error(`opérateur de requête non reproduit par le double : ${operator}`);
  });
};

const equalityFields = (query: Record<string, unknown>): MongoLikeRow =>
  Object.fromEntries(
    Object.entries(query)
      .filter(([key]) => key !== '$or')
      .map(([key, condition]): [string, unknown] | null => {
        if (typeof condition !== 'object' || condition === null) return [key, condition];
        return '$oid' in condition ? [key, (condition as { $oid: string }).$oid] : null;
      })
      .filter((entry): entry is [string, unknown] => entry !== null),
  );

export type FindAndModifyCommand = {
  readonly findAndModify: string;
  readonly query: Record<string, unknown>;
  readonly update: readonly { readonly $set: Record<string, Expression> }[];
  readonly upsert?: boolean;
  readonly new?: boolean;
  readonly fields?: Record<string, number>;
};

/**
 * Applique un `findAndModify` par pipeline à `rows`, EN PLACE, et rend ce que
 * MongoDB rendrait. `create` fabrique la ligne d'un `upsert` (son identifiant
 * appartient au double appelant).
 */
export function findAndModifyLikeMongo(
  rows: MongoLikeRow[],
  command: FindAndModifyCommand,
  create: (fields: MongoLikeRow) => MongoLikeRow = (fields) => ({ ...fields }),
): { ok: 1; value: MongoLikeRow | null } {
  const matchesQuery = (row: MongoLikeRow, query: Record<string, unknown>): boolean =>
    Object.entries(query).every(([key, condition]) =>
      key === '$or' ? (condition as Record<string, unknown>[]).some((branch) => matchesQuery(row, branch)) : matchesCondition(row[key], condition),
    );
  const found = rows.find((row) => matchesQuery(row, command.query));
  if (!found && !command.upsert) return { ok: 1, value: null };
  const target = found ?? create(equalityFields(command.query));
  const before = { ...target };
  // Un étage `$set` lit le document tel qu'il ENTRE dans l'étage : toutes ses
  // expressions s'évaluent avant qu'aucune ne s'écrive.
  for (const stage of command.update) {
    const written = Object.entries(stage.$set).map(([key, expression]) => [key, evaluateExpression(expression, target)] as const);
    for (const [key, value] of written) target[key] = value;
  }
  if (!found) rows.push(target);
  const image = command.new ? target : found ? before : null;
  if (image === null) return { ok: 1, value: null };
  const projected = command.fields
    ? Object.fromEntries(Object.keys(command.fields).map((key) => [key, image[key] ?? null]))
    : { ...image };
  return { ok: 1, value: projected };
}

/** Ce qu'une commande d'`EngagementCounterWrites` demande, relu depuis la commande ÉMISE. */
export type CounterWrite = {
  readonly kind: 'credit' | 'debit' | 'take-back';
  readonly userId: string;
  readonly axisKey: string;
  readonly points: number;
  readonly count: number;
};

const COUNTER_COLLECTION = 'EngagementCounter';

const stepOf = (expression: unknown): { readonly operator: string; readonly amount: number; readonly nullSafe: boolean } => {
  const floor = (expression as { $max?: [number, unknown] }).$max;
  const arithmetic = (floor ? floor[1] : expression) as Record<string, [unknown, number]>;
  const [operator, operands] = Object.entries(arithmetic)[0]!;
  return { operator, amount: operands[1], nullSafe: typeof operands[0] === 'object' && operands[0] !== null && '$ifNull' in operands[0] };
};

/**
 * `null` pour toute commande qui ne vise pas le compteur. LÈVE si la commande
 * additionne ou soustrait sans `$ifNull` — la forme qui laisse `null` en base.
 */
export function counterWriteOf(command: unknown): CounterWrite | null {
  const candidate = command as Partial<FindAndModifyCommand> | null;
  if (candidate?.findAndModify !== COUNTER_COLLECTION || !candidate.query || !candidate.update) return null;
  const set = candidate.update[0]!.$set;
  const points = stepOf(set.points);
  // Une reprise de reliquat ne touche pas aux actions : sa commande n'écrit pas `count`.
  const count = set.count === undefined ? { operator: points.operator, amount: 0, nullSafe: true } : stepOf(set.count);
  if (!points.nullSafe || !count.nullSafe) throw new Error('écriture du compteur sans $ifNull : null ou l’absence y resteraient null');
  const kind = points.operator === '$add' ? 'credit' : candidate.new === false ? 'take-back' : 'debit';
  return {
    kind,
    userId: (candidate.query.userId as { $oid: string }).$oid,
    axisKey: candidate.query.axisKey as string,
    points: points.amount,
    count: count.amount,
  };
}

/**
 * Un `$runCommandRaw` pour les doubles à `jest.fn()` : une écriture du compteur
 * va à `counter`, qui rend l'état de la ligne (`{ count }`, `{ count, points }`)
 * comme la commande le rendrait ; toute autre commande va à `other`.
 */
export const routeCounterWrites =
  (counter: (write: CounterWrite) => unknown, other: (command: unknown) => unknown) =>
  async (command: unknown): Promise<unknown> => {
    const write = counterWriteOf(command);
    if (write === null) return other(command);
    const state = await counter(write);
    return { ok: 1, value: state ?? null };
  };
