/**
 * #20694 — passer une communauté publique en privée (`PUT /communities/:id`)
 * fait entrer TOUS les occupants de ses salons qui n'en ont jamais été membres
 * (#16723), sans leur accord. Avec le rattachement à une communauté publique
 * (qui ne fait entrer personne, donc ne paie rien), c'était le contournement
 * complet du budget de #19812 : rattacher un groupe de 250 personnes, puis
 * basculer.
 *
 * Témoins : le créateur paie le nombre d'ENTRANTS ; au-delà, 429 nommé, ni
 * membre écrit, ni bascule ; un ancien membre ne revient pas et un compte non
 * ajoutable sort — ni l'un ni l'autre ne coûte. La bascule par l'équipe de la
 * plateforme (`PATCH /admin/communities/:id`) est DISPENSÉE par décision
 * écrite : rang d'administration exigé, motif et journal d'audit.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: jest.fn(() => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() })) },
}));
jest.mock('../../../../utils/sanitize', () => ({
  SecuritySanitizer: { sanitizeText: (t: string) => t, sanitizePlainText: (t: string) => t },
}));
jest.mock('../../../../services/notifications/community-added', () => ({
  scheduleCommunityAddedAnnouncement: jest.fn(),
}));
jest.mock('../../../../services/community-member-broadcast', () => ({
  ...jest.requireActual<object>('../../../../services/community-member-broadcast'),
  communityMemberAnnouncerFrom: () => () => undefined,
}));
jest.mock('../../../../services/community-updated-broadcast', () => ({
  scheduleCommunityUpdatedBroadcastFrom: jest.fn(),
}));
jest.mock('../../../../services/conversations/communitySalonAdoption', () => ({
  ...jest.requireActual<object>('../../../../services/conversations/communitySalonAdoption'),
  closeSalonsAfterSwitch: jest.fn(async () => undefined),
}));

import { registerSettingsRoutes } from '../../../../routes/communities/settings';
import { closeSalonsAfterSwitch } from '../../../../services/conversations/communitySalonAdoption';
import { COMMUNITY_ADDITION_BUDGET, COMMUNITY_ADDITION_BUDGET_CODE } from '../../../../utils/community-addition-budget';

const CREATEUR = '507f1f77bcf86cd7994300c0';
const COMMUNITY = '507f1f77bcf86cd799430033';
const SALON = '507f1f77bcf86cd799430055';
const ANCIEN = '507f1f77bcf86cd799430077';
const MORT = 'dead00000000000000000000';
const personne = (n: number) => `a1${n.toString(16).padStart(22, '0')}`;
const range = (from: number, count: number) => Array.from({ length: count }, (_, i) => personne(from + i));

function prismaDouble(occupants: readonly string[]) {
  const row = {
    id: COMMUNITY,
    identifier: 'mshy_club',
    name: 'Club',
    description: null,
    avatar: null,
    banner: null,
    isPrivate: false,
    isActive: true,
    deletedAt: null,
    createdBy: CREATEUR,
    createdAt: new Date('2026-01-10T08:00:00.000Z'),
    updatedAt: new Date('2026-09-01T08:00:00.000Z'),
    creator: { id: CREATEUR, username: 'awa', displayName: 'Awa', avatar: null },
    _count: { members: 2, Conversation: 1 },
  };
  return {
    community: {
      findFirst: jest.fn<any>(async () => row),
      findUnique: jest.fn<any>(async () => row),
      update: jest.fn<any>(async () => row),
    },
    conversation: { findMany: jest.fn<any>(async () => [{ id: SALON }]) },
    participant: {
      findMany: jest.fn<any>(async () =>
        [CREATEUR, ...occupants].map((userId) => ({ userId, isActive: true, bannedAt: null })),
      ),
    },
    communityMember: {
      findMany: jest.fn<any>(async (args: any) =>
        (args.where.userId.in as string[]).includes(ANCIEN) ? [{ id: 'old', userId: ANCIEN, isActive: false }] : [],
      ),
      createMany: jest.fn<any>(async (args: any) => ({ count: args.data.length })),
      updateMany: jest.fn<any>(async () => ({ count: 0 })),
    },
    communityJoinRequest: { updateMany: jest.fn<any>(async () => ({ count: 0 })) },
    user: {
      findMany: jest.fn<any>(async (args: any) => {
        if (args.where.blockedUserIds) return [];
        return (args.where.id.in as string[]).filter((id) => id !== MORT).map((id) => ({ id }));
      }),
      findUnique: jest.fn<any>(async () => ({ blockedUserIds: [] })),
    },
  };
}

const apps: FastifyInstance[] = [];

async function build(prisma: ReturnType<typeof prismaDouble>) {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma as never);
  app.decorate('socketIOHandler', null as never);
  app.decorate('authenticate', async (req: any) => {
    req.authContext = { isAuthenticated: true, userId: CREATEUR, registeredUser: { id: CREATEUR } };
  });
  await app.register(registerSettingsRoutes);
  await app.ready();
  apps.push(app);
  return app;
}

const goPrivate = (app: FastifyInstance) =>
  app.inject({ method: 'PUT', url: `/communities/${COMMUNITY}`, payload: { isPrivate: true } });

afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
});

describe('PUT /communities/:id — passer en privée paie le budget des ajouts (#20694)', () => {
  it('au-delà du plafond horaire : 429 nommé, ni membre écrit ni bascule', async () => {
    const prisma = prismaDouble(range(0, COMMUNITY_ADDITION_BUDGET.actorPerHour + 1));
    const app = await build(prisma);

    const res = await goPrivate(app);

    expect(res.statusCode).toBe(429);
    expect(res.json()).toMatchObject({ success: false, code: COMMUNITY_ADDITION_BUDGET_CODE });
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    expect(prisma.communityMember.createMany).not.toHaveBeenCalled();
    expect(prisma.community.update).not.toHaveBeenCalled();
  });

  it('au plafond, la bascule passe et fait entrer les occupants ; un geste de plus est refusé', async () => {
    const prisma = prismaDouble(range(0, COMMUNITY_ADDITION_BUDGET.actorPerHour));
    const app = await build(prisma);

    expect((await goPrivate(app)).statusCode).toBe(200);
    expect(prisma.communityMember.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.community.update).toHaveBeenCalledTimes(1);

    prisma.participant.findMany.mockResolvedValueOnce([{ userId: personne(999), isActive: true, bannedAt: null }]);
    expect((await goPrivate(app)).statusCode).toBe(429);
  });

  it('un ancien membre (qui ne revient pas) et un compte non ajoutable (qui sort) ne coûtent rien', async () => {
    const prisma = prismaDouble([...range(0, COMMUNITY_ADDITION_BUDGET.actorPerHour), ANCIEN, MORT]);
    const app = await build(prisma);

    expect((await goPrivate(app)).statusCode).toBe(200);
    const written = (prisma.communityMember.createMany.mock.calls[0][0] as any).data.map((d: any) => d.userId);
    expect(written).toHaveLength(COMMUNITY_ADDITION_BUDGET.actorPerHour);
    expect(written).not.toContain(ANCIEN);
    expect(written).not.toContain(MORT);
  });

  it('la seconde passe reçoit le MÊME budget que la première (ses témoins : community-salon-adoption)', async () => {
    const app = await build(prismaDouble([]));
    expect((await goPrivate(app)).statusCode).toBe(200);
    expect(closeSalonsAfterSwitch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ communityId: COMMUNITY, spend: expect.any(Function) }),
    );
  });

  it('une bascule sans occupant à faire entrer ne débite rien', async () => {
    const prisma = prismaDouble([]);
    const app = await build(prisma);
    for (let i = 0; i <= COMMUNITY_ADDITION_BUDGET.actorPerHour; i += 1) {
      expect((await goPrivate(app)).statusCode).toBe(200);
    }
  });
});
