/**
 * Le MONDE des témoins de cercles (#13929 et ses suivis) — un graphe de liens
 * EN MÉMOIRE (`relationStore`), des réglages `notification.circle*`, des
 * blocages, des communautés et des conversations directes. Les éventails le
 * lisent par la même loi que la production ; aucun témoin ne recopie une clause.
 */
import { jest } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { relationPairKey, type RelationLevel } from '@meeshy/shared/types/relation';
import type { RelationAudienceChoice, CircleNotifyKey } from '@meeshy/shared/utils/relation-levels';
import { relationStore } from './user-relation-store';
import { matchesMongoWhere } from './mongo-where';
import type { FanoutDependencies } from '../../services/notifications/fanout/dependencies';

export const AUTEUR = '6000000000000000000000a1';
export const COMMENTATEUR = '6000000000000000000000a2';
export const SANG = '6000000000000000000000b1';
export const PROCHE = '6000000000000000000000b2';
export const AMI = '6000000000000000000000b3';
export const CONNAISSANCE = '6000000000000000000000b4';
export const CO_MEMBRE = '6000000000000000000000b5';
export const INCONNU = '6000000000000000000000b6';
export const SANG_BLOQUE = '6000000000000000000000b7';
export const SANG_DU_COMMENTATEUR = '6000000000000000000000c1';
export const PROCHE_DU_COMMENTATEUR = '6000000000000000000000c2';
export const POST = 'dddddddddddddddddddddddd';
export const COMMENT = 'eeeeeeeeeeeeeeeeeeeeeeee';

export type Link = readonly [string, string, RelationLevel];

export const lien = ([a, b, level]: Link, index: number) => ({
  id: `aa${String(index).padStart(22, '0')}`,
  ...relationPairKey(a, b),
  grantedByLow: level,
  grantedByHigh: level,
  transitions: [],
  updatedAt: new Date(2026, 9, 1, 0, index),
});

export const CERCLE_DE_L_AUTEUR: readonly Link[] = [
  [AUTEUR, SANG, 'BLOOD'],
  [AUTEUR, PROCHE, 'CLOSE'],
  [AUTEUR, AMI, 'FRIEND'],
  [AUTEUR, CONNAISSANCE, 'ACQUAINTANCE'],
  [AUTEUR, SANG_BLOQUE, 'BLOOD'],
];

export const CERCLE_DU_COMMENTATEUR: readonly Link[] = [
  [COMMENTATEUR, SANG_DU_COMMENTATEUR, 'BLOOD'],
  [COMMENTATEUR, PROCHE_DU_COMMENTATEUR, 'CLOSE'],
];

export type World = {
  readonly extraLinks?: readonly Link[];
  readonly preferencesDown?: boolean;
  readonly settings?: Readonly<Record<string, Partial<Record<CircleNotifyKey, RelationAudienceChoice>>>>;
  readonly blocks?: Readonly<Record<string, readonly string[]>>;
  readonly communities?: Readonly<Record<string, readonly string[]>>;
  readonly deleted?: readonly string[];
  /** Comptes désactivés (`isActive: false`). */
  readonly inactive?: readonly string[];
  readonly directs?: ReadonlyArray<readonly [string, string]>;
  readonly directsDown?: boolean;
  readonly silent?: readonly string[];
  readonly previousCommenters?: readonly string[];
  readonly post?: Readonly<Record<string, unknown>>;
};

export const COMMUNAUTE_PAR_DEFAUT = { 'c-1': [AUTEUR, CO_MEMBRE] };

/**
 * La règle de Prisma sur MongoDB (leçon 318) : un optionnel jamais écrit n'a PAS
 * de clé, `{ deletedAt: null }` ne l'apparie pas, `{ isSet: false }` si.
 */
export const deletedAtMatches = (doc: Record<string, unknown>, filter: unknown): boolean => {
  const present = Object.prototype.hasOwnProperty.call(doc, 'deletedAt');
  if (filter === undefined) return true;
  if (filter === null) return present && doc.deletedAt === null;
  if (typeof filter === 'object' && filter !== null && 'isSet' in filter) return (filter as { isSet: boolean }).isSet === present;
  return false;
};

type LivingWhere = { readonly deletedAt?: unknown; readonly OR?: readonly LivingWhere[]; readonly AND?: readonly LivingWhere[] };

/** La clause `deletedAt` telle que Prisma l'applique, `OR` / `AND` compris (`unsetOrNull`). */
const livingMatches = (doc: Record<string, unknown>, where: LivingWhere): boolean =>
  (!('deletedAt' in where) || deletedAtMatches(doc, where.deletedAt)) &&
  (where.OR === undefined || where.OR.some((clause) => livingMatches(doc, clause))) &&
  (where.AND === undefined || where.AND.every((clause) => livingMatches(doc, clause)));

