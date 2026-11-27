/**
 * #20464 — créer un salon dans une communauté y fait entrer ses participants
 * sans leur accord (`POST /conversations` avec `communityId`, jusqu'à 250
 * personnes par requête). C'est la loi de `POST …/invite`, et c'est désormais
 * son BUDGET (`utils/community-addition-budget.ts`, #19812) :
 *
 *  · l'acteur paie autant d'unités que de personnes qui ENTRENT, avant la
 *    porte « compte vivant » (pas de sondage gratuit), et un lot qui dépasse
 *    est refusé EN BLOC sans rien coûter ;
 *  · chaque entrant paie une unité sur son seau du jour, tous acteurs et
 *    toutes portes confondus, et un refus de l'un rend ce qu'ont payé les
 *    autres (tout ou rien) ;
 *  · une même paire (acteur, cible) ne passe que trois fois par jour : un
 *    administrateur qui ajoute puis retire la même personne ne vide plus le
 *    seau du jour de cette personne à lui seul.
 *
 * Le harnais est celui de `community-conversation-former-member.test.ts`, avec
 * le VRAI `utils/response` : un 429 se lit sur la réponse émise.
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
import {
  COMMUNITY_ADDITION_BUDGET,
  COMMUNITY_ADDITION_BUDGET_CODE,
} from '../../../../utils/community-addition-budget';

const CONV_ID = '507f1f77bcf86cd799439011';
const CREATOR = '507f1f77bcf86cd799439033';

const idOf = (prefix: string, n: number) => `${prefix}${n.toString(16).padStart(24 - prefix.length, '0')}`;
const targetId = (n: number) => idOf('a1', n);
const actorId = (n: number) => idOf('b2', n);
const communityId = (n: number) => idOf('c3', n);
const range = (from: number, count: number) => Array.from({ length: count }, (_, i) => from + i);

type Options = {
  readonly isPrivate?: boolean;
  readonly actorRole?: string;
  readonly living?: (id: string) => boolean;
};

function prismaDouble(options: Options = {}) {
  const living = options.living ?? (() => true);
  return {
    community: {
      findFirst: jest.fn<any>(async (args: any) => ({
        id: args?.where?.id,
        createdBy: CREATOR,
        isPrivate: options.isPrivate ?? false,
        members: [{ userId: 'self', role: options.actorRole ?? 'member', isActive: true }],
      })),
    },
    communityMember: {
      findMany: jest.fn<any>(async (args: any) => (args.where.userId.in as string[])
        .filter((id) => id.startsWith('b2'))
        .map((id) => ({ id: `cm-${id}`, userId: id, isActive: true }))),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
      createMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
      create: jest.fn<any>().mockResolvedValue({}),
      update: jest.fn<any>().mockResolvedValue({}),
    },
    communityJoinRequest: {
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    conversation: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      create: jest.fn<any>(async () => ({ id: CONV_ID, type: 'group', title: 'Salon', createdAt: new Date(), participants: [] })),
      update: jest.fn<any>().mockResolvedValue({ id: CONV_ID }),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    participant: { findMany: jest.fn<any>().mockResolvedValue([]) },
    user: {
      findMany: jest.fn<any>(async (args: any) => ((args.where?.id?.in ?? []) as string[])
        .filter((id) => living(id))
        .map((id) => ({ id }))),
      findFirst: jest.fn<any>().mockResolvedValue(null),
    },
  };
}

type Sent = { readonly statusCode: number; readonly body: any; readonly headers: Record<string, string> };

function replyDouble() {
  const state = { statusCode: 200, body: undefined as unknown, headers: {} as Record<string, string> };
  const reply: any = {
    status: jest.fn<any>((code: number) => { state.statusCode = code; return reply; }),
    code: jest.fn<any>((code: number) => { state.statusCode = code; return reply; }),
    header: jest.fn<any>((name: string, value: string) => { state.headers[name.toLowerCase()] = value; return reply; }),
    send: jest.fn<any>((body: unknown) => { state.body = body; return reply; }),
  };
  return { reply, sent: (): Sent => ({ ...state, body: state.body as any }) };
}

/** Un serveur : ses seaux (mémoire, sans Redis) vivent le temps du témoin. */
function server(options: Options & { readonly redis?: unknown } = {}) {
  const prisma = prismaDouble(options);
  let handler: any;
  const fastify: any = {
    redis: options.redis,
    post: jest.fn<any>((_path: string, _opts: any, h: any) => { handler = h; }),
    socketIOHandler: {
      getManager: jest.fn<any>().mockReturnValue({
        getIO: jest.fn<any>().mockReturnValue({ to: jest.fn<any>().mockReturnValue({ emit: jest.fn<any>() }) }),
        joinUserToConversationRoom: jest.fn<any>().mockResolvedValue(undefined),
      }),
    },
  };
  registerCreateConversationRoute(fastify, prisma as never, jest.fn<any>());

  async function createSalon(params: { readonly actor: string; readonly community?: string; readonly participants: readonly string[] }): Promise<Sent> {
    const { reply, sent } = replyDouble();
    await handler(
      {
        body: { type: 'group', title: 'Salon', participantIds: [...params.participants], communityId: params.community ?? communityId(1) },
        params: {}, query: {}, headers: {},
        authContext: {
          type: 'user', isAuthenticated: true, isAnonymous: false,
          userId: params.actor, registeredUser: { id: params.actor, role: 'USER' },
        },
        user: { userId: params.actor },
      },
      reply,
    );
    return sent();
  }

  return { prisma, createSalon };
}

