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

type OrderBy = Readonly<Record<string, 'asc' | 'desc'>> | undefined;

const timeOf = (value: unknown): number => (value instanceof Date ? value.getTime() : Number.NEGATIVE_INFINITY);

export function orderDocs<T extends DirectDoc>(docs: readonly T[], orderBy: OrderBy): readonly T[] {
  const [field, direction] = Object.entries(orderBy ?? {})[0] ?? [];
  if (field === undefined) return docs;
  const sign = direction === 'desc' ? -1 : 1;
  return [...docs].sort((left, right) => sign * (timeOf(left[field]) - timeOf(right[field])));
}

export function findConversationsIn<T extends DirectDoc>(docs: readonly T[]) {
  const matching = (args: { where?: MongoDocument; orderBy?: OrderBy }) =>
    orderDocs(docs.filter((doc) => matchesConversationWhere(doc, args?.where)), args?.orderBy);
  return {
    findFirst: async (args: { where?: MongoDocument; orderBy?: OrderBy }) => matching(args)[0] ?? null,
    findMany: async (args: { where?: MongoDocument; orderBy?: OrderBy }) => matching(args),
  };
}