export function monde(world: World = {}) {
  const store = relationStore({
    relations: [...CERCLE_DE_L_AUTEUR, ...CERCLE_DU_COMMENTATEUR, ...(world.extraLinks ?? [])].map(lien),
    friendRequests: [],
  });
  const blocks = { [AUTEUR]: [SANG_BLOQUE], ...(world.blocks ?? {}) };
  const blockedOf = (id: string): readonly string[] => blocks[id] ?? [];
  const communities = world.communities ?? COMMUNAUTE_PAR_DEFAUT;
  const memberships = Object.entries(communities).flatMap(([communityId, members]) =>
    members.map((userId) => ({ communityId, userId, isActive: true }))
  );

  const prisma = {
    ...store.prisma,
    user: {
      findUnique: async (args: { where: { id: string } }) => ({
        id: args.where.id,
        username: args.where.id,
        displayName: args.where.id,
        avatar: null,
        blockedUserIds: [...blockedOf(args.where.id)],
      }),
      findFirst: async (args: { where: { OR?: ReadonlyArray<{ id: string; blockedUserIds: { has: string } }> } }) =>
        (args.where.OR ?? []).find((clause) => blockedOf(clause.id).includes(clause.blockedUserIds.has)) ? { id: 'blocked' } : null,
      // Un compte jamais supprimé n'a PAS de clé `deletedAt` (leçon 318) : `{ deletedAt: null }` seul ne l'apparie pas.
      findMany: async (args: { where: LivingWhere & { id: { in: string[] }; blockedUserIds?: { has: string }; isActive?: boolean } }) => {
        const { blockedUserIds } = args.where;
        if (blockedUserIds) return args.where.id.in.filter((id) => blockedOf(id).includes(blockedUserIds.has)).map((id) => ({ id }));
        if (args.where.isActive !== true) return [];
        const docOf = (id: string): Record<string, unknown> => ((world.deleted ?? []).includes(id) ? { deletedAt: new Date(0) } : {});
        return args.where.id.in
          .filter((id) => !(world.inactive ?? []).includes(id) && livingMatches(docOf(id), args.where))
          .map((id) => ({ id }));
      },
    },
    userPreferences: {
      findUnique: async (args: { where: { userId: string } }) => {
        if (world.preferencesDown) throw new Error('mongo down');
        const own = world.settings?.[args.where.userId];
        return own ? { notification: own } : null;
      },
    },
    communityMember: {
      findMany: async (args: { where: Record<string, unknown>; take?: number }) => {
        const rows = memberships.filter((row) => matchesMongoWhere(row, args.where));
        return rows.slice(0, args.take);
      },
    },
    participant: { findMany: async (args: { where: { userId: string | { in: string[] }; conversationId?: { in: string[] } } }) => {
      if (world.directsDown) throw new Error('mongo down');
      const rows = (world.directs ?? []).flatMap(([a, b], i) => [a, b].map((userId) => ({ id: `p-${i}-${userId}`, userId, conversationId: `dm-${i}` })));
      const { userId, conversationId } = args.where;
      if (typeof userId === 'string') return rows.filter((row) => row.userId === userId);
      return rows.filter((row) => userId.in.includes(row.userId) && (conversationId?.in ?? []).includes(row.conversationId));
    } },
    message: {
      findMany: async (args: { where: { senderId: { in: string[] } } }) =>
        args.where.senderId.in.filter((id) => !(world.silent ?? []).some((who) => id.endsWith(`-${who}`))).map((senderId) => ({ senderId })),
    },
    postMedia: { findFirst: async () => null },
    post: {
      findUnique: async () => world.post ?? null,
      findFirst: async (args?: { where?: { deletedAt?: unknown } }) =>
        world.post && deletedAtMatches(world.post, args?.where?.deletedAt) ? world.post : null,
    },
    postComment: { findMany: async () => (world.previousCommenters ?? []).map((authorId) => ({ authorId })) },
    postReaction: { findMany: async () => [] },
  };

  const createNotification = jest.fn(async (_params: { userId: string; type: string }) => null);
  const claimed = new Set<string>();
  const relayThrottle = {
    get: async (key: string) => (claimed.has(key) ? '1' : null),
    setnx: async (key: string) => {
      if (claimed.has(key)) return false;
      claimed.add(key);
      return true;
    },
  };
  const deps = {
    prisma: prisma as unknown as PrismaClient,
    createNotification,
    relayThrottle,
    resolveRecipientLangs: async () => new Map<string, string>(),
    shouldCreateMentionNotification: () => true,
    isConversationMutedFor: async () => false,
  } as unknown as FanoutDependencies;

  const notified = (type?: string): string[] =>
    createNotification.mock.calls
      .map(([params]) => params)
      .filter((params) => type === undefined || params.type === type)
      .map((params) => params.userId);

  return { deps, prisma, createNotification, notified };
}