const isBudgetRefusal = (sent: Sent) =>
  sent.statusCode === 429 && sent.body?.code === COMMUNITY_ADDITION_BUDGET_CODE;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('#20464 — le budget de l’ACTEUR compte chaque personne qui entre', () => {
  it('un salon de 250 personnes dans une communauté publique est refusé en 429, sans rien créer', async () => {
    const { prisma, createSalon } = server();
    const sent = await createSalon({ actor: actorId(1), participants: range(0, 250).map(targetId) });

    expect(isBudgetRefusal(sent)).toBe(true);
    expect(Number(sent.headers['retry-after'])).toBeGreaterThan(0);
    expect(prisma.conversation.create).not.toHaveBeenCalled();
    expect(prisma.communityMember.createMany).not.toHaveBeenCalled();
    expect(prisma.communityMember.updateMany).not.toHaveBeenCalled();
  });

  it('laisse passer exactement le plafond horaire en un salon — le témoin miroir', async () => {
    const { prisma, createSalon } = server();
    const sent = await createSalon({ actor: actorId(1), participants: range(0, COMMUNITY_ADDITION_BUDGET.actorPerHour).map(targetId) });

    expect(sent.statusCode).not.toBe(429);
    expect(prisma.conversation.create).toHaveBeenCalledTimes(1);
  });

  it('cumule d’un salon à l’autre : 20 puis 11 dépassent les 30 de l’heure', async () => {
    const { prisma, createSalon } = server();
    expect((await createSalon({ actor: actorId(1), participants: range(0, 20).map(targetId) })).statusCode).not.toBe(429);

    const sent = await createSalon({ actor: actorId(1), participants: range(100, 11).map(targetId) });
    expect(isBudgetRefusal(sent)).toBe(true);
    expect(prisma.conversation.create).toHaveBeenCalledTimes(1);
  });

  it('un lot refusé ne coûte rien : l’acteur garde son heure pour un salon raisonnable', async () => {
    const { createSalon } = server();
    expect(isBudgetRefusal(await createSalon({ actor: actorId(1), participants: range(0, 250).map(targetId) }))).toBe(true);

    const sent = await createSalon({ actor: actorId(1), participants: range(300, 10).map(targetId) });
    expect(sent.statusCode).not.toBe(429);
  });

  it('une tentative vers des comptes NON ajoutables coûte : la porte « compte vivant » n’est pas un sondage gratuit', async () => {
    const { createSalon } = server({ living: (id) => !id.startsWith('a1') });
    expect((await createSalon({ actor: actorId(1), participants: range(0, 30).map(targetId) })).statusCode).toBe(404);

    expect(isBudgetRefusal(await createSalon({ actor: actorId(1), participants: [actorId(9), targetId(500)] }))).toBe(true);
  });

  it('partage le seau de POST …/invite : un participant déjà membre ne coûte rien, seul l’entrant compte', async () => {
    const { createSalon } = server();
    const members = range(0, 40).map(actorId);
    const sent = await createSalon({ actor: actorId(999), participants: [...members, targetId(1)] });

    expect(sent.statusCode).not.toBe(429);
  });

  it('un refus d’autorisation passe AVANT le budget, inchangé, et ne débite rien', async () => {
    const { createSalon } = server({ isPrivate: true, actorRole: 'member' });
    const refused = await createSalon({ actor: actorId(1), participants: range(0, 250).map(targetId) });
    expect(refused.statusCode).toBe(403);
    expect(refused.body?.code).toBe('COMMUNITY_INVITE_FORBIDDEN');
  });

  it('Redis en panne : le geste passe (fail-open écrit), les refus d’accès restent en amont', async () => {
    const broken = new Proxy({}, { get: () => () => { throw new Error('redis down'); } });
    const { prisma, createSalon } = server({ redis: broken });
    const sent = await createSalon({ actor: actorId(1), participants: range(0, 250).map(targetId) });

    expect(sent.statusCode).not.toBe(429);
    expect(prisma.conversation.create).toHaveBeenCalledTimes(1);
  });
});

