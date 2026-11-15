/**
 * Un `findMany` / `count` Prisma joué sur un TABLEAU VIVANT — le double qu'un
 * témoin de pagination exige.
 *
 * ## Pourquoi un double qui ÉVALUE, et pas un `mockResolvedValue`
 *
 * Un double qui rend une page toute faite passe aussi bien sous un curseur
 * juste que sous un curseur faux : le test ne vérifie alors que sa propre
 * copie. Et un double qui rend `[]` rend tout témoin de contenu trivialement
 * vert. Ici les lignes sont des objets nus, la clause est APPLIQUÉE, le tri est
 * REJOUÉ à chaque lecture — c'est le résultat qui parle.
 *
 * ## Ce que seul un tableau VIVANT peut montrer
 *
 * Une pagination par offset et une pagination par curseur rendent exactement la
 * même chose tant que la collection ne bouge pas. Leur différence — le SAUT DE
 * LIGNE — n'apparaît qu'en INSÉRANT une ligne entre deux pages, donc seule une
 * source qui reclasse ses lignes à chaque lecture peut la rendre visible. Les
 * lignes sont passées par RÉFÉRENCE : `rows.push(...)` entre deux appels est vu
 * par le second, comme une vraie table.
 *
 * ## Le sous-ensemble supporté
 *
 * Exactement les formes qu'une page au curseur produit : `AND` / `OR`, les
 * bornes `lt` / `gt` / `lte` / `gte`, l'appartenance `in`, et l'égalité scalaire
 * ou de date. Toute autre forme JETTE — un filtre dont ce double ne sait rien
 * doit faire échouer le test, jamais passer en l'ignorant.
 */

export type TableRow = Record<string, unknown>;

type Comparable = number | string;

const has = (row: TableRow, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(row, key);

const comparable = (value: unknown): Comparable => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number' || typeof value === 'string') return value;
  throw new Error(`double table: valeur non comparable ${JSON.stringify(value)}`);
};

const sameValue = (left: unknown, right: unknown): boolean =>
  left instanceof Date && right instanceof Date
    ? left.getTime() === right.getTime()
    : left === right;

export function matchesWhere(row: TableRow, where: unknown): boolean {
  if (where === undefined || where === null) return true;

  return Object.entries(where as TableRow).every(([key, condition]) => {
    if (key === 'AND') return (condition as unknown[]).every((branch) => matchesWhere(row, branch));
    if (key === 'OR') return (condition as unknown[]).some((branch) => matchesWhere(row, branch));
    if (key === 'NOT') return !matchesWhere(row, condition);

    if (condition === null) return has(row, key) && row[key] === null;
    if (condition instanceof Date || typeof condition !== 'object') {
      return has(row, key) && sameValue(row[key], condition);
    }
    return matchesFieldFilter(row, key, condition as TableRow);
  });
}

function matchesFieldFilter(row: TableRow, key: string, filter: TableRow): boolean {
  return Object.entries(filter).every(([operator, operand]) => {
    if (operator === 'equals') return has(row, key) && sameValue(row[key], operand);
    if (operator === 'in') {
      return has(row, key) && (operand as unknown[]).some((candidate) => sameValue(row[key], candidate));
    }
    if (operator === 'lt' || operator === 'lte' || operator === 'gt' || operator === 'gte') {
      // Une borne sur un champ ABSENT ou NUL n'apparie pas — c'est la
      // sémantique de Mongo, et c'est ce qui laisse `{ OR: [{ expiresAt: null },
      // { expiresAt: { gt: now } }] }` se lire sans exploser sur la première
      // ligne non périssable.
      if (!has(row, key) || row[key] === null || row[key] === undefined) return false;
      const left = comparable(row[key]);
      const right = comparable(operand);
      if (operator === 'lt') return left < right;
      if (operator === 'lte') return left <= right;
      if (operator === 'gt') return left > right;
      return left >= right;
    }
    throw new Error(`double table: opérateur non supporté « ${key}.${operator} »`);
  });
}

type OrderBy = ReadonlyArray<Record<string, 'asc' | 'desc'>> | Record<string, 'asc' | 'desc'>;

function compareBy<T extends TableRow>(orderBy: OrderBy): (a: T, b: T) => number {
  const keys = Array.isArray(orderBy) ? orderBy : [orderBy];
  return (a, b) => {
    for (const clause of keys) {
      const [field, direction] = Object.entries(clause)[0] as [string, 'asc' | 'desc'];
      const left = comparable(a[field]);
      const right = comparable(b[field]);
      if (left === right) continue;
      const ascending = left < right ? -1 : 1;
      return direction === 'asc' ? ascending : -ascending;
    }
    return 0;
  };
}

export type FindManyArgs = {
  where?: unknown;
  orderBy?: OrderBy;
  take?: number;
  skip?: number;
};

/** `findMany` : filtre, TRI, puis fenêtre — dans cet ordre, comme la base. */
export function findManyIn<T extends TableRow>(rows: readonly T[], args: FindManyArgs = {}): T[] {
  const matched = [...rows].filter((row) => matchesWhere(row, args.where));
  if (args.orderBy) matched.sort(compareBy<T>(args.orderBy));
  const from = args.skip ?? 0;
  return args.take === undefined ? matched.slice(from) : matched.slice(from, from + args.take);
}

/** `count` : le MÊME prédicat que la liste, jamais un compteur qui voit plus. */
export function countIn<T extends TableRow>(rows: readonly T[], args: { where?: unknown } = {}): number {
  return rows.filter((row) => matchesWhere(row, args.where)).length;
}
