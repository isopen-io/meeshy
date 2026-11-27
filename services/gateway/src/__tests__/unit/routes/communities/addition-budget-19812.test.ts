/**
 * Les deux routes qui font entrer quelqu'un dans une communauté SANS son
 * accord (`POST …/invite`, `POST …/members`) sont bornées par ACTEUR et par
 * CIBLE (#19812). Chaque ajout pousse une notification nommant l'acteur :
 * seul le plafond global par IP les bornait.
 *
 * Témoins : le plafond horaire et journalier de l'acteur, partagé par les deux
 * routes ; une tentative vers un compte non ajoutable compte (pas de sondage
 * gratuit) ; le plafond de la cible tous acteurs confondus ; un acteur refusé
 * n'épuise pas la cible ; un 429 n'écrit rien et ne notifie personne ; les
 * refus d'autorisation existants passent AVANT le budget.
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

jest.mock('../../../../services/community-member-broadcast', () => {
  const actual = jest.requireActual('../../../../services/community-member-broadcast') as Record<string, unknown>;
  return { ...actual, scheduleCommunityMemberBroadcastFrom: jest.fn() };
});

jest.mock('../../../../services/notifications/community-added', () => ({
  scheduleCommunityAddedAnnouncement: jest.fn(),
}));

import { registerMembershipRoutes } from '../../../../routes/communities/membership';
import { registerMemberRoutes } from '../../../../routes/communities/members';
import { scheduleCommunityAddedAnnouncement } from '../../../../services/notifications/community-added';
import {
  COMMUNITY_ADDITION_BUDGET,
  COMMUNITY_ADDITION_BUDGET_CODE,
} from '../../../../utils/community-addition-budget';

const COMM = '507f1f77bcf86cd799430033';
const ROW = '507f1f77bcf86cd799430066';
const ADMIN = '507f1f77bcf86cd799430011';

const idOf = (prefix: string, n: number) => `${prefix}${n.toString(16).padStart(24 - prefix.length, '0')}`;
const targetId = (n: number) => idOf('a1', n);
const actorId = (n: number) => idOf('b2', n);
const UNKNOWN = (n: number) => idOf('c3', n);

type Fixture = {
  readonly viewerRole?: 'admin' | 'moderator' | 'member' | null;
  readonly isPrivate?: boolean;
};

function makePrisma(fixture: Fixture = {}) {
  const viewerRole = fixture.viewerRole === undefined ? 'admin' : fixture.viewerRole;
  return {
    community: {
      findFirst: jest.fn<any>(async ({ where }: any) => ({
        id: where.id,
        isPrivate: fixture.isPrivate ?? false,
        createdBy: ADMIN,
        members: viewerRole ? [{ role: viewerRole }] : [],
      })),
    },
    communityMember: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      create: jest.fn<any>(async ({ data }: any) => ({ id: ROW, joinedAt: new Date(), isActive: true, ...data })),
      update: jest.fn<any>(async ({ data }: any) => ({ id: ROW, ...data })),
    },
    communityJoinRequest: {
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    user: {
      findFirst: jest.fn<any>(async ({ where }: any) => {
        if (typeof where.id !== 'string') return null;
        const id = where.id.toLowerCase();
        return id.startsWith('a1') ? { id, birthDate: null } : null;
      }),
      findUnique: jest.fn<any>().mockResolvedValue({ blockedUserIds: [] }),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    friendRequest: { findMany: jest.fn<any>().mockResolvedValue([]) },
    userRelation: { findMany: jest.fn<any>().mockResolvedValue([]) },
  } as any;
}

const registered = (userId: string) => ({
  isAuthenticated: true,
  userId,
  hasFullAccess: true,
  registeredUser: { id: userId, username: 'u', displayName: 'U', role: 'USER' },
});

const apps: FastifyInstance[] = [];
const engagement = { recordActivity: jest.fn<any>().mockResolvedValue(undefined) };

type Harness = { readonly app: FastifyInstance; readonly prisma: any; as(userId: string): void };

async function build(fixture: Fixture = {}): Promise<Harness> {
  const prisma = makePrisma(fixture);
  const state = { actor: ADMIN };
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: any) => { req.authContext = registered(state.actor); });
  app.decorate('prisma', prisma);
  await registerMembershipRoutes(app, { engagement });
  await registerMemberRoutes(app);
  await app.ready();
  apps.push(app);
  return { app, prisma, as: (userId) => { state.actor = userId; } };
}

const invite = (h: Harness, userId: string) =>
  h.app.inject({ method: 'POST', url: `/communities/${COMM}/invite`, payload: { userId } });
const add = (h: Harness, userId: string) =>
  h.app.inject({ method: 'POST', url: `/communities/${COMM}/members`, payload: { userId } });

const writes = (h: Harness) =>
  h.prisma.communityMember.create.mock.calls.length + h.prisma.communityMember.update.mock.calls.length;

async function inSequence(count: number, gesture: (i: number) => Promise<{ statusCode: number }>): Promise<number[]> {
  const codes: number[] = [];
  for (let i = 0; i < count; i += 1) codes.push((await gesture(i)).statusCode);
  return codes;
}

afterEach(async () => {
  jest.restoreAllMocks();
  (scheduleCommunityAddedAnnouncement as jest.Mock).mockClear();
  await Promise.all(apps.splice(0).map((a) => a.close()));
});

describe('POST /communities/:id/invite et /members — budget de l’ACTEUR (#19812)', () => {
  it('laisse passer le plafond horaire, puis refuse en 429 nommé avec Retry-After, sans écrire ni notifier', async () => {
    const h = await build();
    const codes = await inSequence(COMMUNITY_ADDITION_BUDGET.actorPerHour, (i) => invite(h, targetId(i)));
    expect(codes.every((c) => c === 200)).toBe(true);

    const refused = await invite(h, targetId(999));
    expect(refused.statusCode).toBe(429);
    expect(refused.json()).toMatchObject({ success: false, code: COMMUNITY_ADDITION_BUDGET_CODE });
    expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0);
    expect(writes(h)).toBe(COMMUNITY_ADDITION_BUDGET.actorPerHour);
    expect(scheduleCommunityAddedAnnouncement).toHaveBeenCalledTimes(COMMUNITY_ADDITION_BUDGET.actorPerHour);
  });

  it('partage UN seau entre les deux routes : passer de l’une à l’autre ne rouvre rien', async () => {
    const h = await build();
    const half = COMMUNITY_ADDITION_BUDGET.actorPerHour / 2;
    await inSequence(half, (i) => invite(h, targetId(i)));
    await inSequence(half, (i) => add(h, targetId(100 + i)));

    expect((await add(h, targetId(998))).statusCode).toBe(429);
    expect((await invite(h, targetId(999))).statusCode).toBe(429);
  });

  it('compte une tentative vers un compte NON ajoutable : la porte n’est pas un sondage gratuit', async () => {
    const h = await build();
    const codes = await inSequence(COMMUNITY_ADDITION_BUDGET.actorPerHour, (i) => invite(h, UNKNOWN(i)));
    expect(codes.every((c) => c === 404)).toBe(true);

    expect((await invite(h, targetId(1))).statusCode).toBe(429);
    expect(writes(h)).toBe(0);
  });

  it('borne aussi la JOURNÉE : l’heure suivante rouvre le seau horaire, pas le journalier', async () => {
    const start = Date.now();
    let now = start;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const h = await build();
    const perHour = COMMUNITY_ADDITION_BUDGET.actorPerHour;
    const hours = Math.ceil(COMMUNITY_ADDITION_BUDGET.actorPerDay / perHour);
    let sent = 0;
    for (let hour = 0; hour < hours; hour += 1) {
      now = start + hour * 61 * 60 * 1000;
      const batch = Math.min(perHour, COMMUNITY_ADDITION_BUDGET.actorPerDay - sent);
      const codes = await inSequence(batch, (i) => invite(h, targetId(sent + i)));
      expect(codes.every((c) => c === 200)).toBe(true);
      sent += batch;
    }
    now = start + hours * 61 * 60 * 1000;
    expect((await invite(h, targetId(5000))).statusCode).toBe(429);
  });

  it('laisse passer les refus d’autorisation AVANT le budget, inchangés', async () => {
    const outsider = await build({ viewerRole: null });
    expect((await invite(outsider, targetId(1))).statusCode).toBe(403);

    const plainMember = await build({ viewerRole: 'member', isPrivate: true });
    expect((await invite(plainMember, targetId(1))).statusCode).toBe(403);
    expect((await add(plainMember, targetId(1))).statusCode).toBe(403);

    const moderator = await build({ viewerRole: 'moderator' });
    expect((await add(moderator, targetId(1))).statusCode).toBe(403);
  });

  it('ne débite rien sur un refus d’autorisation : un non-membre obstiné n’épuise pas son seau', async () => {
    const h = await build({ viewerRole: 'member', isPrivate: true });
    await inSequence(COMMUNITY_ADDITION_BUDGET.actorPerHour + 5, (i) => invite(h, targetId(i)));
    h.prisma.community.findFirst.mockImplementation(async ({ where }: any) => ({
      id: where.id, isPrivate: false, createdBy: ADMIN, members: [{ role: 'member' }],
    }));
    expect((await invite(h, targetId(900))).statusCode).toBe(200);
  });
});

describe('POST /communities/:id/invite et /members — budget de la CIBLE (#19812)', () => {
  it('borne les ajouts d’une MÊME personne tous acteurs confondus, sans écrire au-delà', async () => {
    const h = await build();
    const victim = targetId(42);
    const codes = await inSequence(COMMUNITY_ADDITION_BUDGET.targetPerDay, (i) => {
      h.as(actorId(i));
      return i % 2 === 0 ? invite(h, victim) : add(h, victim);
    });
    expect(codes.every((c) => c === 200)).toBe(true);

    h.as(actorId(500));
    const refused = await invite(h, victim);
    expect(refused.statusCode).toBe(429);
    expect(refused.json().code).toBe(COMMUNITY_ADDITION_BUDGET_CODE);
    expect(writes(h)).toBe(COMMUNITY_ADDITION_BUDGET.targetPerDay);
  });

  it('compte la cible par son id CANONIQUE : changer la casse de l’ObjectId ne rouvre pas son seau', async () => {
    const h = await build();
    const victim = targetId(43);
    await inSequence(COMMUNITY_ADDITION_BUDGET.targetPerDay, (i) => {
      h.as(actorId(i));
      return invite(h, victim);
    });

    h.as(actorId(600));
    expect((await invite(h, victim.toUpperCase())).statusCode).toBe(429);
    h.as(actorId(601));
    expect((await add(h, victim.toUpperCase())).statusCode).toBe(429);
  });

  it('un acteur déjà refusé n’entame pas le seau de sa cible', async () => {
    const h = await build();
    h.as(actorId(1));
    await inSequence(COMMUNITY_ADDITION_BUDGET.actorPerHour, (i) => invite(h, targetId(i)));
    const victim = targetId(777);
    await inSequence(COMMUNITY_ADDITION_BUDGET.targetPerDay * 3, () => invite(h, victim));

    h.as(actorId(2));
    expect((await invite(h, victim)).statusCode).toBe(200);
  });

  it('#20464 — un MÊME acteur n’entame le seau d’une cible que trois fois par jour : l’ajout/retrait ne l’épuise pas', async () => {
    const h = await build();
    const victim = targetId(55);
    h.as(actorId(1));
    const codes = await inSequence(COMMUNITY_ADDITION_BUDGET.targetPerDay, () => invite(h, victim));
    expect(codes.slice(0, COMMUNITY_ADDITION_BUDGET.pairPerDay).every((c) => c === 200)).toBe(true);
    expect(codes.slice(COMMUNITY_ADDITION_BUDGET.pairPerDay).every((c) => c === 429)).toBe(true);

    const others = await inSequence(COMMUNITY_ADDITION_BUDGET.targetPerDay - COMMUNITY_ADDITION_BUDGET.pairPerDay, (i) => {
      h.as(actorId(10 + i));
      return add(h, victim);
    });
    expect(others.every((c) => c === 200)).toBe(true);
  });

  it('un 409 « déjà membre » ne débite pas la cible', async () => {
    const h = await build();
    const victim = targetId(9);
    h.prisma.communityMember.findFirst.mockResolvedValue({ id: ROW, isActive: true });
    await inSequence(COMMUNITY_ADDITION_BUDGET.targetPerDay + 2, (i) => {
      h.as(actorId(i));
      return invite(h, victim);
    });
    h.prisma.communityMember.findFirst.mockResolvedValue(null);
    h.as(actorId(300));
    expect((await invite(h, victim)).statusCode).toBe(200);
  });
});
