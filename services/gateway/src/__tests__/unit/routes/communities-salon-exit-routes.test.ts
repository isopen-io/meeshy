/**
 * #16704 — les deux portes qui mettent fin à une appartenance de communauté
 * (`POST /communities/:id/leave`, `DELETE /communities/:id/members/:memberId`)
 * font sortir des salons d'une communauté qui les garde (privée ou
 * désactivée). Une communauté publique vivante ne fait sortir de rien, et une
 * requête refusée ne fait sortir personne (fail-closed).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify from 'fastify';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: jest.fn(() => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() })) },
}));

const exitCommunitySalons = jest.fn<any>(async () => ({ exitedConversationIds: [], announcements: Promise.resolve() }));
jest.mock('../../../services/conversations/communitySalonExit', () => {
  const actual = jest.requireActual<typeof import('../../../services/conversations/communitySalonExit')>(
    '../../../services/conversations/communitySalonExit',
  );
  return { ...actual, exitCommunitySalons: (...args: unknown[]) => exitCommunitySalons(...args) };
});

import { registerMembershipRoutes } from '../../../routes/communities/membership';
import { registerMemberRoutes } from '../../../routes/communities/members';

const ACTEUR = '507f1f77bcf86cd799430011';
const AUTRE = '507f1f77bcf86cd799430022';
const CREATEUR = '507f1f77bcf86cd7994300c0';
const COMMUNITY = '507f1f77bcf86cd799430033';

type Monde = {
  readonly isPrivate: boolean;
  readonly isActive?: boolean;
  readonly acteurRole?: string | null;
  readonly cibleActive?: boolean;
};

function prismaDouble(monde: Monde) {
  return {
    community: {
      findFirst: jest.fn<any>(async (args: any) => {
        if (args.where.isActive === true && monde.isActive === false) return null;
        return {
          id: COMMUNITY,
          createdBy: CREATEUR,
          isPrivate: monde.isPrivate,
          isActive: monde.isActive ?? true,
          members: monde.acteurRole ? [{ role: monde.acteurRole }] : [],
        };
      }),
    },
    communityMember: {
      findFirst: jest.fn<any>(async (args: any) => {
        if (args.where.userId === ACTEUR) return monde.acteurRole ? { id: 'cm-acteur', role: monde.acteurRole } : null;
        return monde.cibleActive === false ? null : { id: 'cm-autre', role: 'member' };
      }),
      update: jest.fn<any>(async () => ({})),
    },
  };
}

async function app(prisma: ReturnType<typeof prismaDouble>) {
  const instance = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  instance.decorate('authenticate', async (req: any) => {
    req.authContext = {
      isAuthenticated: true,
      userId: ACTEUR,
      registeredUser: { id: ACTEUR, username: 'acteur', role: 'USER' },
    };
  });
  instance.decorate('prisma', prisma as never);
  instance.decorate('socketIOHandler', { getManager: () => null } as never);
  await registerMembershipRoutes(instance);
  await registerMemberRoutes(instance);
  await instance.ready();
  return instance;
}

beforeEach(() => {
  exitCommunitySalons.mockClear();
});

describe('POST /communities/:id/leave — le partant sort des salons d\'une communauté qui les garde', () => {
  it('communauté privée : le départ fait sortir l\'appelant de ses salons, après l\'écriture du départ', async () => {
    const prisma = prismaDouble({ isPrivate: true, acteurRole: 'member' });
    const server = await app(prisma);
    const res = await server.inject({ method: 'POST', url: `/communities/${COMMUNITY}/leave` });
    expect(res.statusCode).toBe(200);
    expect(exitCommunitySalons).toHaveBeenCalledTimes(1);
    expect(exitCommunitySalons.mock.calls[0][1]).toEqual({ communityId: COMMUNITY, userId: ACTEUR, now: expect.any(Date) });
    expect(prisma.communityMember.update.mock.invocationCallOrder[0])
      .toBeLessThan(exitCommunitySalons.mock.invocationCallOrder[0]);
    await server.close();
  });

  it('communauté désactivée : même sortie qu\'une privée', async () => {
    const server = await app(prismaDouble({ isPrivate: false, isActive: false, acteurRole: 'member' }));
    const res = await server.inject({ method: 'POST', url: `/communities/${COMMUNITY}/leave` });
    expect(res.statusCode).toBe(200);
    expect(exitCommunitySalons).toHaveBeenCalledTimes(1);
    await server.close();
  });

  it('communauté publique vivante : l\'appelant reste dans ses salons', async () => {
    const server = await app(prismaDouble({ isPrivate: false, acteurRole: 'member' }));
    const res = await server.inject({ method: 'POST', url: `/communities/${COMMUNITY}/leave` });
    expect(res.statusCode).toBe(200);
    expect(exitCommunitySalons).not.toHaveBeenCalled();
    await server.close();
  });

  it('non-membre : 404 et aucune sortie', async () => {
    const server = await app(prismaDouble({ isPrivate: true, acteurRole: null }));
    const res = await server.inject({ method: 'POST', url: `/communities/${COMMUNITY}/leave` });
    expect(res.statusCode).toBe(404);
    expect(exitCommunitySalons).not.toHaveBeenCalled();
    await server.close();
  });
});

describe('DELETE /communities/:id/members/:memberId — le retiré sort des salons d\'une communauté qui les garde', () => {
  it('communauté privée, retiré par un administrateur : il sort de ses salons', async () => {
    const server = await app(prismaDouble({ isPrivate: true, acteurRole: 'admin' }));
    const res = await server.inject({ method: 'DELETE', url: `/communities/${COMMUNITY}/members/${AUTRE}` });
    expect(res.statusCode).toBe(200);
    expect(exitCommunitySalons).toHaveBeenCalledTimes(1);
    expect(exitCommunitySalons.mock.calls[0][1]).toEqual({ communityId: COMMUNITY, userId: AUTRE, now: expect.any(Date) });
    await server.close();
  });

  it('communauté publique : le retiré garde ses salons (ils sont ouverts à quiconque)', async () => {
    const server = await app(prismaDouble({ isPrivate: false, acteurRole: 'admin' }));
    const res = await server.inject({ method: 'DELETE', url: `/communities/${COMMUNITY}/members/${AUTRE}` });
    expect(res.statusCode).toBe(200);
    expect(exitCommunitySalons).not.toHaveBeenCalled();
    await server.close();
  });

  it.each([
    ['simple membre', 'member', 403],
    ['modérateur', 'moderator', 403],
    ['non-membre', null, 403],
  ])('%s : refusé, et personne ne sort', async (_label, role, status) => {
    const server = await app(prismaDouble({ isPrivate: true, acteurRole: role }));
    const res = await server.inject({ method: 'DELETE', url: `/communities/${COMMUNITY}/members/${AUTRE}` });
    expect(res.statusCode).toBe(status);
    expect(exitCommunitySalons).not.toHaveBeenCalled();
    await server.close();
  });

  it('le créateur ne se retire pas : 403 et aucune sortie', async () => {
    const server = await app(prismaDouble({ isPrivate: true, acteurRole: 'admin' }));
    const res = await server.inject({ method: 'DELETE', url: `/communities/${COMMUNITY}/members/${CREATEUR}` });
    expect(res.statusCode).toBe(403);
    expect(exitCommunitySalons).not.toHaveBeenCalled();
    await server.close();
  });

  it('ancien membre (ligne inactive) : 404 et aucune sortie', async () => {
    const server = await app(prismaDouble({ isPrivate: true, acteurRole: 'admin', cibleActive: false }));
    const res = await server.inject({ method: 'DELETE', url: `/communities/${COMMUNITY}/members/${AUTRE}` });
    expect(res.statusCode).toBe(404);
    expect(exitCommunitySalons).not.toHaveBeenCalled();
    await server.close();
  });

  it('communauté désactivée : 404 et aucune sortie', async () => {
    const server = await app(prismaDouble({ isPrivate: true, isActive: false, acteurRole: 'admin' }));
    const res = await server.inject({ method: 'DELETE', url: `/communities/${COMMUNITY}/members/${AUTRE}` });
    expect(res.statusCode).toBe(404);
    expect(exitCommunitySalons).not.toHaveBeenCalled();
    await server.close();
  });
});
