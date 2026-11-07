/**
 * Gérer les membres d'une communauté (#6375) — ce que la passerelle refuse,
 * maintenant que le web offre le geste à côté d'iOS.
 *
 * - Une communauté DÉSACTIVÉE par l'administration (#8876) n'est plus gérée :
 *   ni changement de rôle ni retrait, 404 comme pour tous ses lecteurs.
 * - Le CRÉATEUR ne se rétrograde ni ne se retire par un administrateur qu'il a
 *   nommé : ses droits viennent de `createdBy`, que ni la ligne ni le rôle ne
 *   portent — l'écrire laisserait une communauté dont le créateur est « parti »
 *   tout en y gardant la main. 403, sans aucune écriture.
 * - Le rôle d'un ANCIEN membre ne se réécrit pas : seule une ligne active se
 *   gère (le prédicat unique `activeMembershipOf`, #16603).
 *
 * Le double Prisma HONORE les `where` qu'il reçoit (id, communityId, isActive,
 * userId) : une garde qui vit dans un `where` n'est visible d'un témoin que si
 * le faux applique ce `where`.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));

import { registerMemberRoutes } from '../../../routes/communities/members';

const CREATOR = '507f1f77bcf86cd799439001';
const ADMIN = '507f1f77bcf86cd799439002';
const MEMBER = '507f1f77bcf86cd799439003';
const FORMER = '507f1f77bcf86cd799439004';
const ALIVE = '507f1f77bcf86cd7994390a1';
const DEACTIVATED = '507f1f77bcf86cd7994390a2';

type Row = Record<string, unknown>;

const memberRows = (communityId: string): Row[] => [
  { id: `${communityId}-creator`, communityId, userId: CREATOR, role: 'admin', isActive: true },
  { id: `${communityId}-admin`, communityId, userId: ADMIN, role: 'admin', isActive: true },
  { id: `${communityId}-member`, communityId, userId: MEMBER, role: 'member', isActive: true },
  { id: `${communityId}-former`, communityId, userId: FORMER, role: 'member', isActive: false },
];

const COMMUNITIES: Row[] = [
  { id: ALIVE, createdBy: CREATOR, isActive: true },
  { id: DEACTIVATED, createdBy: CREATOR, isActive: false },
];

function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, value]) => {
    if (value === undefined) return true;
    if (typeof value === 'object' && value !== null && 'not' in value) return row[key] !== (value as Row).not;
    return row[key] === value;
  });
}

function makePrisma() {
  const rows = [...memberRows(ALIVE), ...memberRows(DEACTIVATED)];
  const writes: Row[] = [];
  const prisma = {
    community: {
      findFirst: jest.fn<any>(async ({ where, select }: { where: Row; select?: Row }) => {
        const community = COMMUNITIES.find((row) => matches(row, where));
        if (!community) return null;
        const membersWhere = ((select?.members as Row | undefined)?.where ?? {}) as Row;
        return {
          ...community,
          members: rows.filter((row) => row.communityId === community.id && matches(row, membersWhere)),
        };
      }),
    },
    communityMember: {
      findFirst: jest.fn<any>(async ({ where }: { where: Row }) => rows.find((row) => matches(row, where)) ?? null),
      update: jest.fn<any>(async ({ where, data }: { where: Row; data: Row }) => {
        const row = rows.find((candidate) => matches(candidate, where));
        if (!row) throw Object.assign(new Error('Record to update not found.'), { code: 'P2025' });
        writes.push({ where, data });
        return { ...row, ...data, user: { id: row.userId, username: 'u', displayName: 'U', avatar: null } };
      }),
    },
  };
  return { prisma, writes };
}

async function build(viewer: string): Promise<{ app: FastifyInstance; writes: Row[] }> {
  const { prisma, writes } = makePrisma();
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: any) => {
    req.authContext = { isAuthenticated: true, userId: viewer, registeredUser: { id: viewer, role: 'USER' } };
  });
  app.decorate('prisma', prisma as any);
  await app.register(registerMemberRoutes);
  await app.ready();
  return { app, writes };
}

const patchRole = (app: FastifyInstance, communityId: string, rowId: string, role = 'moderator') =>
  app.inject({ method: 'PATCH', url: `/communities/${communityId}/members/${rowId}/role`, payload: { role } });

const remove = (app: FastifyInstance, communityId: string, userId: string) =>
  app.inject({ method: 'DELETE', url: `/communities/${communityId}/members/${userId}` });

describe('PATCH /communities/:id/members/:memberId/role', () => {
  it('un administrateur change le rôle d’un membre actif', async () => {
    const { app, writes } = await build(ADMIN);
    const res = await patchRole(app, ALIVE, `${ALIVE}-member`);
    expect(res.statusCode).toBe(200);
    expect(writes).toHaveLength(1);
    await app.close();
  });

  it('un simple membre est refusé, sans écriture', async () => {
    const { app, writes } = await build(MEMBER);
    expect((await patchRole(app, ALIVE, `${ALIVE}-admin`, 'member')).statusCode).toBe(403);
    expect(writes).toHaveLength(0);
    await app.close();
  });

  it('une communauté désactivée ne se gère plus : 404, sans écriture', async () => {
    const { app, writes } = await build(ADMIN);
    expect((await patchRole(app, DEACTIVATED, `${DEACTIVATED}-member`)).statusCode).toBe(404);
    expect(writes).toHaveLength(0);
    await app.close();
  });

  it('le créateur ne se rétrograde pas : 403, sans écriture', async () => {
    const { app, writes } = await build(ADMIN);
    const res = await patchRole(app, ALIVE, `${ALIVE}-creator`, 'member');
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe('COMMUNITY_CREATOR_PROTECTED');
    expect(writes).toHaveLength(0);
    await app.close();
  });

  it('rendre le rôle d’administrateur au créateur reste permis (réparation d’une rétrogradation antérieure)', async () => {
    const { app, writes } = await build(ADMIN);
    expect((await patchRole(app, ALIVE, `${ALIVE}-creator`, 'admin')).statusCode).toBe(200);
    expect(writes).toHaveLength(1);
    await app.close();
  });

  it('la ligne du créateur d’une AUTRE communauté, visée par le chemin de celle-ci : 404, jamais 403', async () => {
    const { app, writes } = await build(ADMIN);
    expect((await patchRole(app, ALIVE, `${DEACTIVATED}-creator`, 'member')).statusCode).toBe(404);
    expect(writes).toHaveLength(0);
    await app.close();
  });

  it('le rôle d’un ancien membre ne se réécrit pas : 404', async () => {
    const { app, writes } = await build(ADMIN);
    expect((await patchRole(app, ALIVE, `${ALIVE}-former`)).statusCode).toBe(404);
    expect(writes).toHaveLength(0);
    await app.close();
  });
});

describe('DELETE /communities/:id/members/:memberId', () => {
  it('un administrateur retire un membre actif', async () => {
    const { app, writes } = await build(ADMIN);
    expect((await remove(app, ALIVE, MEMBER)).statusCode).toBe(200);
    expect(writes).toHaveLength(1);
    await app.close();
  });

  it('un simple membre est refusé, sans écriture', async () => {
    const { app, writes } = await build(MEMBER);
    expect((await remove(app, ALIVE, ADMIN)).statusCode).toBe(403);
    expect(writes).toHaveLength(0);
    await app.close();
  });

  it('une communauté désactivée ne se gère plus : 404, sans écriture', async () => {
    const { app, writes } = await build(ADMIN);
    expect((await remove(app, DEACTIVATED, MEMBER)).statusCode).toBe(404);
    expect(writes).toHaveLength(0);
    await app.close();
  });

  it('un ancien membre ne se retire pas une seconde fois : 404, sans écriture', async () => {
    const { app, writes } = await build(ADMIN);
    expect((await remove(app, ALIVE, FORMER)).statusCode).toBe(404);
    expect(writes).toHaveLength(0);
    await app.close();
  });

  it('le créateur ne se retire pas : 403, sans écriture', async () => {
    const { app, writes } = await build(ADMIN);
    const res = await remove(app, ALIVE, CREATOR);
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe('COMMUNITY_CREATOR_PROTECTED');
    expect(writes).toHaveLength(0);
    await app.close();
  });
});
