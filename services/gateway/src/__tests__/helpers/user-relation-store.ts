/**
 * Un double EN MÉMOIRE de `userRelation` (et des lectures de `friendRequest`
 * qu'en font le rattrapage et l'écrivain), pour des témoins qui lisent l'ÉTAT
 * obtenu plutôt que la clause envoyée (#13926).
 *
 * Ce qu'il honore, et qu'un `mockResolvedValue` ne dit pas :
 * - l'unicité de la paire (`userLowId_userHighId`) : une seconde création rend
 *   l'erreur `P2002` de Prisma, c'est ce qui fait tomber un écrivain qui
 *   croirait la paire absente sans le vérifier ;
 * - le `where` d'un `updateMany` (donc la garde de concurrence optimiste) ;
 * - `transitions: { push }` sur le type composite.
 * Toute forme dont il ne sait rien JETTE, comme `findFirstHonouringWhere`.
 */
import { matchesMongoWhere, type MongoDocument } from './mongo-where';
import { findFirstHonouringWhere } from './find-first-honouring-where';

type Row = MongoDocument;

const unsupported = (what: string): never => {
  throw new Error(`double userRelation: ${what} non supporté`);
};

export function relationStore(seed: { friendRequests?: readonly Row[]; relations?: readonly Row[] } = {}) {
  const state = {
    friendRequests: [...(seed.friendRequests ?? [])] as Row[],
    relations: [...(seed.relations ?? [])] as Row[],
    sequence: 0,
  };
  const nextId = (prefix: string): string => `${prefix}${String(++state.sequence).padStart(24 - prefix.length, '0')}`;

  const friendRequest = {
    findUnique: (args: { where: { id: string } }): Promise<Row | null> => {
      const found = state.friendRequests.find((r) => r.id === args.where.id);
      return Promise.resolve(found ? { ...found } : null);
    },
    update: (args: { where: { id: string }; data: Row }): Promise<Row> => {
      const found = state.friendRequests.find((r) => r.id === args.where.id);
      if (!found) return Promise.reject(new Error('friendRequest.update: introuvable'));
      Object.assign(found, args.data);
      return Promise.resolve({ ...found });
    },
    delete: (args: { where: { id: string } }): Promise<Row> => {
      const index = state.friendRequests.findIndex((r) => r.id === args.where.id);
      if (index < 0) return Promise.reject(new Error('friendRequest.delete: introuvable'));
      const [removed] = state.friendRequests.splice(index, 1);
      return Promise.resolve({ ...removed });
    },
    findFirst: (args?: unknown) => findFirstHonouringWhere(state.friendRequests)(args),
    findMany: (args: {
      where?: Row; orderBy?: { id: 'asc' }; take?: number; cursor?: { id: string }; skip?: number;
      select?: Record<string, boolean>;
    }): Promise<Row[]> => {
      const ordered = state.friendRequests
        .filter((row) => matchesMongoWhere(row, args.where))
        .sort((a, b) => String(a.id).localeCompare(String(b.id)));
      const from = args.cursor ? ordered.findIndex((row) => row.id === args.cursor?.id) + (args.skip ?? 0) : 0;
      const page = ordered.slice(from, args.take === undefined ? undefined : from + args.take);
      const keys = args.select ? Object.keys(args.select) : null;
      return Promise.resolve(
        page.map((row) => (keys ? Object.fromEntries(keys.map((k) => [k, row[k]])) : { ...row })),
      );
    },
  };

  const userRelation = {
    findUnique: (args: { where: { userLowId_userHighId: { userLowId: string; userHighId: string } } }): Promise<Row | null> => {
      const { userLowId, userHighId } = args.where.userLowId_userHighId;
      const found = state.relations.find((r) => r.userLowId === userLowId && r.userHighId === userHighId);
      return Promise.resolve(found ? { ...found } : null);
    },
    create: (args: { data: Row }): Promise<Row> => {
      const { userLowId, userHighId } = args.data;
      if (state.relations.some((r) => r.userLowId === userLowId && r.userHighId === userHighId)) {
        return Promise.reject(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }));
      }
      const row: Row = { id: nextId('aa'), transitions: [], ...args.data };
      state.relations.push(row);
      return Promise.resolve({ ...row });
    },
    updateMany: (args: { where: Row; data: Row }): Promise<{ count: number }> => {
      const matched = state.relations.filter((row) => matchesMongoWhere(row, args.where));
      matched.forEach((row) => {
        Object.entries(args.data).forEach(([key, value]) => {
          if (typeof value === 'object' && value !== null && !(value instanceof Date)) {
            const push = (value as { push?: unknown[] }).push;
            if (!Array.isArray(push)) unsupported(`data.${key}`);
            row[key] = [...((row[key] as unknown[]) ?? []), ...(push as unknown[])];
            return;
          }
          row[key] = value;
        });
      });
      return Promise.resolve({ count: matched.length });
    },
  };

  return {
    prisma: { friendRequest, userRelation },
    relations: (): readonly Row[] => state.relations.map((r) => ({ ...r })),
    friendRequests: (): readonly Row[] => state.friendRequests.map((r) => ({ ...r })),
  };
}

export type RelationStore = ReturnType<typeof relationStore>;
