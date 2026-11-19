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
const SUPPORTED_NESTED_SELECT_ARGS = new Set(['select', 'include', 'where', 'take']);

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
      const nested = wanted as MongoDocument & { readonly select?: MongoDocument; readonly include?: MongoDocument; readonly where?: MongoDocument; readonly take?: number };
      const unknown = Object.keys(nested).filter((arg) => !SUPPORTED_NESTED_SELECT_ARGS.has(arg));
      if (unknown.length > 0) throw new Error(`double Mongo: sélection non supportée « ${key}.${unknown.join(', ')} »`);
      // `where` et `take` ne sont valides que sur une relation TO-MANY : Prisma
      // refuse les deux sur une relation to-one. C'est donc le discriminant que
      // ce double n'avait pas — faute de schéma, il ne pouvait pas distinguer
      // une relation absente d'un scalaire absent, et rendait `null` là où
      // Prisma rend `[]`. Un `.some()` sur ce `null` JETTE un TypeError, ce qui
      // rend vert tout témoin assertant un `rejects.toThrow()` sans message.
      const declaredToMany = nested.where !== undefined || nested.take !== undefined;
      const value = has(row, key) ? row[key] : declaredToMany ? [] : null;
      if (Array.isArray(value)) {
        const kept = (value as MongoDocument[]).filter((related) => matchesMongoWhere(related, nested.where));
        const taken = nested.take === undefined ? kept : kept.slice(0, nested.take);
        return [[key, taken.map((related) => hydrate(related, nested))]];
      }
      // Un `where`/`take` posé sur ce qui n'est PAS une liste : Prisma refuse la
      // requête, et le double le refusait en SILENCE en laissant passer le
      // document entier non filtré — soit la panne exacte qu'une porte écrite
      // sous cette forme produirait, attestée verte.
      if (declaredToMany) throw new Error(`double Mongo: « ${key}.where/take » sur une relation qui n'est pas une liste`);
      if (!isPlainDocument(value)) return [[key, null]];
      return [[key, hydrate(value as MongoDocument, nested)]];
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
 * `include` n'est PAS `select`, et la différence est exactement celle qui
 * décide d'un défaut d'appartenance : `select` énumère ce qui sort, `include`
 * rend TOUS les scalaires **plus** la relation nommée — dont le `where`
 * imbriqué filtre les lignes. Une porte qui vit dans ce `where` (le motif de
 * `ReactionService.addReaction` : `conversation: { include: { participants: {
 * where: … } } }`) ne s'observe donc que si le double l'HONORE.
 *
 * Prisma refuse les deux ensemble sur un même niveau ; ce double le refuse
 * aussi, plutôt que d'en choisir un en silence.
 *
 * ─── Ce que `include` NE rend PAS, et pourquoi ce double doit le retirer ───
 *
 * Une relation TO-MANY que l'`include` ne nomme PAS est absente de ce que
 * Prisma rend. La laisser passer rendrait ce double **plus permissif que la
 * production** — le cas le plus coûteux pour un double qui atteste des gardes :
 * un site qui lit une relation qu'il a oublié d'inclure obtient `undefined` en
 * production (garde INERTE) et un tableau peuplé ici (garde appliquée, témoin
 * VERT). Les listes de documents sont donc retirées du report, sauf celles que
 * l'`include` nomme.
 *
 * **La limite qui SUBSISTE, dite parce qu'une limite qu'on ne dit pas redevient
 * un angle mort** : faute de schéma, ce double ne peut pas distinguer une
 * relation TO-ONE d'un type COMPOSITE embarqué (`anonymousSession`), que Prisma
 * rend sans qu'on l'inclue. Un document embarqué non nommé par l'`include`
 * reste donc reporté — sur-inclusif pour une relation to-one, juste pour un
 * composite. Et un SCALAIRE absent du document reste absent au lieu de sortir
 * `null` : `include` ne connaît pas la liste des colonnes, donc ne peut pas les
 * null-remplir comme `project` le fait depuis son `select`.
 */
const isDocumentList = (value: unknown): boolean =>
  Array.isArray(value) && value.some((item) => isPlainDocument(item));

function hydrate(row: MongoDocument, args: { readonly select?: MongoDocument; readonly include?: MongoDocument }): MongoDocument {
  if (args.select && args.include) throw new Error('double Mongo: `select` et `include` au même niveau');
  if (args.select) return project(row, args.select);
  if (!args.include) return { ...row };
  const included = args.include;
  const carried = Object.fromEntries(
    Object.entries(row).filter(([key, value]) => !isDocumentList(value) || has(included, key))
  );
  return { ...carried, ...project(row, included) };
}

/**
 * `findUnique` sur une collection en mémoire : le premier document qui apparie
 * le `where`, PROJETÉ par son `select` comme Prisma le projette — un champ que
 * le `select` ne demande pas n'existe pas dans la ligne rendue —, ou HYDRATÉ
 * par son `include`, qui garde les scalaires et filtre les relations. Rend
 * `null` quand rien n'apparie. Tout autre argument jette.
 */
