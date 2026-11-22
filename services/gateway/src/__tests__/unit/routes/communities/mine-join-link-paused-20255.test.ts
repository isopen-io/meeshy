/**
 * « Mes communautés » dit si le lien d'entrée de chacune est en pause (#20255) :
 * la fiche du lien (web, iOS, Android) lit cette liste, jamais le détail, et ne
 * peut montrer l'état « Actif » de l'intendant que si la liste le sert.
 *
 * Seul l'ÉTAT part (`joinLinkPaused`) : l'instant de la pause reste réservé au
 * détail d'un intendant (#19661), et rien d'autre de la communauté ne s'ajoute.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, afterEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() })),
  },
}));

import { registerMembershipRoutes } from '../../../../routes/communities/membership';

const VIEWER = '507f1f77bcf86cd799430011';
const PAUSED_AT = new Date('2026-11-20T08:00:00Z');

const membership = (id: string, role: string, joinLinkPausedAt: Date | null | undefined) => ({
  id: `m-${id}`,
  userId: VIEWER,
  role,
  isActive: true,
  community: {
    id,
    name: `Communauté ${id}`,
    identifier: `mshy_${id}`,
    avatar: null,
    isPrivate: false,
    ...(joinLinkPausedAt === undefined ? {} : { joinLinkPausedAt }),
  },
});

function makePrisma(rows: readonly unknown[]) {
  return {
    communityMember: { findMany: jest.fn<any>().mockResolvedValue(rows) },
  } as any;
}

const apps: FastifyInstance[] = [];

async function build(prisma: any): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: any) => {
    req.authContext = { isAuthenticated: true, userId: VIEWER, hasFullAccess: true, registeredUser: { id: VIEWER, role: 'USER' } };
  });
  app.decorate('prisma', prisma);
  await registerMembershipRoutes(app, { engagement: { recordActivity: jest.fn<any>() } as any });
  await app.ready();
  apps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
});

describe('GET /communities/mine — état du lien d’entrée (#20255)', () => {
  it('sert joinLinkPaused à travers le sérialiseur réel', async () => {
    const app = await build(makePrisma([membership('a', 'admin', PAUSED_AT), membership('b', 'moderator', null), membership('c', 'member', undefined)]));
    const res = await app.inject({ method: 'GET', url: '/communities/mine?role=admin,moderator,member' });
    expect(res.statusCode).toBe(200);
    const data = res.json().data as Array<Record<string, unknown>>;
    expect(data.map((row) => [row.id, row.joinLinkPaused])).toEqual([
      ['a', true],
      ['b', false],
      ['c', false],
    ]);
  });

  it('ne sert jamais l’instant de la pause, ni rien d’autre à côté', async () => {
    const app = await build(makePrisma([membership('a', 'admin', PAUSED_AT)]));
    const res = await app.inject({ method: 'GET', url: '/communities/mine' });
    const [row] = res.json().data as Array<Record<string, unknown>>;
    expect(Object.keys(row).sort()).toEqual(['avatar', 'id', 'identifier', 'isPrivate', 'joinLinkPaused', 'name', 'role']);
    expect(JSON.stringify(res.json())).not.toContain('2026-11-20');
  });

  it('demande la colonne à la base', async () => {
    const prisma = makePrisma([]);
    const app = await build(prisma);
    await app.inject({ method: 'GET', url: '/communities/mine' });
    const query = prisma.communityMember.findMany.mock.calls[0][0];
    expect(query.include.community.select.joinLinkPausedAt).toBe(true);
  });
});
