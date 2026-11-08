/**
 * Le MONDE des témoins de la messagerie des cercles (#14107 et suivants) : des
 * liens en mémoire (`relationStore`), des comptes (date de naissance, blocages),
 * des communautés, des conversations et leurs participants. Chaque table
 * ÉVALUE la clause reçue (`matchesMongoWhere`) : un `where` faux rend un
 * résultat faux, jamais un vert de complaisance.
 */
import { relationPairKey, type RelationLevel } from '@meeshy/shared/types/relation';
import { relationStore } from './user-relation-store';
import { matchesMongoWhere, type MongoDocument } from './mongo-where';

export type Row = MongoDocument;

export type CircleLink = readonly [string, string, RelationLevel];

const project = (row: Row, select: Record<string, unknown> | undefined): Row =>
  select ? Object.fromEntries(Object.keys(select).filter((key) => key in row).map((key) => [key, row[key]])) : { ...row };

export function table(rows: Row[]) {
  return {
    rows,
    findMany: (args: { where?: Row; select?: Record<string, unknown>; take?: number } = {}): Promise<Row[]> =>
      Promise.resolve(rows.filter((row) => matchesMongoWhere(row, args.where)).slice(0, args.take ?? rows.length).map((row) => project(row, args.select))),
    findFirst: (args: { where?: Row; select?: Record<string, unknown> } = {}): Promise<Row | null> => {
      const found = rows.find((row) => matchesMongoWhere(row, args.where));
      return Promise.resolve(found ? project(found, args.select) : null);
    },
    findUnique: (args: { where: Row; select?: Record<string, unknown> }): Promise<Row | null> => {
      const found = rows.find((row) => matchesMongoWhere(row, args.where));
      return Promise.resolve(found ? project(found, args.select) : null);
    },
    count: (args: { where?: Row } = {}): Promise<number> => Promise.resolve(rows.filter((row) => matchesMongoWhere(row, args.where)).length),
    updateMany: (args: { where?: Row; data: Row }): Promise<{ count: number }> => {
      const matched = rows.filter((row) => matchesMongoWhere(row, args.where));
      matched.forEach((row) => Object.assign(row, args.data));
      return Promise.resolve({ count: matched.length });
    },
  };
}

export const circleLink = ([a, b, level]: CircleLink, index: number): Row => ({
  id: `ab${String(index).padStart(22, '0')}`,
  ...relationPairKey(a, b),
  grantedByLow: level,
  grantedByHigh: level,
  transitions: [],
  updatedAt: new Date(2026, 9, 1, 0, index),
});

export const ADULT_BIRTH = new Date('1990-01-01T00:00:00.000Z');
export const MINOR_BIRTH = new Date('2011-06-01T00:00:00.000Z');

export function messagingWorld(seed: {
  readonly links?: readonly CircleLink[];
  readonly users?: readonly Row[];
  readonly communityMembers?: readonly Row[];
  readonly participants?: readonly Row[];
  readonly conversations?: readonly Row[];
} = {}) {
  const relations = relationStore({ relations: (seed.links ?? []).map(circleLink) });
  const users = table((seed.users ?? []).map((u) => ({ blockedUserIds: [], isActive: true, deletedAt: null, deactivatedAt: null, ...u })));
  const communityMember = table([...(seed.communityMembers ?? [])]);
  const participant = table([...(seed.participants ?? [])]);
  const conversation = table([...(seed.conversations ?? [])]);
  return {
    prisma: { ...relations.prisma, user: users, communityMember, participant, conversation },
    relations,
    users,
    participant,
    conversation,
  };
}
