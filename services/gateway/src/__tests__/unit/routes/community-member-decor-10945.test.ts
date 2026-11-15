/**
 * #10945 — la liste des MEMBRES d'une communauté porte le contour équipé de
 * chaque membre : lu dans la jointure `user` de la liste, résolu en
 * `profileDecor`, déclaré par `userMinimalSchema` (que `communityMemberSchema`
 * réemploie). Jamais la colonne brute.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify from 'fastify';

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }) },
}));
jest.mock('../../../utils/pagination', () => ({
  validatePagination: jest.fn<any>().mockReturnValue({ offset: 0, limit: 20 }),
}));
jest.mock('../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({ resolveForTargets: async () => new Map() }),
}));

import { registerMemberRoutes } from '../../../routes/communities/members';

const ME = '507f1f77bcf86cd799439011';
const COMMUNITY = 'comm-aabbcc001122';
const RING = { pack: 'contours-essentiels', item: 'filet', origin: 'builtin', contract: null };

const member = (id: string, equippedAvatarRing: string | null) => ({
  id: `m-${id}`, communityId: COMMUNITY, userId: id, role: 'member', isActive: true, joinedAt: new Date('2025-01-01'),
  user: { id, username: id, displayName: id, avatar: null, isOnline: false, lastActiveAt: null, equippedAvatarRing },
});

async function served() {
  const findMany = jest.fn<any>(async () => [member('ana', 'contours-essentiels/filet'), member('bob', null)]);
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: any) => {
    req.authContext = { isAuthenticated: true, userId: ME, registeredUser: { id: ME, role: 'USER' } };
  });
  app.decorate('prisma', {
    community: { findFirst: jest.fn<any>(async () => ({ id: COMMUNITY, createdBy: ME, isPrivate: false, members: [{ userId: ME, role: 'admin' }] })) },
    communityMember: { findMany, count: jest.fn<any>(async () => 2) },
  } as any);
  await app.register(registerMemberRoutes);
  await app.ready();
  const res = await app.inject({ method: 'GET', url: `/communities/${COMMUNITY}/members` });
  await app.close();
  return { res, findMany };
}

describe('#10945 — membres de communauté : le contour de chaque membre', () => {
  it('sert user.profileDecor, aucune clé sans contour, jamais la colonne', async () => {
    const { res, findMany } = await served();
    expect(res.statusCode).toBe(200);
    const data = res.json().data as Array<{ user: Record<string, unknown> }>;
    expect(data[0]?.user.profileDecor).toEqual({ avatarRing: RING });
    expect(data[1]?.user).not.toHaveProperty('profileDecor');
    expect(res.body).not.toContain('equippedAvatarRing');
    expect(findMany.mock.calls[0][0].include.user.select).toMatchObject({ equippedAvatarRing: true });
  });
});