export function findUniqueIn<T extends MongoDocument>(rows: readonly T[]) {
  return (args: { readonly where?: MongoDocument; readonly select?: MongoDocument; readonly include?: MongoDocument }): Promise<MongoDocument | null> => {
    const unknown = Object.keys(args).filter((arg) => arg !== 'where' && arg !== 'select' && arg !== 'include');
    if (unknown.length > 0) return Promise.reject(new Error(`double Mongo: argument non supporté « ${unknown.join(', ')} »`));
    const found = rows.find((row) => matchesMongoWhere(row, args.where));
    if (!found) return Promise.resolve(null);
    try {
      return Promise.resolve(hydrate(found, args));
    } catch (error) {
      return Promise.reject(error);
    }
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

/**
 * `update` sur une collection en mémoire — le double qui REFUSE ce que le vrai
 * client refuse.
 *
 * Prisma accepte, depuis la clause `where` étendue, des filtres NON uniques à
 * côté de la clé unique : `where: { id, ...unsetOrNull('bannedAt') }` est la
 * forme que ce dépôt emploie pour qu'une écriture ne rallume pas une ligne
 * qu'un autre chemin vient de bannir (`restore-for-me.ts`, #10436/#10443). Quand
 * la ligne ne s'apparie plus, l'écriture ne tombe pas en no-op : elle LÈVE
 * `P2025`, et c'est ce code que l'appelant doit traiter pour rendre la vraie
 * cause.
 *
 * Un `jest.fn().mockResolvedValue(row)` ne peut pas exprimer cela : il rend la
 * ligne quelle que soit la clause, donc **il accepte une écriture que la
 * production refuserait**, et un témoin de COURSE posé sur lui ne peut pas
 * tomber. C'est le jumeau de la leçon « un double Prisma qui rend `[]` rend
 * tout témoin de contenu trivialement vert », pris par l'autre bout : un double
 * ment aussi par ce qu'il ACCEPTE.
 *
 * L'écriture est APPLIQUÉE à la ligne en mémoire : une lecture suivante voit ce
 * que l'écriture a posé, comme en base. `select` est projeté ; `include` rend la
 * ligne entière (les relations vivent dans la fixture). Tout autre argument, et
 * tout opérateur d'écriture que ce double ne sait pas appliquer, JETTENT.
 */
const SUPPORTED_UPDATE_ARGS = new Set(['where', 'data', 'select', 'include']);
const WRITE_OPERATORS = new Set(['set', 'unset', 'increment', 'decrement', 'multiply', 'divide', 'push']);

export class MongoDoubleP2025Error extends Error {
  readonly code = 'P2025';
  constructor(message = 'An operation failed because it depends on one or more records that were required but not found.') {
    super(message);
    this.name = 'MongoDoubleP2025Error';
  }
}

function applyWrite(row: MongoDocument, data: MongoDocument | undefined): void {
  Object.entries(data ?? {}).forEach(([key, value]) => {
    if (value === undefined) return;
    if (isPlainDocument(value)) {
      const keys = Object.keys(value as MongoDocument);
      const operators = keys.filter((candidate) => WRITE_OPERATORS.has(candidate));
      if (operators.length === 0) {
        row[key] = value;
        return;
      }
      if (keys.length !== operators.length) {
        throw new Error(`double Mongo: écriture mixte non supportée « ${key} »`);
      }
      if (operators.length === 1 && operators[0] === 'set') {
        row[key] = (value as { set: unknown }).set;
        return;
      }
      if (operators.length === 1 && operators[0] === 'unset') {
        delete row[key];
        return;
      }
      throw new Error(`double Mongo: opérateur d'écriture non supporté « ${key}.${operators.join(', ')} »`);
    }
    row[key] = value;
  });
}

/**
 * Les clés UNIQUES que `Participant` (et les modèles de ce dépôt) offrent à un
 * `update`. Prisma exige qu'au moins une figure dans le `where` — à défaut il
 * lève `PrismaClientValidationError` AVANT tout aller-retour, et un double qui
 * l'accepte ment par ce qu'il admet.
 */
const CLES_UNIQUES = ['id'];

export function updateIn<T extends MongoDocument>(rows: readonly T[]) {
  const calls: Array<{ readonly where?: MongoDocument; readonly data?: MongoDocument }> = [];
  const update = (args: {
    readonly where?: MongoDocument;
    readonly data?: MongoDocument;
    readonly select?: MongoDocument;
    readonly include?: MongoDocument;
  } = {}): Promise<MongoDocument> => {
    const unknown = Object.keys(args).filter((arg) => !SUPPORTED_UPDATE_ARGS.has(arg));
    if (unknown.length > 0) return Promise.reject(new Error(`double Mongo: argument non supporté « ${unknown.join(', ')} »`));
    // Le vrai client REFUSE un `update` sans clé unique dans le `where`, et le
    // refuse avant la base. Un double qui l'accepte atteste une écriture que la
    // production ne fait pas.
    if (!CLES_UNIQUES.some((cle) => args.where !== undefined && args.where[cle] !== undefined)) {
      return Promise.reject(new Error("double Mongo: `update` sans clé unique dans le `where` — le vrai client lève PrismaClientValidationError"));
    }
    calls.push({ where: args.where, data: args.data });
    const found = rows.find((row) => matchesMongoWhere(row, args.where));
    if (!found) return Promise.reject(new MongoDoubleP2025Error());
    applyWrite(found, args.data);
    return Promise.resolve(args.select ? project(found, args.select) : { ...found });
  };
  return { update, calls };
}
