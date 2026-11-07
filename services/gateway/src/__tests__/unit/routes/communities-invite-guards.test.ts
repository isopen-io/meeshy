/**
 * Inviter dans une communauté (#6376) — ce que la passerelle refuse,
 * maintenant que le web offre le geste à côté d'iOS.
 *
 * L'invitation AJOUTE la personne (aucune acceptation de sa part) : elle ne
 * peut donc viser ni un compte DÉSACTIVÉ, ni une personne qui a bloqué
 * l'inviteur ou qu'il a bloquée. Les deux rendent le même 404 qu'un compte
 * inexistant : la réponse ne dit pas à l'inviteur qu'on l'a bloqué.
 *
 * Le double Prisma HONORE les `where` qu'il reçoit (identifiant, désactivation,
 * blocage dans les deux sens) : une garde qui vit dans un `where` n'est visible
 * d'un témoin que si le faux applique ce `where`.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));

jest.mock('../../../services/achievements/CerclesAchievements', () => ({
  CerclesAchievements: jest.fn().mockImplementation(() => ({ recordEvent: jest.fn<any>().mockResolvedValue(undefined) })),
}));

import { registerMembershipRoutes } from '../../../routes/communities/membership';
import { registerMemberRoutes } from '../../../routes/communities/members';

const ADMIN = '507f1f77bcf86cd799439101';
const MEMBER = '507f1f77bcf86cd799439102';
const NEWCOMER = '507f1f77bcf86cd799439103';
const DEACTIVATED_USER = '507f1f77bcf86cd799439104';
const BLOCKS_ADMIN = '507f1f77bcf86cd799439105';
const BLOCKED_BY_ADMIN = '507f1f77bcf86cd799439106';
const SELF_DELETED = '507f1f77bcf86cd799439107';
const COMMUNITY = '507f1f77bcf86cd7994391a1';

type Row = Record<string, unknown>;

const USERS: Row[] = [
  { id: ADMIN, isActive: true, deactivatedAt: null, deletedAt: null, blockedUserIds: [BLOCKED_BY_ADMIN] },
  { id: MEMBER, isActive: true, deactivatedAt: null, deletedAt: null, blockedUserIds: [] },
  { id: NEWCOMER, isActive: true, deactivatedAt: null, deletedAt: null, blockedUserIds: [] },
  { id: DEACTIVATED_USER, isActive: false, deactivatedAt: new Date('2026-10-01'), deletedAt: null, blockedUserIds: [] },
  { id: BLOCKS_ADMIN, isActive: true, deactivatedAt: null, deletedAt: null, blockedUserIds: [ADMIN] },
  { id: BLOCKED_BY_ADMIN, isActive: true, deactivatedAt: null, deletedAt: null, blockedUserIds: [] },
  // Suppression demandée par l'utilisateur (`routes/account-deletion.ts`) : `isActive: false` + `deletedAt`, SANS `deactivatedAt`.
  { id: SELF_DELETED, isActive: false, deactivatedAt: null, deletedAt: new Date('2026-10-02'), blockedUserIds: [] },
];

function userMatches(row: Row, where: Row): boolean {
  if (Array.isArray(where.OR)) return (where.OR as Row[]).some((branch) => userMatches(row, branch));
  return Object.entries(where).every(([key, value]) => {
    if (value === undefined) return true;
    if (typeof value === 'object' && value !== null && 'has' in value) {
      return ((row[key] as unknown[]) ?? []).includes((value as Row).has);
    }
    return row[key] === value;
  });
}

function makePrisma() {
  const writes: Row[] = [];
  const members: Row[] = [
    { id: 'm-admin', communityId: COMMUNITY, userId: ADMIN, role: 'admin', isActive: true },
    { id: 'm-member', communityId: COMMUNITY, userId: MEMBER, role: 'member', isActive: true },
  ];
  const prisma = {
    community: {
      findFirst: jest.fn<any>(async ({ where, select }: { where: Row; select?: Row }) => {
        if (where.id !== COMMUNITY || where.isActive !== true) return null;
        const membersWhere = ((select?.members as Row | undefined)?.where ?? {}) as Row;
        return {
          id: COMMUNITY,
          isPrivate: false,
          createdBy: ADMIN,
          members: members.filter((row) => Object.entries(membersWhere).every(([key, value]) => row[key] === value)),
        };
      }),
    },
    user: {
      findFirst: jest.fn<any>(async ({ where }: { where: Row }) => USERS.find((row) => userMatches(row, where)) ?? null),
    },
    communityMember: {
      findFirst: jest.fn<any>(async ({ where }: { where: Row }) =>
        members.find((row) => row.communityId === where.communityId && row.userId === where.userId) ?? null),
      create: jest.fn<any>(async ({ data }: { data: Row }) => {
        writes.push(data);
        return { id: 'm-new', ...data, isActive: true, user: { id: data.userId, username: 'new', displayName: 'New', avatar: null, isOnline: true, deactivatedAt: null } };
      }),
      update: jest.fn<any>(async ({ data }: { data: Row }) => {
        writes.push(data);
        return {};
      }),
    },
    friendRequest: { findMany: jest.fn<any>().mockResolvedValue([]), findFirst: jest.fn<any>().mockResolvedValue(null) },
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
  await app.register(registerMembershipRoutes);
  await app.register(registerMemberRoutes);
  await app.ready();
  return { app, writes };
}

const invite = (app: FastifyInstance, userId: string) =>
  app.inject({ method: 'POST', url: `/communities/${COMMUNITY}/invite`, payload: { userId } });

describe('POST /communities/:id/invite — qui peut être ajouté', () => {
  it('un membre invite un nouvel arrivant dans une communauté publique', async () => {
    const { app, writes } = await build(MEMBER);
    expect((await invite(app, NEWCOMER)).statusCode).toBe(200);
    expect(writes).toHaveLength(1);
    await app.close();
  });

  it('un compte désactivé n’est pas ajouté : 404, sans écriture', async () => {
    const { app, writes } = await build(ADMIN);
    expect((await invite(app, DEACTIVATED_USER)).statusCode).toBe(404);
    expect(writes).toHaveLength(0);
    await app.close();
  });

  it('un compte supprimé par son titulaire n’est pas ajouté : 404, sans écriture', async () => {
    const { app, writes } = await build(MEMBER);
    expect((await invite(app, SELF_DELETED)).statusCode).toBe(404);
    expect(writes).toHaveLength(0);
    await app.close();
  });

  it('une personne qui a bloqué l’inviteur n’est pas ajoutée : 404 comme un inconnu, sans écriture', async () => {
    const { app, writes } = await build(ADMIN);
    const res = await invite(app, BLOCKS_ADMIN);
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toBe('User to invite not found');
    expect(writes).toHaveLength(0);
    await app.close();
  });

  it('une personne que l’inviteur a bloquée n’est pas ajoutée : 404, sans écriture', async () => {
    const { app, writes } = await build(ADMIN);
    expect((await invite(app, BLOCKED_BY_ADMIN)).statusCode).toBe(404);
    expect(writes).toHaveLength(0);
    await app.close();
  });

  it('un membre déjà actif rend 409, sans écriture', async () => {
    const { app, writes } = await build(ADMIN);
    expect((await invite(app, MEMBER)).statusCode).toBe(409);
    expect(writes).toHaveLength(0);
    await app.close();
  });
});

const add = (app: FastifyInstance, userId: string) =>
  app.inject({ method: 'POST', url: `/communities/${COMMUNITY}/members`, payload: { userId } });

describe('POST /communities/:id/members — la route jumelle de l’administrateur garde les mêmes personnes', () => {
  it('un administrateur ajoute un nouvel arrivant', async () => {
    const { app, writes } = await build(ADMIN);
    expect((await add(app, NEWCOMER)).statusCode).toBe(200);
    expect(writes).toHaveLength(1);
    await app.close();
  });

  it.each([
    ['un compte désactivé', DEACTIVATED_USER],
    ['un compte supprimé par son titulaire', SELF_DELETED],
    ['une personne qui a bloqué l’administrateur', BLOCKS_ADMIN],
    ['une personne que l’administrateur a bloquée', BLOCKED_BY_ADMIN],
  ])('%s n’est pas ajouté : 404, sans écriture', async (_label, target) => {
    const { app, writes } = await build(ADMIN);
    expect((await add(app, target)).statusCode).toBe(404);
    expect(writes).toHaveLength(0);
    await app.close();
  });
});
