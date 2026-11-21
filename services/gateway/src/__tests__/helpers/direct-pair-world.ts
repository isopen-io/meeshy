import { matchesMongoWhere, type MongoDocument } from './mongo-where';

/**
 * LES TÊTE-À-TÊTE D'UNE PAIRE, EN MÉMOIRE (#12966) — un double qui ÉVALUE le
 * `where` d'une recherche de conversation, relation `participants` comprise
 * (`some` / `every` sur les lignes de participation du document), et délègue
 * tout le reste à `matchesMongoWhere` : un champ absent n'y est pas un champ
 * nul, et un filtre inconnu jette. L'ordre suit `orderBy` sur une date.
 */
export type DirectDoc = MongoDocument & {
  readonly id: string;
  readonly participants: ReadonlyArray<MongoDocument & { readonly userId: string; readonly isActive: boolean }>;
};

function matchesParticipants(doc: DirectDoc, filter: MongoDocument): boolean {
  return Object.entries(filter).every(([operator, condition]) => {
    if (operator === 'some') return doc.participants.some((row) => matchesMongoWhere(row, condition as MongoDocument));
    if (operator === 'every') return doc.participants.every((row) => matchesMongoWhere(row, condition as MongoDocument));
    if (operator === 'none') return !doc.participants.some((row) => matchesMongoWhere(row, condition as MongoDocument));
    throw new Error(`double de paire : opérateur de relation non supporté « participants.${operator} »`);
  });
}

export function matchesConversationWhere(doc: DirectDoc, where: MongoDocument | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'AND') return (condition as MongoDocument[]).every((branch) => matchesConversationWhere(doc, branch));
    if (key === 'OR') return (condition as MongoDocument[]).some((branch) => matchesConversationWhere(doc, branch));
    if (key === 'participants') return matchesParticipants(doc, condition as MongoDocument);
    return matchesMongoWhere(doc, { [key]: condition });
  });
}

/**
 * Un ordre Prisma : une clé, ou PLUSIEURS clés en tableau — la forme qu'exige
 * tout ordre qui départage ses égalités (`[{ col: 'desc' }, { id: 'desc' }]`,
 * #19835, #19881). Une seule clé lue sur un TABLEAU rendrait `'0'` pour nom de
 * champ et ne trierait rien, en silence : c'est un double qui mentirait par ce
 * qu'il ACCEPTE, et il rendrait indétectable un ordre qui ne départage pas.
 */
type OrderKey = Readonly<Record<string, 'asc' | 'desc'>>;
type OrderBy = OrderKey | readonly OrderKey[] | undefined;

/** Le poids d'une valeur ordonnable — une date par son instant, une chaîne par elle-même, l'absence tout en bas (comme MongoDB en `desc`). */
const weightOf = (value: unknown): number | string | null => {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number' || typeof value === 'string') return value;
  throw new Error(`double de paire : valeur non ordonnable ${JSON.stringify(value)}`);
};

const compareWeights = (left: unknown, right: unknown): number => {
  const [a, b] = [weightOf(left), weightOf(right)];
  if (a === b) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  return a < b ? -1 : 1;
};

export function orderDocs<T extends DirectDoc>(docs: readonly T[], orderBy: OrderBy): readonly T[] {
  const keys = (orderBy === undefined ? [] : Array.isArray(orderBy) ? orderBy : [orderBy]) as readonly OrderKey[];
  const criteria = keys.flatMap((key) =>
    Object.entries(key).map(([field, direction]) => ({ field, sign: direction === 'desc' ? -1 : 1 }))
  );
  if (criteria.length === 0) return docs;
  return [...docs].sort((left, right) =>
    criteria.reduce((verdict, { field, sign }) => verdict || sign * compareWeights(left[field], right[field]), 0)
  );
}

/**
 * `take` est HONORÉ (et non ignoré) : une lecture bornée dont le double rend
 * tout rendrait vert un ordre qui laisse la ligne attendue hors de la fenêtre —
 * le défaut mesuré par #19836 sur la liste paginée.
 */
export function findConversationsIn<T extends DirectDoc>(docs: readonly T[]) {
  const matching = (args: { where?: MongoDocument; orderBy?: OrderBy; take?: number }) => {
    const retained = orderDocs(docs.filter((doc) => matchesConversationWhere(doc, args?.where)), args?.orderBy);
    return args?.take === undefined ? retained : retained.slice(0, args.take);
  };
  return {
    findFirst: async (args: { where?: MongoDocument; orderBy?: OrderBy }) => matching(args)[0] ?? null,
    findMany: async (args: { where?: MongoDocument; orderBy?: OrderBy; take?: number }) => matching(args),
  };
}