describe('#20464 — le budget de la CIBLE, tous acteurs et toutes portes confondus', () => {
  it('la même personne n’entre pas dans plus de dix communautés par jour par des salons', async () => {
    const { createSalon } = server();
    const victim = targetId(42);
    for (const i of range(0, COMMUNITY_ADDITION_BUDGET.targetPerDay)) {
      const sent = await createSalon({ actor: actorId(i), community: communityId(i), participants: [victim] });
      expect(sent.statusCode).not.toBe(429);
    }

    expect(isBudgetRefusal(await createSalon({ actor: actorId(500), community: communityId(500), participants: [victim] }))).toBe(true);
  });

  it('tout ou rien : un entrant saturé refuse le salon et rend ce que les autres avaient payé', async () => {
    const { prisma, createSalon } = server();
    const saturated = targetId(1);
    const spared = targetId(2);
    for (const i of range(0, COMMUNITY_ADDITION_BUDGET.targetPerDay)) {
      await createSalon({ actor: actorId(i), community: communityId(i), participants: [saturated] });
    }
    const creations = prisma.conversation.create.mock.calls.length;

    expect(isBudgetRefusal(await createSalon({ actor: actorId(100), community: communityId(100), participants: [spared, saturated] }))).toBe(true);
    expect(prisma.conversation.create.mock.calls.length).toBe(creations);

    for (const i of range(200, COMMUNITY_ADDITION_BUDGET.targetPerDay)) {
      const sent = await createSalon({ actor: actorId(i), community: communityId(i), participants: [spared] });
      expect(sent.statusCode).not.toBe(429);
    }
  });

  it('une même paire (acteur, cible) ne passe que trois fois par jour : un seul acteur ne vide pas le seau de sa cible', async () => {
    const { createSalon } = server();
    const victim = targetId(7);
    for (const i of range(0, COMMUNITY_ADDITION_BUDGET.pairPerDay)) {
      expect((await createSalon({ actor: actorId(1), community: communityId(i), participants: [victim] })).statusCode).not.toBe(429);
    }
    expect(isBudgetRefusal(await createSalon({ actor: actorId(1), community: communityId(50), participants: [victim] }))).toBe(true);

    const remaining = COMMUNITY_ADDITION_BUDGET.targetPerDay - COMMUNITY_ADDITION_BUDGET.pairPerDay;
    for (const i of range(100, remaining)) {
      expect((await createSalon({ actor: actorId(i), community: communityId(i), participants: [victim] })).statusCode).not.toBe(429);
    }
  });
});
