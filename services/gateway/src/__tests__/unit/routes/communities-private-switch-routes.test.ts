/**
 * #16723 — les deux portes qui rendent une communauté privée (le créateur :
 * `PUT /communities/:id` ; l'administration : `PATCH /admin/communities/:id`)
 * font entrer les occupants de ses salons AVANT la bascule et sortir APRÈS
 * ceux qui ne peuvent pas entrer. Une requête refusée ne fait entrer ni sortir
 * personne (fail-closed), et une admission en panne n'écrit pas la bascule.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify from 'fastify';

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: jest.fn(() => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() })) },
}));
jest.mock('../../../utils/sanitize', () => ({ SecuritySanitizer: { sanitizeText: (text: string) => text } }));

const order: string[] = [];
const admitSalonOccupants = jest.fn<any>(async () => {
  order.push('admit');
  return [] as string[];
});
const exitSalonOutsiders = jest.fn<any>(async () => {
  order.push('exit');
});
jest.mock('../../../services/conversations/communitySalonAdoption', () => {
  const actual = jest.requireActual<typeof import('../../../services/conversations/communitySalonAdoption')>(
    '../../../services/conversations/communitySalonAdoption',
  );
  return {
    ...actual,
    admitSalonOccupants: (...args: unknown[]) => admitSalonOccupants(...args),
    exitSalonOutsiders: (...args: unknown[]) => exitSalonOutsiders(...args),
  };
});

import { registerSettingsRoutes } from '../../../routes/communities/settings';
import { registerCommunityOversightRoutes } from '../../../routes/admin/communities-oversight';

const CREATEUR = '507f1f77bcf86cd7994300c0';
const AUTRE = '507f1f77bcf86cd799430022';
const STAFF = '507f1f77bcf86cd799430099';
const COMMUNITY = '507f1f77bcf86cd799430033';
const EXCLU = '507f1f77bcf86cd799430044';
const REASON = 'Décision de modération écrite';

type Monde = { readonly isPrivate: boolean; readonly isActive?: boolean };

function prismaDouble(monde: Monde) {
  const row = {
    id: COMMUNITY,
    identifier: 'mshy_club',
    name: 'Club',
    description: null,
    avatar: null,
    banner: null,
    isPrivate: monde.isPrivate,
    isActive: monde.isActive ?? true,
    deletedAt: null,
    createdBy: CREATEUR,
    createdAt: new Date('2026-01-10T08:00:00.000Z'),
    updatedAt: new Date('2026-09-01T08:00:00.000Z'),
    creator: { id: CREATEUR, username: 'awa', displayName: 'Awa', avatar: null },
    _count: { members: 2, Conversation: 1 },
  };
  return {
    community: {
      findFirst: jest.fn<any>(async (args: any) => (args.where.isActive === true && monde.isActive === false ? null : row)),
      findUnique: jest.fn<any>(async () => row),
      update: jest.fn<any>(async () => {
        order.push('update');
        return row;
      }),
    },
    communityMember: { count: jest.fn<any>(async () => 2), findMany: jest.fn<any>(async () => []) },
    conversation: { count: jest.fn<any>(async () => 1), findMany: jest.fn<any>(async () => []) },
    post: { count: jest.fn<any>(async () => 0) },
    adminAuditLog: { create: jest.fn<any>(async () => ({})) },
  };
}

async function creatorApp(prisma: ReturnType<typeof prismaDouble>, userId = CREATEUR) {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma as never);
  app.decorate('socketIOHandler', null as never);
  app.decorate('authenticate', async (req: any) => {
    req.authContext = { isAuthenticated: true, userId, registeredUser: { id: userId } };
  });
  await app.register(registerSettingsRoutes);
  await app.ready();
  return app;
}

async function adminApp(prisma: ReturnType<typeof prismaDouble>, role: string) {
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma as never);
  app.decorate('socketIOHandler', null as never);
  app.decorate('authenticate', async (req: any) => {
    req.authContext = {
      isAuthenticated: true,
      isAnonymous: false,
      userId: STAFF,
      registeredUser: { id: STAFF, role, username: 'staff' },
    };
  });
  registerCommunityOversightRoutes(app);
  await app.ready();
  return app;
}

const put = (app: Awaited<ReturnType<typeof creatorApp>>, payload: Record<string, unknown>) =>
  app.inject({ method: 'PUT', url: `/communities/${COMMUNITY}`, payload });
const patch = (app: Awaited<ReturnType<typeof adminApp>>, payload: Record<string, unknown>) =>
  app.inject({ method: 'PATCH', url: `/communities/${COMMUNITY}`, payload });

beforeEach(() => {
  jest.clearAllMocks();
  order.splice(0);
});

describe('PUT /communities/:id — le créateur rend sa communauté privée', () => {
  it("les occupants entrent AVANT la bascule, sous l'autorité du créateur ; les exclus sortent APRÈS", async () => {
    admitSalonOccupants.mockImplementationOnce(async () => {
      order.push('admit');
      return [EXCLU];
    });
    const prisma = prismaDouble({ isPrivate: false });
    const app = await creatorApp(prisma);

    const res = await put(app, { isPrivate: true });

    expect(res.statusCode).toBe(200);
    expect(admitSalonOccupants).toHaveBeenCalledWith(prisma, { communityId: COMMUNITY, createdBy: CREATEUR });
    expect(exitSalonOutsiders).toHaveBeenCalledWith(
      expect.objectContaining({ prisma }),
      expect.objectContaining({ communityId: COMMUNITY, userIds: [EXCLU] }),
    );
    expect(order).toEqual(['admit', 'update', 'exit']);
    await app.close();
  });

  it('personne à exclure : aucune sortie', async () => {
    const app = await creatorApp(prismaDouble({ isPrivate: false }));
    expect((await put(app, { isPrivate: true })).statusCode).toBe(200);
    expect(exitSalonOutsiders).not.toHaveBeenCalled();
    await app.close();
  });

  it("une admission en panne n'écrit pas la bascule : la communauté reste publique, la requête rejouable", async () => {
    admitSalonOccupants.mockRejectedValueOnce(new Error('panne'));
    const prisma = prismaDouble({ isPrivate: false });
    const app = await creatorApp(prisma);

    expect((await put(app, { isPrivate: true })).statusCode).toBe(500);
    expect(prisma.community.update).not.toHaveBeenCalled();
    await app.close();
  });

  it.each([
    ['déjà privée', { isPrivate: true }, { isPrivate: true }],
    ['repasse publique', { isPrivate: true }, { isPrivate: false }],
    ['ne touche pas la confidentialité', { isPrivate: false }, { name: 'Nouveau nom' }],
  ])('%s : ni entrée ni sortie', async (_label, monde, payload) => {
    const app = await creatorApp(prismaDouble(monde));
    expect((await put(app, payload)).statusCode).toBe(200);
    expect(admitSalonOccupants).not.toHaveBeenCalled();
    expect(exitSalonOutsiders).not.toHaveBeenCalled();
    await app.close();
  });

  it("un autre que le créateur : 403, personne n'entre ni ne sort", async () => {
    const prisma = prismaDouble({ isPrivate: false });
    const app = await creatorApp(prisma, AUTRE);
    expect((await put(app, { isPrivate: true })).statusCode).toBe(403);
    expect(admitSalonOccupants).not.toHaveBeenCalled();
    expect(prisma.community.update).not.toHaveBeenCalled();
    await app.close();
  });

  it("une communauté désactivée : 404, personne n'entre ni ne sort", async () => {
    const app = await creatorApp(prismaDouble({ isPrivate: false, isActive: false }));
    expect((await put(app, { isPrivate: true })).statusCode).toBe(404);
    expect(admitSalonOccupants).not.toHaveBeenCalled();
    await app.close();
  });
});

describe("PATCH /admin/communities/:id — l'administration rend une communauté privée", () => {
  it("même loi : entrée sous l'autorité du CRÉATEUR (jamais du membre de l'équipe) avant, sortie après", async () => {
    admitSalonOccupants.mockImplementationOnce(async () => {
      order.push('admit');
      return [EXCLU];
    });
    const prisma = prismaDouble({ isPrivate: false });
    const app = await adminApp(prisma, 'ADMIN');

    const res = await patch(app, { isPrivate: true, reason: REASON });

    expect(res.statusCode).toBe(200);
    expect(admitSalonOccupants).toHaveBeenCalledWith(prisma, { communityId: COMMUNITY, createdBy: CREATEUR });
    expect(order).toEqual(['admit', 'update', 'exit']);
    await app.close();
  });

  it("MODERATOR : 403, personne n'entre ni ne sort", async () => {
    const prisma = prismaDouble({ isPrivate: false });
    const app = await adminApp(prisma, 'MODERATOR');
    expect((await patch(app, { isPrivate: true, reason: REASON })).statusCode).toBe(403);
    expect(admitSalonOccupants).not.toHaveBeenCalled();
    await app.close();
  });

  it("désactiver seulement : ni entrée ni sortie", async () => {
    const app = await adminApp(prismaDouble({ isPrivate: false }), 'ADMIN');
    expect((await patch(app, { isActive: false, reason: REASON })).statusCode).toBe(200);
    expect(admitSalonOccupants).not.toHaveBeenCalled();
    await app.close();
  });
});
