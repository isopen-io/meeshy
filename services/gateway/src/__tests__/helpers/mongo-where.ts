/**
 * Un double Prisma qui ÉVALUE un `where` contre des documents MongoDB, en
 * honorant la seule règle que les doubles ordinaires ne peuvent pas exprimer :
 * **un champ ABSENT n'est pas un champ à `null`.**
 *
 * Prisma n'écrit pas les champs optionnels qu'on ne lui donne pas. Un
 * `DateTime?` jamais renseigné n'a donc AUCUNE clé dans le document, et le
 * filtre `{ champ: null }` — qui se traduit par une égalité — ne l'apparie pas.
 * Ce piège a vidé le feed en production (`services/posts/softDelete.ts`) et a
 * fait no-op 100 % des bascules média d'appel (`CallService.initiateCall`).
 *
 * Un test qui compare la clause reçue à celle qu'il attend passe aussi bien avec
 * une clause juste qu'avec une clause fausse — il ne vérifie que sa propre
 * copie, et c'est ainsi que ce piège traverse des suites vertes. Ici, les lignes
 * sont des objets nus : une clé absente de l'objet est absente du document, et
 * c'est le RÉSULTAT de la lecture qui parle.
 *
 * Un champ `undefined` est IGNORÉ, comme chez Prisma : il n'apparie pas
 * « rien », il apparie TOUT.
 *
 * Le sous-ensemble supporté est celui des filtres de soft-state de ce dépôt.
 * Toute autre forme jette : un filtre dont ce double ne sait rien doit faire
 * échouer le test, jamais passer en l'ignorant.
 */
export type MongoDocument = Record<string, unknown>;

