/**
 * Les six gestes qui changent l'effectif d'une communauté diffusent ce qu'ils
 * viennent d'ÉCRIRE (#18766) — et rien quand l'écriture n'a pas lieu.
 *
 * Le service de diffusion (audience, charge) a ses propres témoins
 * (`services/community-member-broadcast.test.ts`) ; celui-ci garde le
 * BRANCHEMENT : quel changement chaque route annonce, et le silence d'un refus.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify from 'fastify';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() })),
  },
}));

const announced: unknown[] = [];
jest.mock('../../../services/community-member-broadcast', () => {
  const actual = jest.requireActual<typeof import('../../../services/community-member-broadcast')>(
    '../../../services/community-member-broadcast',
  );
  return { ...actual, scheduleCommunityMemberBroadcastFrom: (_fastify: unknown, change: unknown) => { announced.push(change); } };
});

import { registerMembershipRoutes } from '../../../routes/communities/membership';
import { registerMemberRoutes } from '../../../routes/communities/members';

const CALLER = '507f1f77bcf86cd799431011';
const OTHER = '507f1f77bcf86cd799431022';
const CREATOR = '507f1f77bcf86cd799431055';
const COMM = '507f1f77bcf86cd799431033';
const ROW = '507f1f77bcf86cd799431044';

type Scenario = {
  readonly callerRole?: 'admin' | 'moderator' | 'member' | null;
  readonly isPrivate?: boolean;
  readonly existing?: { readonly id: string; readonly userId: string; readonly isActive: boolean } | null;
  readonly createdBy?: string;
};

function makePrisma(s: Scenario = {}) {
  const callerRole = s.callerRole === undefined ? 'admin' : s.callerRole;
  return {
    community: {
      findFirst: jest.fn(async () => ({
        id: COMM,
        isPrivate: s.isPrivate ?? false,
        isActive: true,
        createdBy: s.createdBy ?? CREATOR,
        members: callerRole === null ? [] : [{ role: callerRole }],
      })),
    },
    communityMember: {
      findFirst: jest.fn(async () => (s.existing === undefined ? null : s.existing)),
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0),
      create: jest.fn(async (args: { data: { userId: string; role: string } }) => ({ id: ROW, communityId: COMM, ...args.data, isActive: true })),
      update: jest.fn(async (args: { data: { role?: string } }) => ({
        id: ROW, communityId: COMM, userId: s.existing?.userId ?? OTHER, role: args.data.role ?? 'member', isActive: true,
        user: { id: s.existing?.userId ?? OTHER, username: 'bob', displayName: 'Bob', avatar: null },
      })),
    },
    user: { findFirst: jest.fn(async (args: { where: { OR?: unknown } }) => (args.where.OR ? null : { id: OTHER })) },
    friendRequest: { findMany: jest.fn(async () => []) },
    conversation: { findMany: jest.fn(async () => []) },
    participant: { findMany: jest.fn(async () => []), updateMany: jest.fn(async () => ({ count: 0 })) },
  };
}

async function inject(s: Scenario, method: 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) {
  announced.length = 0;
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: unknown) => {
    (req as { authContext: unknown }).authContext = {
      isAuthenticated: true, userId: CALLER, hasFullAccess: true, registeredUser: { id: CALLER, username: 'alice', role: 'USER' },
    };
  });
  app.decorate('prisma', makePrisma(s) as never);
  await registerMembershipRoutes(app);
  await registerMemberRoutes(app);
  await app.ready();
  const res = await app.inject({ method, url, ...(payload ? { payload } : {}) });
  await app.close();
  return { status: res.statusCode, announced: [...announced] };
}

describe("l'effectif d'une communauté se diffuse depuis chaque geste (#18766)", () => {
  it('rejoindre annonce une entrée de soi-même, en membre', async () => {
    const r = await inject({ callerRole: null }, 'POST', `/communities/${COMM}/join`);
    expect(r.status).toBe(200);
    expect(r.announced).toEqual([{ kind: 'joined', communityId: COMM, userId: CALLER, role: 'member', via: 'self' }]);
  });

  it('quitter annonce un départ de soi-même', async () => {
    const r = await inject({ callerRole: 'member', existing: { id: ROW, userId: CALLER, isActive: true } }, 'POST', `/communities/${COMM}/leave`);
    expect(r.status).toBe(200);
    expect(r.announced).toEqual([{ kind: 'left', communityId: COMM, userId: CALLER, reason: 'left' }]);
  });

  it("inviter annonce l'entrée de l'invité, par un tiers", async () => {
    const r = await inject({ callerRole: 'member' }, 'POST', `/communities/${COMM}/invite`, { userId: OTHER });
    expect(r.status).toBe(200);
    expect(r.announced).toEqual([{ kind: 'joined', communityId: COMM, userId: OTHER, role: 'member', via: 'invited' }]);
  });

  it("ajouter annonce l'entrée de la personne avec le rôle donné", async () => {
    const r = await inject({ callerRole: 'admin' }, 'POST', `/communities/${COMM}/members`, { userId: OTHER, role: 'moderator' });
    expect(r.status).toBe(200);
    expect(r.announced).toEqual([{ kind: 'joined', communityId: COMM, userId: OTHER, role: 'moderator', via: 'invited' }]);
  });

  it('changer un rôle annonce le rôle ÉCRIT, sur la personne de la ligne', async () => {
    const r = await inject({ callerRole: 'admin', existing: { id: ROW, userId: OTHER, isActive: true } }, 'PATCH', `/communities/${COMM}/members/${ROW}/role`, { role: 'moderator' });
    expect(r.status).toBe(200);
    expect(r.announced).toEqual([{ kind: 'role-updated', communityId: COMM, userId: OTHER, role: 'moderator' }]);
  });

  it('retirer annonce un retrait', async () => {
    const r = await inject({ callerRole: 'admin', existing: { id: ROW, userId: OTHER, isActive: true } }, 'DELETE', `/communities/${COMM}/members/${OTHER}`);
    expect(r.status).toBe(200);
    expect(r.announced).toEqual([{ kind: 'left', communityId: COMM, userId: OTHER, reason: 'removed' }]);
  });
});

describe("un geste refusé ou sans effet n'annonce rien", () => {
  it('rejoindre une communauté privée (403)', async () => {
    const r = await inject({ callerRole: null, isPrivate: true }, 'POST', `/communities/${COMM}/join`);
    expect(r.status).toBe(403);
    expect(r.announced).toEqual([]);
  });

  it('un simple membre qui invite dans une communauté privée (403)', async () => {
    const r = await inject({ callerRole: 'member', isPrivate: true }, 'POST', `/communities/${COMM}/invite`, { userId: OTHER });
    expect(r.status).toBe(403);
    expect(r.announced).toEqual([]);
  });

  it("un non-administrateur qui ajoute, change un rôle ou retire (403)", async () => {
    const add = await inject({ callerRole: 'moderator' }, 'POST', `/communities/${COMM}/members`, { userId: OTHER });
    const role = await inject({ callerRole: 'moderator' }, 'PATCH', `/communities/${COMM}/members/${ROW}/role`, { role: 'admin' });
    const del = await inject({ callerRole: 'member' }, 'DELETE', `/communities/${COMM}/members/${OTHER}`);
    expect([add.status, role.status, del.status]).toEqual([403, 403, 403]);
    expect([...add.announced, ...role.announced, ...del.announced]).toEqual([]);
  });

  it("ajouter quelqu'un de déjà membre ne change rien, donc n'annonce rien", async () => {
    const r = await inject({ callerRole: 'admin', existing: { id: ROW, userId: OTHER, isActive: true } }, 'POST', `/communities/${COMM}/members`, { userId: OTHER });
    expect(r.status).toBe(200);
    expect(r.announced).toEqual([]);
  });

  it('retirer le créateur (403) ou un non-membre (404)', async () => {
    const creator = await inject({ callerRole: 'admin' }, 'DELETE', `/communities/${COMM}/members/${CREATOR}`);
    const absent = await inject({ callerRole: 'admin', existing: null }, 'DELETE', `/communities/${COMM}/members/${OTHER}`);
    expect([creator.status, absent.status]).toEqual([403, 404]);
    expect([...creator.announced, ...absent.announced]).toEqual([]);
  });
});
