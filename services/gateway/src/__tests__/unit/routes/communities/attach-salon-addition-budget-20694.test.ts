/**
 * #20694 — rattacher une conversation existante à une communauté PRIVÉE
 * (`POST /communities/:id/conversations/:conversationId`) fait de ses
 * participants des membres, sans leur accord (#16703). C'est la loi de
 * `POST …/invite`, donc son BUDGET (#19812, #20464). Jusqu'ici le
 * rattachement ne débitait rien : un groupe de 250 personnes, créé hors de
 * toute communauté, entrait d'un geste dans une communauté privée.
 *
 * Témoins : l'acteur paie le nombre d'ENTRANTS (un membre déjà actif ne coûte
 * rien) ; au-delà, 429 nommé sans ligne de membre ni rattachement ; une
 * tentative vers un compte non ajoutable se paie ; une communauté PUBLIQUE ne
 * fait entrer personne, donc ne débite rien.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';

jest.mock('../../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));

jest.mock('../../../../routes/communities/member-presence', () => ({
  gateConversationParticipantsPresence: jest.fn(async (_p: unknown, _v: unknown, rows: unknown[]) => rows),
}));

jest.mock('../../../../routes/users/presence-gate', () => ({
  viewerFromRequest: () => null,
}));

jest.mock('../../../../services/community-member-broadcast', () => ({
  ...jest.requireActual<object>('../../../../services/community-member-broadcast'),
  communityMemberAnnouncerFrom: () => () => undefined,
}));

import { registerCoreRoutes } from '../../../../routes/communities/core';
import { COMMUNITY_ADDITION_BUDGET, COMMUNITY_ADDITION_BUDGET_CODE } from '../../../../utils/community-addition-budget';

const CREATEUR = '507f1f77bcf86cd799439011';
const COMMUNAUTE = '507f1f77bcf86cd7994390aa';
const CONVERSATION = '507f1f77bcf86cd7994390bb';
const personne = (n: number) => `a1${n.toString(16).padStart(22, '0')}`;
const MORT = 'dead00000000000000000000';

type Monde = {
  readonly isPrivate: boolean;
  readonly participants: readonly string[];
  readonly membresActifs?: readonly string[];
};

function prismaDouble(monde: Monde) {
  const membres = monde.membresActifs ?? [];
  return {
    community: {
      findFirst: jest.fn<any>(async () => ({ id: COMMUNAUTE, createdBy: CREATEUR, isPrivate: monde.isPrivate, members: [] })),
    },
    conversation: {
      findFirst: jest.fn<any>(async () => ({
        id: CONVERSATION,
        type: 'group',
        encryptionMode: null,
        communityId: null,
        participants: [
          { userId: CREATEUR, role: 'admin', isActive: true, bannedAt: null },
          ...monde.participants.map((userId) => ({ userId, role: 'member', isActive: true, bannedAt: null })),
        ],
      })),
      update: jest.fn<any>(async () => ({
        id: CONVERSATION,
        communityId: COMMUNAUTE,
        participants: [],
        _count: { messages: 0, participants: monde.participants.length + 1 },
      })),
    },
    communityMember: {
      findMany: jest.fn<any>(async () =>
        membres.map((userId, i) => ({ id: `row${i}`, userId, isActive: true })),
      ),
      createMany: jest.fn<any>(async (args: any) => ({ count: args.data.length })),
      updateMany: jest.fn<any>(async () => ({ count: 0 })),
    },
    communityJoinRequest: { updateMany: jest.fn<any>(async () => ({ count: 0 })) },
    user: {
      findMany: jest.fn<any>(async (args: any) =>
        (args.where.id.in as string[]).filter((id) => id !== MORT).map((id) => ({ id })),
      ),
      findFirst: jest.fn<any>(async () => null),
    },
  };
}

const apps: FastifyInstance[] = [];

async function build(prisma: ReturnType<typeof prismaDouble>) {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: unknown) => {
    (req as { authContext: unknown }).authContext = {
      isAuthenticated: true,
      userId: CREATEUR,
      registeredUser: { id: CREATEUR, role: 'USER' },
    };
  });
  app.decorate('prisma', prisma as never);
  await app.register(registerCoreRoutes);
  await app.ready();
  apps.push(app);
  return app;
}

const attach = (app: FastifyInstance) =>
  app.inject({ method: 'POST', url: `/communities/${COMMUNAUTE}/conversations/${CONVERSATION}` });

const range = (from: number, count: number) => Array.from({ length: count }, (_, i) => personne(from + i));

afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
});

describe('POST /communities/:id/conversations/:conversationId — le rattachement paie le budget des ajouts (#20694)', () => {
  it('au-delà du plafond horaire de l’acteur : 429 nommé, ni membre écrit ni salon rattaché', async () => {
    const prisma = prismaDouble({ isPrivate: true, participants: range(0, COMMUNITY_ADDITION_BUDGET.actorPerHour + 1) });
    const app = await build(prisma);

    const res = await attach(app);

    expect(res.statusCode).toBe(429);
    expect(res.json()).toMatchObject({ success: false, code: COMMUNITY_ADDITION_BUDGET_CODE });
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    expect(prisma.communityMember.createMany).not.toHaveBeenCalled();
    expect(prisma.conversation.update).not.toHaveBeenCalled();
  });

  it('au plafond, le rattachement passe ; le geste suivant, même d’une personne, est refusé', async () => {
    const prisma = prismaDouble({ isPrivate: true, participants: range(0, COMMUNITY_ADDITION_BUDGET.actorPerHour) });
    const app = await build(prisma);

    expect((await attach(app)).statusCode).toBe(200);
    expect(prisma.communityMember.createMany).toHaveBeenCalledTimes(1);

    prisma.conversation.findFirst.mockResolvedValueOnce({
      id: CONVERSATION,
      type: 'group',
      encryptionMode: null,
      communityId: null,
      participants: [
        { userId: CREATEUR, role: 'admin', isActive: true, bannedAt: null },
        { userId: personne(500), role: 'member', isActive: true, bannedAt: null },
      ],
    });
    expect((await attach(app)).statusCode).toBe(429);
  });

  it('un participant déjà membre actif ne coûte rien', async () => {
    const deja = range(0, COMMUNITY_ADDITION_BUDGET.actorPerHour);
    const prisma = prismaDouble({ isPrivate: true, participants: [...deja, personne(900)], membresActifs: deja });
    const app = await build(prisma);

    expect((await attach(app)).statusCode).toBe(200);
    expect(prisma.communityMember.createMany).toHaveBeenCalledWith({
      data: [{ communityId: COMMUNAUTE, userId: personne(900), role: 'member' }],
    });
  });

  it('une tentative vers un compte non ajoutable se paie : la porte n’est pas un sondage gratuit', async () => {
    const prisma = prismaDouble({ isPrivate: true, participants: [...range(0, COMMUNITY_ADDITION_BUDGET.actorPerHour - 1), MORT] });
    const app = await build(prisma);

    const refused = await attach(app);
    expect(refused.statusCode).toBe(403);
    expect(refused.json()).toMatchObject({ code: 'COMMUNITY_PARTICIPANT_NOT_ADDABLE' });

    prisma.conversation.findFirst.mockResolvedValueOnce({
      id: CONVERSATION,
      type: 'group',
      encryptionMode: null,
      communityId: null,
      participants: [
        { userId: CREATEUR, role: 'admin', isActive: true, bannedAt: null },
        ...range(100, COMMUNITY_ADDITION_BUDGET.actorPerHour).map((userId) => ({ userId, role: 'member', isActive: true, bannedAt: null })),
      ],
    });
    expect((await attach(app)).statusCode).toBe(429);
  });

  it('une communauté PUBLIQUE ne fait entrer personne : rien n’est débité', async () => {
    const prisma = prismaDouble({ isPrivate: false, participants: range(0, COMMUNITY_ADDITION_BUDGET.actorPerDay + 50) });
    const app = await build(prisma);

    expect((await attach(app)).statusCode).toBe(200);
    expect((await attach(app)).statusCode).toBe(200);
    expect(prisma.communityMember.createMany).not.toHaveBeenCalled();
  });
});
