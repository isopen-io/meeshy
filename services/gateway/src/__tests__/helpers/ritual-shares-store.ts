/**
 * Un double EN MÉMOIRE de `relationFeatureSetting` (les partages du rituel du Sang),
 * pour des témoins qui lisent l'ÉTAT obtenu après un chemin qui fait tomber le lien.
 * Il honore `findUnique` (clé composée), `updateMany` (filtre `where` Mongo) et
 * `deleteMany` ; toute autre forme JETTE.
 */
import { jest } from '@jest/globals';
import { matchesMongoWhere, type MongoDocument } from './mongo-where';

export const SHARES_ON = {
  listeningTitleShared: true, locationShared: true, locationHistoryShared: true, proximityShared: true,
} as const;

export const SHARES_OFF = {
  listeningTitleShared: false, locationShared: false, locationHistoryShared: false, proximityShared: false,
} as const;

export function ritualSharesStore(seed: ReadonlyArray<MongoDocument>) {
  const rows = seed.map((row) => ({ ...row }));
  const relationFeatureSetting = {
    findUnique: jest.fn(async (args: { where: { ownerId_otherId: { ownerId: string; otherId: string } } }) => {
      const found = rows.find((row) => row.ownerId === args.where.ownerId_otherId.ownerId && row.otherId === args.where.ownerId_otherId.otherId);
      return found ? { ...found } : null;
    }),
    updateMany: jest.fn(async (args: { where: MongoDocument; data: MongoDocument }) => {
      const hit = rows.filter((row) => matchesMongoWhere(row, args.where));
      hit.forEach((row) => Object.assign(row, args.data));
      return { count: hit.length };
    }),
    deleteMany: jest.fn(async (args: { where: MongoDocument }) => {
      const hit = rows.filter((row) => matchesMongoWhere(row, args.where));
      hit.forEach((row) => rows.splice(rows.indexOf(row), 1));
      return { count: hit.length };
    }),
  };
  return { relationFeatureSetting, rows: (): MongoDocument[] => rows.map((row) => ({ ...row })) };
}
