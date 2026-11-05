/**
 * Le double Prisma des ÉDITEURS (#16274) : `partnerProfile` et `user`, avec ce
 * que le vrai client refuse — les clés uniques `userId` et `slug` (P2002) — et
 * la lecture `{ slug: null } | { slug: { isSet: false } }` d'un profil d'avant
 * les éditeurs, dont le champ est ABSENT.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';

export type PublisherUserSeed = {
  readonly username: string;
  readonly isActive?: boolean;
  readonly deactivatedAt?: Date | null;
  readonly deletedAt?: Date | null;
  readonly emailVerifiedAt?: Date | null;
  readonly phoneVerifiedAt?: Date | null;
};

export type ProfileRow = Record<string, unknown> & { id: string; userId: string; displayName: string; slug?: string | null };

type Where = Record<string, unknown>;

const uniqueViolation = () => Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });

const fieldMatches = (row: Record<string, unknown>, key: string, condition: unknown): boolean => {
  const value = row[key];
  if (condition !== null && typeof condition === 'object' && !(condition instanceof Date)) {
    const spec = condition as Record<string, unknown>;
    if ('in' in spec) return (spec.in as readonly unknown[]).includes(value);
    if ('isSet' in spec) return spec.isSet === (key in row && value !== undefined);
    if ('not' in spec) return value !== spec.not;
  }
  if (condition === null) return key in row && value === null;
  return value === condition;
};

export const whereMatches = (row: Record<string, unknown>, where: Where | undefined): boolean =>
  Object.entries(where ?? {}).every(([key, condition]) =>
    key === 'OR' ? (condition as readonly Where[]).some((branch) => whereMatches(row, branch)) : fieldMatches(row, key, condition),
  );

const project = (row: Record<string, unknown> | undefined, select: Record<string, unknown> | undefined) => {
  if (row === undefined) return null;
  if (select === undefined) return { ...row };
  return Object.fromEntries(Object.keys(select).map((key) => [key, row[key] ?? null]));
};

export function publisherModels(seedUsers: Readonly<Record<string, PublisherUserSeed>>, profiles: ProfileRow[] = []) {
  let seq = 0;
  const users = new Map(Object.entries(seedUsers).map(([id, seed]) => [id, { id, isActive: true, deactivatedAt: null, deletedAt: null, emailVerifiedAt: null, phoneVerifiedAt: null, ...seed }]));
  const uniqueTaken = (data: Record<string, unknown>, except?: ProfileRow) =>
    profiles.some((row) => row !== except && (row.userId === data.userId || (typeof data.slug === 'string' && row.slug === data.slug)));

  const partnerProfile = {
    findUnique: async ({ where, select }: { where: Where; select?: Record<string, unknown> }) => project(profiles.find((row) => whereMatches(row, where)), select),
    findFirst: async ({ where, select }: { where: Where; select?: Record<string, unknown> }) => project(profiles.find((row) => whereMatches(row, where)), select),
    findMany: async ({ where, select, orderBy }: { where?: Where; select?: Record<string, unknown>; orderBy?: Record<string, 'asc' | 'desc'> }) => {
      const hits = profiles.filter((row) => whereMatches(row, where));
      const sorted = orderBy?.createdAt === 'desc' ? [...hits].reverse() : hits;
      return sorted.map((row) => project(row, select));
    },
    create: async ({ data, select }: { data: Record<string, unknown>; select?: Record<string, unknown> }) => {
      if (uniqueTaken(data)) throw uniqueViolation();
      const row = { id: `68e00000000000000000${String((seq += 1)).padStart(4, '0')}`, verifiedAt: null, verifiedBy: null, website: null, logoSrc: null, ...data } as ProfileRow;
      profiles.push(row);
      return project(row, select);
    },
    updateMany: async ({ where, data }: { where: Where; data: Record<string, unknown> }) => {
      const hits = profiles.filter((row) => whereMatches(row, where));
      for (const row of hits) {
        if (typeof data.slug === 'string' && profiles.some((other) => other !== row && other.slug === data.slug)) throw uniqueViolation();
        Object.assign(row, data);
      }
      return { count: hits.length };
    },
    deleteMany: async ({ where }: { where: Where }) => {
      const before = profiles.length;
      profiles.splice(0, profiles.length, ...profiles.filter((row) => !whereMatches(row, where)));
      return { count: before - profiles.length };
    },
    count: async ({ where }: { where?: Where }) => profiles.filter((row) => whereMatches(row, where)).length,
  };

  const user = {
    findUnique: async ({ where, select }: { where: { id: string }; select?: Record<string, unknown> }) => project(users.get(where.id), select),
    findMany: async ({ where, select }: { where: Where; select?: Record<string, unknown> }) => [...users.values()].filter((row) => whereMatches(row, where)).map((row) => project(row, select)),
  };

  return { partnerProfile, user, profiles, users };
}

export function memoryPublisherDb(seedUsers: Readonly<Record<string, PublisherUserSeed>>) {
  const models = publisherModels(seedUsers);
  return { prisma: { partnerProfile: models.partnerProfile, user: models.user } as unknown as PrismaClient, profiles: models.profiles };
}
