/**
 * Un évaluateur de clause `where` Prisma-sur-MongoDB, assez complet pour les
 * opérateurs que la recherche globale pose (#14619, #14620) : les témoins
 * d'accès doivent faire TROUVER ou REFUSER la ligne par la clause écrite par la
 * production, jamais par un stub qui rend ce qu'on lui dit.
 *
 * Sémantique Mongo : `field: null` ne matche qu'un champ PRÉSENT à null ;
 * `{ isSet: false }` matche l'absence ; `notIn` matche l'absence. Un opérateur
 * inconnu LÈVE — un témoin ne doit pas passer au vert sur une clause qu'il ne
 * sait pas lire.
 */

export type Doc = Record<string, unknown>;
type Where = Record<string, unknown>;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !(value instanceof Date) && !Array.isArray(value);

const comparable = (value: unknown): number | string =>
  value instanceof Date ? value.getTime() : (value as number | string);

function operator(value: unknown, present: boolean, op: string, arg: unknown, mode: unknown): boolean {
  switch (op) {
    case 'in': return present && (arg as unknown[]).some((item) => comparable(item) === comparable(value));
    case 'notIn': return !present || !(arg as unknown[]).some((item) => comparable(item) === comparable(value));
    case 'equals': return arg === null ? present && value === null : present && comparable(value) === comparable(arg);
    case 'not': return isPlainObject(arg) ? !fieldMatches(value, present, arg) : arg === null ? present && value !== null : comparable(value) !== comparable(arg);
    case 'contains': return typeof value === 'string' && (mode === 'insensitive' ? value.toLowerCase().includes(String(arg).toLowerCase()) : value.includes(String(arg)));
    case 'mode': return true;
    case 'isSet': return arg === present;
    case 'some': return Array.isArray(value) && value.some((item) => matchesWhere(item as Doc, arg as Where));
    case 'has': return Array.isArray(value) && value.includes(arg);
    case 'gt': return present && value !== null && comparable(value) > comparable(arg);
    case 'gte': return present && value !== null && comparable(value) >= comparable(arg);
    case 'lt': return present && value !== null && comparable(value) < comparable(arg);
    case 'lte': return present && value !== null && comparable(value) <= comparable(arg);
    default: throw new Error(`where-eval : opérateur inconnu « ${op} »`);
  }
}

function fieldMatches(value: unknown, present: boolean, predicate: unknown): boolean {
  if (predicate === null) return present && value === null;
  if (predicate instanceof Date) return present && comparable(value) === predicate.getTime();
  if (!isPlainObject(predicate)) return present && value === predicate;
  return Object.entries(predicate).every(([op, arg]) => operator(value, present, op, arg, predicate.mode));
}

export function matchesWhere(doc: Doc, where: Where | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, predicate]) => {
    if (key === 'AND') return (Array.isArray(predicate) ? predicate : [predicate]).every((w) => matchesWhere(doc, w as Where));
    if (key === 'OR') return (predicate as Where[]).some((w) => matchesWhere(doc, w));
    if (key === 'NOT') return !(Array.isArray(predicate) ? predicate : [predicate]).some((w) => matchesWhere(doc, w as Where));
    return fieldMatches(doc[key], key in doc, predicate);
  });
}

/** La ligne telle que la base la rend pour ce `select` : une colonne non demandée n'arrive pas. */
export function projected(row: Doc, select: Record<string, unknown> | undefined): Doc {
  if (!select) return row;
  return Object.fromEntries(
    Object.entries(select).flatMap(([key, wanted]) => {
      if (!(key in row) || !wanted) return [];
      const value = row[key];
      const nested = isPlainObject(wanted) ? (wanted.select as Record<string, unknown> | undefined) : undefined;
      if (nested && Array.isArray(value)) return [[key, value.map((item) => projected(item as Doc, nested))]];
      if (nested && isPlainObject(value)) return [[key, projected(value, nested)]];
      return [[key, value]];
    })
  );
}

const sortKey = (doc: Doc): [number, string] => [comparable(doc.createdAt) as number, String(doc.id)];

/** `findMany` sur une table en mémoire : filtre, tri `(createdAt desc, id desc)`, `take`, projection. */
export function findManyIn(rows: readonly Doc[], args: { where?: Where; select?: Record<string, unknown>; take?: number }): Doc[] {
  const kept = rows
    .filter((row) => matchesWhere(row, args.where))
    .sort((a, b) => {
      const [at, aid] = sortKey(a);
      const [bt, bid] = sortKey(b);
      return bt - at || (aid < bid ? 1 : aid > bid ? -1 : 0);
    });
  return kept.slice(0, args.take ?? kept.length).map((row) => projected(row, args.select));
}
