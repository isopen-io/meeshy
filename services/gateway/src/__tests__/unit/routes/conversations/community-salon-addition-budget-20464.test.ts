/**
 * #20464 — créer un salon dans une communauté y fait entrer ses participants
 * sans leur accord : c'est la loi de `POST /communities/:id/invite` (#16639),
 * et c'est donc son BUDGET (#19812). Jusqu'ici `POST /conversations` ne
 * débitait rien : un membre d'une communauté publique y faisait entrer 250
 * personnes par requête.
 *
 * Témoins : le seau de l'acteur est débité au coût des ENTRANTS (un membre
 * déjà actif ne coûte rien) ; une tentative vers un compte non ajoutable
 * compte ; au-delà, 429 nommé sans créer de conversation ni de ligne de
 * membre ; le seau de chaque cible ; un refus d'autorisation ne débite rien ;
 * Redis en panne (`consume → null`) laisse passer (fail-open écrit).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../../services/messaging/messageRequests', () => ({
  ...jest.requireActual<object>('../../../../services/messaging/messageRequests'),
  decideOpenings: jest.fn(async () => new Map()),
  decideDirectOpening: jest.fn(async () => ({ kind: 'direct' })),
}));

jest.mock('../../../../routes/conversations/utils/identifier-generator', () => ({
  generateConversationIdentifier: jest.fn<any>().mockReturnValue('mshy_groupe'),
  generateCompactConversationIdentifier: jest.fn<any>().mockReturnValue('mshy_AbCdEfGhIjKl'),
  ensureUniqueConversationIdentifier: jest.fn<any>().mockResolvedValue('mshy_unique'),
}));

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn<any>().mockReturnValue({
      error: jest.fn<any>(), info: jest.fn<any>(), warn: jest.fn<any>(), debug: jest.fn<any>(),
    }),
  },
}));

jest.mock('../../../../services/EncryptionService', () => ({
  getEncryptionService: jest.fn(async () => ({ activationKeyId: async () => 'server-key' })),
}));

jest.mock('../../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: jest.fn<any>().mockReturnValue({
    resolveForTargets: jest.fn<any>().mockResolvedValue(new Map()),
  }),
}));

jest.mock('../../../../services/achievements/CerclesAchievements', () => ({
  CerclesAchievements: jest.fn<any>().mockImplementation(() => ({
    recordEvent: jest.fn<any>().mockResolvedValue(undefined),
  })),
}));

import { registerCreateConversationRoute } from '../../../../routes/conversations/core-lifecycle';
import * as rateLimiter from '../../../../utils/rate-limiter';
import {
  COMMUNITY_ADDITION_BUDGET,
  COMMUNITY_ADDITION_BUDGET_CODE,
} from '../../../../utils/community-addition-budget';

const CONV_ID = '507f1f77bcf86cd799439011';
const COMMUNITY = '507f1f77bcf86cd799439044';
const CREATEUR = '507f1f77bcf86cd799439099';

const idOf = (prefix: string, n: number) => `${prefix}${n.toString(16).padStart(24 - prefix.length, '0')}`;
const personne = (n: number) => idOf('a1', n);
const acteur = (n: number) => idOf('b2', n);

type Ligne = { readonly userId: string; readonly role: string; readonly isActive: boolean };

type Monde = {
  readonly lignes: Ligne[];
  readonly isPrivate: boolean;
  readonly morts: Set<string>;
};

function prismaDouble(monde: Monde) {
  const garde = (ligne: Ligne, where: Record<string, unknown> | undefined) =>
    !where || Object.entries(where).every(([k, v]) => (ligne as unknown as Record<string, unknown>)[k] === v);
  return {
    community: {
      findFirst: jest.fn<any>(async (args: any) => {
        const relation = args?.include?.members ?? args?.select?.members;
        const where = typeof relation === 'object' ? relation.where : undefined;
        return { id: COMMUNITY, createdBy: CREATEUR, isPrivate: monde.isPrivate, members: monde.lignes.filter((l) => garde(l, where)) };
      }),
    },
    communityMember: {
      findMany: jest.fn<any>(async (args: any) => monde.lignes
        .filter((l) => args.where.userId.in.includes(l.userId))
        .map((l) => ({ id: `cm-${l.userId}`, ...l }))),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
      createMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
      create: jest.fn<any>().mockResolvedValue({}),
      update: jest.fn<any>().mockResolvedValue({}),
    },
    conversation: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      create: jest.fn<any>(async () => ({ id: CONV_ID, type: 'group', title: 'Salon', createdAt: new Date(), participants: [] })),
      update: jest.fn<any>().mockResolvedValue({ id: CONV_ID }),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    participant: { findMany: jest.fn<any>().mockResolvedValue([]) },
    user: {
      findMany: jest.fn<any>(async (args: any) => (args.where?.id?.in ?? [])
        .filter((id: string) => !monde.morts.has(id))
        .map((id: string) => ({ id }))),
      findFirst: jest.fn<any>().mockResolvedValue(null),
    },
  };
}

function replyDouble() {
  const state: { status: number; body: any; headers: Record<string, string> } = { status: 200, body: undefined, headers: {} };
  const reply: any = {
    state,
    status: jest.fn<any>((s: number) => { state.status = s; return reply; }),
    code: jest.fn<any>((s: number) => { state.status = s; return reply; }),
    header: jest.fn<any>((k: string, v: string) => { state.headers[k] = v; return reply; }),
    send: jest.fn<any>((b: any) => { state.body = b; return reply; }),
  };
  return reply;
}

type Banc = {
  readonly prisma: ReturnType<typeof prismaDouble>;
  creer(actorId: string, participantIds: readonly string[]): Promise<{ status: number; body: any; headers: Record<string, string> }>;
};

function banc(options: { readonly isPrivate?: boolean; readonly morts?: readonly string[]; readonly lignes?: readonly Ligne[] } = {}): Banc {
  const monde: Monde = { lignes: [...(options.lignes ?? [])], isPrivate: options.isPrivate ?? false, morts: new Set(options.morts ?? []) };
  const prisma = prismaDouble(monde);
  let handler: any;
  const fastify: any = {
    server: {},
    post: jest.fn<any>((_path: string, _opts: any, h: any) => { handler = h; }),
    socketIOHandler: {
      getManager: jest.fn<any>().mockReturnValue({
        getIO: jest.fn<any>().mockReturnValue({ to: jest.fn<any>().mockReturnValue({ emit: jest.fn<any>() }) }),
        joinUserToConversationRoom: jest.fn<any>().mockResolvedValue(undefined),
      }),
    },
  };
  registerCreateConversationRoute(fastify, prisma as never, jest.fn<any>());
  return {
    prisma,
    async creer(actorId, participantIds) {
      if (!monde.lignes.some((l) => l.userId === actorId)) monde.lignes.push({ userId: actorId, role: 'member', isActive: true });
      const reply = replyDouble();
      await handler(
        {
          body: { type: 'group', title: 'Salon', participantIds, communityId: COMMUNITY },
          params: {}, query: {}, headers: {},
          authContext: {
            type: 'user', isAuthenticated: true, isAnonymous: false,
            userId: actorId, registeredUser: { id: actorId, role: 'USER' },
          },
          user: { userId: actorId },
        },
        reply,
      );
      return reply.state;
    },
  };
}

const personnes = (debut: number, n: number) => Array.from({ length: n }, (_, i) => personne(debut + i));

beforeEach(() => {
  jest.restoreAllMocks();
});

describe('#20464 — POST /conversations dans une communauté débite le budget des ajouts', () => {
  it('fait entrer jusqu’au plafond horaire, puis refuse en 429 nommé, sans créer ni salon ni membre', async () => {
    const b = banc();
    const moi = acteur(1);
    const premier = await b.creer(moi, personnes(0, COMMUNITY_ADDITION_BUDGET.actorPerHour));
    expect(premier.status).not.toBe(429);
    expect(b.prisma.conversation.create).toHaveBeenCalledTimes(1);

    b.prisma.conversation.create.mockClear();
    b.prisma.communityMember.createMany.mockClear();
    const refus = await b.creer(moi, [personne(900)]);
    expect(refus.status).toBe(429);
    expect(refus.body.code).toBe(COMMUNITY_ADDITION_BUDGET_CODE);
    expect(Number(refus.headers['Retry-After'])).toBeGreaterThan(0);
    expect(b.prisma.conversation.create).not.toHaveBeenCalled();
    expect(b.prisma.communityMember.createMany).not.toHaveBeenCalled();
    expect(b.prisma.communityMember.updateMany).not.toHaveBeenCalled();
  });

  it('refuse d’un coup une requête qui dépasse le seau : 250 personnes ne passent pas', async () => {
    const b = banc();
    const refus = await b.creer(acteur(2), personnes(0, 250));
    expect(refus.status).toBe(429);
    expect(b.prisma.conversation.create).not.toHaveBeenCalled();
    expect(b.prisma.communityMember.createMany).not.toHaveBeenCalled();
  });

  it('ne compte que les ENTRANTS : un participant déjà membre actif ne coûte rien', async () => {
    const membres = personnes(0, COMMUNITY_ADDITION_BUDGET.actorPerHour + 5);
    const b = banc({ lignes: membres.map((userId) => ({ userId, role: 'member', isActive: true })) });
    const moi = acteur(3);
    expect((await b.creer(moi, membres)).status).not.toBe(429);
    expect((await b.creer(moi, personnes(500, COMMUNITY_ADDITION_BUDGET.actorPerHour))).status).not.toBe(429);
  });

  it('deux salons partagent le seau de l’acteur : le second ne rouvre rien', async () => {
    const b = banc();
    const moi = acteur(4);
    await b.creer(moi, personnes(0, COMMUNITY_ADDITION_BUDGET.actorPerHour - 1));
    expect((await b.creer(moi, [personne(800)])).status).not.toBe(429);
    expect((await b.creer(moi, [personne(801)])).status).toBe(429);
  });

  it('compte une tentative vers un compte NON ajoutable : la porte n’est pas un sondage gratuit', async () => {
    const morts = personnes(0, COMMUNITY_ADDITION_BUDGET.actorPerHour);
    const b = banc({ morts });
    const moi = acteur(5);
    expect((await b.creer(moi, morts)).status).toBe(404);
    expect((await b.creer(moi, [personne(700)])).status).toBe(429);
  });

  it('ne débite rien sur un refus d’autorisation (communauté privée, simple membre)', async () => {
    const b = banc({ isPrivate: true });
    const moi = acteur(6);
    for (let i = 0; i < COMMUNITY_ADDITION_BUDGET.actorPerHour + 2; i += 1) {
      expect((await b.creer(moi, [personne(i)])).status).toBe(403);
    }
    expect((await b.creer(moi, [])).status).not.toBe(429);
  });

  it('débite le seau de chaque CIBLE : une personne n’entre pas dans plus de dix salons-communautés par jour', async () => {
    const b = banc();
    const victime = personne(42);
    for (let i = 0; i < COMMUNITY_ADDITION_BUDGET.targetPerDay; i += 1) {
      expect((await b.creer(acteur(100 + i), [victime])).status).not.toBe(429);
    }
    b.prisma.conversation.create.mockClear();
    const refus = await b.creer(acteur(200), [personne(43), victime]);
    expect(refus.status).toBe(429);
    expect(b.prisma.conversation.create).not.toHaveBeenCalled();
  });

  it('Redis en panne (`consume` rend null) : le salon se crée — fail-open écrit', async () => {
    jest.spyOn(rateLimiter, 'createCustomRateLimiter').mockReturnValue({
      consume: jest.fn<any>().mockResolvedValue(null),
    } as never);
    const b = banc();
    b.prisma.conversation.create.mockClear();
    expect((await b.creer(acteur(7), personnes(0, 250))).status).not.toBe(429);
    expect(b.prisma.conversation.create).toHaveBeenCalledTimes(1);
  });
});
