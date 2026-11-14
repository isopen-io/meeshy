/**
 * Le détail d'une communauté sert « N en ligne » (#18014) — un agrégat, à
 * travers le vrai sérialiseur (`communitySchema`), jamais une identité.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyRequest } from 'fastify';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() })),
  },
}));

jest.mock('../../../../services/PrivacyPreferencesService', () => ({
  PrivacyPreferencesService: jest.fn().mockImplementation(() => ({
    getPreferencesForUsers: async (ids: ReadonlyArray<{ id: string }>) =>
      new Map(ids.map(({ id }) => [id, { showOnlineStatus: true }])),
  })),
}));

import { communityRoutes } from '../../../../routes/communities/index';

const CREATOR = 'u-creator';
const STRANGER = 'u-stranger';
const ONLINE = ['u-on-1', 'u-on-2', 'u-on-3'];
const OFFLINE = Array.from({ length: 10 }, (_, i) => `u-off-${i}`);

type Row = { readonly userId: string; readonly online: boolean };
const rows: readonly Row[] = [
  { userId: CREATOR, online: true },
  ...ONLINE.map((userId) => ({ userId, online: true })),
  ...OFFLINE.map((userId) => ({ userId, online: false })),
];

type MemberWhere = { userId?: string | { not: string }; isActive?: boolean; user?: unknown };
const others = (where: MemberWhere) =>
  rows.filter((row) => typeof where.userId !== 'object' || row.userId !== where.userId.not);

const fakePrisma = ({ isPrivate, countFails = false }: { isPrivate: boolean; countFails?: boolean }) => {
  const count = jest.fn(async ({ where }: { where: MemberWhere }) => {
    if (countFails) throw new Error('mongo down');
    return others(where).length;
  });
  const findMany = jest.fn(async ({ where }: { where: MemberWhere }) =>
    others(where)
      .filter((row) => row.online)
      .map((row) => ({
        userId: row.userId,
        user: { isOnline: true, lastActiveAt: new Date(), isActive: true, deactivatedAt: null, deletedAt: null },
      })),
  );
  const findFirst = jest.fn(async (args: { where: { id?: string; isActive?: boolean } }) => {
    if (args.where.id !== 'comm-1') return null;
    return {
      id: 'comm-1',
      identifier: 'mshy_club',
      name: 'Club',
      isPrivate,
      isActive: true,
      createdBy: CREATOR,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      creator: { id: CREATOR, username: 'alice', displayName: 'Alice', avatar: null },
      members: [],
      _count: { members: rows.length, Conversation: 0 },
    };
  });
  return {
    prisma: {
      community: { findFirst },
      communityMember: { count, findMany },
      user: { findMany: jest.fn(async () => []), findUnique: jest.fn(async () => ({ blockedUserIds: [] })) },
      conversation: {},
    },
    count,
  };
};

const detailAs = async (viewer: string, options: { isPrivate: boolean; countFails?: boolean }) => {
  const fakes = fakePrisma(options);
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', fakes.prisma as never);
  app.decorate('authenticate', async (request: FastifyRequest) => {
    (request as unknown as { authContext: unknown }).authContext = {
      isAuthenticated: true,
      userId: viewer,
      registeredUser: { id: viewer },
    };
  });
  await app.register(communityRoutes);
  await app.ready();
  const response = await app.inject({ method: 'GET', url: '/communities/comm-1' });
  await app.close();
  return { response, count: fakes.count };
};

describe('GET /communities/:id — « N en ligne » (#18014)', () => {
  it('sert le nombre d’AUTRES membres en ligne, à travers le sérialiseur', async () => {
    const { response } = await detailAs(CREATOR, { isPrivate: false });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.onlineMemberCount).toBe(ONLINE.length);
  });

  it('un non-membre d’une communauté publique lit le même agrégat', async () => {
    const { response } = await detailAs(STRANGER, { isPrivate: false });
    expect(response.json().data.onlineMemberCount).toBe(ONLINE.length + 1);
  });

  it('un étranger à une communauté privée est refusé AVANT tout comptage', async () => {
    const { response, count } = await detailAs(STRANGER, { isPrivate: true });
    expect(response.statusCode).toBe(403);
    expect(count).not.toHaveBeenCalled();
  });

  it('ne sert aucune identité ni aucun champ de présence à côté de l’agrégat', async () => {
    const { response } = await detailAs(CREATOR, { isPrivate: false });
    const body = JSON.stringify(response.json().data);
    expect(body).not.toContain('isOnline');
    expect(body).not.toContain('lastActiveAt');
    ONLINE.forEach((id) => expect(body).not.toContain(id));
  });

  it('une panne du comptage ne casse pas le détail : il sert null', async () => {
    const { response } = await detailAs(CREATOR, { isPrivate: false, countFails: true });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.onlineMemberCount).toBeNull();
    expect(response.json().data.name).toBe('Club');
  });
});