const has = (row: MongoDocument, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(row, key);

export function matchesMongoWhere(row: MongoDocument, where: MongoDocument | undefined): boolean {
  if (!where) return true;

  return Object.entries(where).every(([key, condition]) => {
    // Prisma IGNORE un champ `undefined` : `{ userId: undefined }` vise toutes
    // les lignes, ce qui fait d'un identifiant indéfini une suppression de toute
    // une collection (audit #14448). Le double ne doit pas le masquer.
    if (condition === undefined) return true;
    if (key === 'OR') {
      return (condition as MongoDocument[]).some((branch) => matchesMongoWhere(row, branch));
    }
    if (key === 'AND') {
      return (condition as MongoDocument[]).every((branch) => matchesMongoWhere(row, branch));
    }
    if (key === 'NOT') {
      return matchesNot(row, condition as MongoDocument | MongoDocument[]);
    }

    // Le coeur de ce double : `{ champ: null }` exige la clé PRÉSENTE et nulle.
    if (condition === null) return has(row, key) && row[key] === null;

    if (typeof condition === 'object' && !(condition instanceof Date)) {
      if (isRelationWhere(row, key, condition as MongoDocument)) {
        return isPlainDocument(row[key]) && matchesMongoWhere(row[key] as MongoDocument, condition as MongoDocument);
      }
      return matchesFieldFilter(row, key, condition as MongoDocument);
    }

    return has(row, key) && row[key] === condition;
  });
}

/**
 * **Toute négation exige la clé PRÉSENTE** — `NOT`, `not`, `notIn`, sur un
 * scalaire comme sur une liste. Mesuré contre `mongo:8` avec le vrai client
 * Prisma (#8309, 2026-10-02) : `NOT: { userId: X }`, `{ userId: { not: X } }`,
 * `{ userId: { notIn: [X] } }`, `NOT: { OR: [{ userId: X }] }` écartent tous le
 * document SANS `userId` et gardent celui où il vaut `null` ;
 * `NOT: { lastActivityAt: { gte } }` écarte la conversation sans la clé ;
 * `NOT: { visibilityUserIds: { has } }` le post sans la liste. Le connecteur
 * reproduit la logique trivaluée de SQL, où l'absence est l'inconnu : sa
 * négation n'est pas vraie. Pour lire « absent » dans une négation, il faut une
 * branche positive (`{ champ: { isSet: false } }`, ou `has` puis `notIn` sur
 * une liste — `isSet` n'existe pas sur une liste scalaire).
 */
function matchesNot(row: MongoDocument, condition: MongoDocument | MongoDocument[]): boolean {
  const clauses = Array.isArray(condition) ? condition : [condition];
  return clauses.every((clause) => fieldsOf(clause).every((field) => has(row, field)) && !matchesMongoWhere(row, clause));
}

function fieldsOf(clause: MongoDocument): string[] {
  return Object.entries(clause).flatMap(([key, value]) =>
    key === 'AND' || key === 'OR' || key === 'NOT'
      ? (Array.isArray(value) ? value : [value]).flatMap((branch) => fieldsOf(branch as MongoDocument))
      : [key]
  );
}

const FIELD_OPERATORS = new Set(['isSet', 'equals', 'not', 'gt', 'lt', 'gte', 'lte', 'in', 'notIn', 'is', 'has', 'isEmpty', 'some', 'none']);

const isPlainDocument = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && !(value instanceof Date) && !Array.isArray(value);

/**
 * Filtre de relation 1-1 sous sa forme courte (`participant: { userId }`) : un
 * filtre dont AUCUNE clé n'est un opérateur, posé sur un document embarqué ou
 * sur `null`. Une relation nulle n'apparie rien, comme chez Prisma ; une clé
 * ABSENTE du document reste un opérateur inconnu, et jette.
 */
function isRelationWhere(row: MongoDocument, key: string, filter: MongoDocument): boolean {
  const keys = Object.keys(filter);
  return keys.length > 0 && keys.every((operator) => !FIELD_OPERATORS.has(operator)) && has(row, key) && (row[key] === null || isPlainDocument(row[key]));
}

const relatedDocuments = (row: MongoDocument, key: string): MongoDocument[] =>
  has(row, key) && Array.isArray(row[key]) ? (row[key] as MongoDocument[]) : [];

function matchesFieldFilter(row: MongoDocument, key: string, filter: MongoDocument): boolean {
  return Object.entries(filter).every(([operator, operand]) => {
    if (operator === 'isSet') return has(row, key) === operand;
    if (operator === 'equals') {
      if (operand === null) return has(row, key) && row[key] === null;
      return has(row, key) && sameValue(row[key], operand);
    }
    if (operator === 'not') {
      if (operand === null) return has(row, key) && row[key] !== null;
      return has(row, key) && !sameValue(row[key], operand);
    }
    if (operator === 'gt' || operator === 'lt' || operator === 'gte' || operator === 'lte') {
      const value = row[key];
      if (!(value instanceof Date) || !(operand instanceof Date)) return false;
      return compareDates[operator](value.getTime(), operand.getTime());
    }
    if (operator === 'in') {
      return has(row, key) && (operand as unknown[]).some((candidate) => sameValue(row[key], candidate));
    }
    if (operator === 'notIn') {
      return has(row, key) && !(operand as unknown[]).some((candidate) => sameValue(row[key], candidate));
    }
    if (operator === 'is') {
      // Type composite embarqué (`anonymousSession: { is: {...} }`) : un document
      // ABSENT n'apparie rien, comme partout ailleurs dans ce fichier.
      const nested = row[key];
      return has(row, key) && typeof nested === 'object' && nested !== null && matchesMongoWhere(nested as MongoDocument, operand as MongoDocument);
    }
    if (operator === 'has') {
      // Un tableau ABSENT ne « contient » rien — c'est la même règle que le
      // reste du fichier, appliquée à `has` plutôt qu'à `isSet`/`equals`.
      return has(row, key) && Array.isArray(row[key]) && (row[key] as unknown[]).some((v) => sameValue(v, operand));
    }
    if (operator === 'isEmpty') {
      // Liste scalaire ABSENTE : ni vide ni pleine — elle n'apparie aucune des deux formes.
      return has(row, key) && Array.isArray(row[key]) && ((row[key] as unknown[]).length === 0) === operand;
    }
    if (operator === 'some') {
      // Relation 1-n embarquée : une relation sans document n'en a aucun qui apparie.
      return relatedDocuments(row, key).some((related) => matchesMongoWhere(related, operand as MongoDocument));
    }
    if (operator === 'none') {
      return !relatedDocuments(row, key).some((related) => matchesMongoWhere(related, operand as MongoDocument));
    }
    throw new Error(`double Mongo: opérateur non supporté « ${key}.${operator} »`);
  });
}

const compareDates = {
  gt: (a: number, b: number) => a > b,
  gte: (a: number, b: number) => a >= b,
  lt: (a: number, b: number) => a < b,
  lte: (a: number, b: number) => a <= b,
} as const;

function sameValue(left: unknown, right: unknown): boolean {
  if (left instanceof Date && right instanceof Date) return left.getTime() === right.getTime();
  return left === right;
}

/**
 * `findFirst` sur une collection en mémoire, avec la sémantique ci-dessus.
 * Rend `null` quand rien n'apparie — exactement ce que Prisma rend.
 */
export function findFirstIn<T extends MongoDocument>(rows: readonly T[]) {
  return (args: { where?: MongoDocument }): Promise<T | null> =>
    Promise.resolve(rows.find((row) => matchesMongoWhere(row, args?.where)) ?? null);
}

/**
 * `updateMany` sur une collection en mémoire : ne mute rien, rend le `count` de
 * Prisma et laisse le test lire QUELLES lignes auraient été touchées.
 */
export function updateManyIn<T extends MongoDocument>(rows: readonly T[]) {
  const touched: T[] = [];
  const updateMany = (args: { where?: MongoDocument }): Promise<{ count: number }> => {
    const matched = rows.filter((row) => matchesMongoWhere(row, args?.where));
    touched.push(...matched);
    return Promise.resolve({ count: matched.length });
  };
  return { updateMany, touched };
}

type FindManyArgs = {
  readonly where?: MongoDocument;
  readonly select?: MongoDocument;
  readonly orderBy?: MongoDocument | readonly MongoDocument[];
  readonly take?: number;
};

const SUPPORTED_FIND_MANY_ARGS = new Set(['where', 'select', 'orderBy', 'take']);
const SUPPORTED_NESTED_SELECT_ARGS = new Set(['select', 'where', 'take']);

/**
 * La projection de Prisma : un scalaire demandé et ABSENT du document se lit
 * `null`. C'est exactement ce qui rend une clé absente indiscernable d'une clé
 * nulle à la LECTURE — seul un filtre (`isSet`) les sépare.
 */
function project(row: MongoDocument, select: MongoDocument): MongoDocument {
  return Object.fromEntries(
    Object.entries(select).flatMap(([key, wanted]) => {
      if (wanted === false || wanted === undefined) return [];
      if (wanted === true) return [[key, has(row, key) ? row[key] : null]];
      const nested = wanted as MongoDocument & { readonly select?: MongoDocument; readonly where?: MongoDocument; readonly take?: number };
      const unknown = Object.keys(nested).filter((arg) => !SUPPORTED_NESTED_SELECT_ARGS.has(arg));
      if (unknown.length > 0) throw new Error(`double Mongo: sélection non supportée « ${key}.${unknown.join(', ')} »`);
      const value = has(row, key) ? row[key] : null;
      if (Array.isArray(value)) {
        const kept = (value as MongoDocument[]).filter((related) => matchesMongoWhere(related, nested.where));
        const taken = nested.take === undefined ? kept : kept.slice(0, nested.take);
        return [[key, nested.select ? taken.map((related) => project(related, nested.select as MongoDocument)) : taken]];
      }
      if (!isPlainDocument(value)) return [[key, null]];
      return [[key, nested.select ? project(value as MongoDocument, nested.select) : value]];
    })
  );
}

function compareBy(orderBy: readonly MongoDocument[]) {
  return (left: MongoDocument, right: MongoDocument): number => {
    for (const clause of orderBy) {
      for (const [field, direction] of Object.entries(clause)) {
        if (direction !== 'asc' && direction !== 'desc') throw new Error(`double Mongo: tri non supporté « ${field} »`);
        const a = left[field] instanceof Date ? (left[field] as Date).getTime() : left[field];
        const b = right[field] instanceof Date ? (right[field] as Date).getTime() : right[field];
        if (a === b) continue;
        const order = (a as number | string) < (b as number | string) ? -1 : 1;
        return direction === 'asc' ? order : -order;
      }
    }
    return 0;
  };
}

/**
 * `findMany` sur une collection en mémoire : `where` évalué contre les
 * documents (sémantique ci-dessus), `select` projeté comme Prisma le projette,
 * `orderBy` et `take` honorés. Tout autre argument jette.
 */
export function findManyIn<T extends MongoDocument>(rows: readonly T[]) {
  const calls: FindManyArgs[] = [];
  const findMany = (args: FindManyArgs = {}): Promise<MongoDocument[]> => {
    const unknown = Object.keys(args).filter((arg) => !SUPPORTED_FIND_MANY_ARGS.has(arg));
    if (unknown.length > 0) return Promise.reject(new Error(`double Mongo: argument non supporté « ${unknown.join(', ')} »`));
    calls.push(args);
    const matched = rows.filter((row) => matchesMongoWhere(row, args.where));
    const orderBy = args.orderBy === undefined ? [] : Array.isArray(args.orderBy) ? args.orderBy : [args.orderBy as MongoDocument];
    const sorted = orderBy.length === 0 ? matched : [...matched].sort(compareBy(orderBy));
    const taken = args.take === undefined ? sorted : sorted.slice(0, args.take);
    return Promise.resolve(taken.map((row) => (args.select ? project(row, args.select) : { ...row })));
  };
  return { findMany, calls };
}
