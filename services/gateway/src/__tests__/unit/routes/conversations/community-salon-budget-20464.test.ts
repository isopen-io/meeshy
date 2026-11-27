/**
 * #20464 — créer un salon dans une communauté y fait entrer ses participants
 * SANS leur accord (#16639) : c'est la loi de `POST /communities/:id/invite`,
 * et elle tombe désormais sous le même budget (#19812).
 *
 * Témoins : l'acteur paie une unité par personne qui ENTRE (un participant
 * déjà membre actif ne coûte rien), avant la porte `isAddableUser` ; chaque
 * personne qui entre débite son propre seau, tous acteurs confondus, et le
 * seau d'une PAIRE (acteur, personne) borne ce qu'un seul acteur peut en
 * prendre ; un 429 ne crée ni conversation ni ligne de membre ; Redis en
 * panne laisse passer (fail-open écrit).
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

jest.mock('../../../../utils/response', () => ({
  ...jest.requireActual<object>('../../../../utils/response'),
  sendSuccess: jest.fn<any>((reply: any) => reply),
  sendForbidden: jest.fn<any>((reply: any) => reply),
  sendNotFound: jest.fn<any>((reply: any) => reply),
  sendInternalError: jest.fn<any>((reply: any) => reply),
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
import { sendNotFound } from '../../../../utils/response';
import {
  COMMUNITY_ADDITION_BUDGET,
  COMMUNITY_ADDITION_BUDGET_CODE,
} from '../../../../utils/community-addition-budget';

const CONV_ID = '507f1f77bcf86cd799439011';
const COMMUNITY = '507f1f77bcf86cd799439044';
const CREATOR = '507f1f77bcf86cd799439022';

const idOf = (prefix: string, n: number) => `${prefix}${n.toString(16).padStart(24 - prefix.length, '0')}`;
const person = (n: number) => idOf('a1', n);
const actor = (n: number) => idOf('b2', n);
const unknown = (n: number) => idOf('c3', n);
const range = (from: number, count: number) => Array.from({ length: count }, (_, i) => from + i);

type Options = { readonly members?: readonly string[]; readonly redis?: unknown };

function prismaDouble(members: ReadonlySet<string>) {
  return {
    community: {
      findFirst: jest.fn<any>(async (args: any) => {
        const relation = args?.select?.members;
        const userId = relation?.where?.userId;
        return { id: COMMUNITY, createdBy: CREATOR, isPrivate: false, members: members.has(userId) ? [{ userId, role: 'member' }] : [] };
      }),
    },
    communityMember: {
      findMany: jest.fn<any>(async (args: any) => (args.where.userId.in as string[])
        .filter((id) => members.has(id))
        .map((userId) => ({ id: `cm-${userId}`, userId, isActive: true }))),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
      createMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
      create: jest.fn<any>().mockResolvedValue({}),
      update: jest.fn<any>().mockResolvedValue({}),
    },
    communityJoinRequest: { updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }), findMany: jest.fn<any>().mockResolvedValue([]) },
    conversation: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      create: jest.fn<any>(async () => ({ id: CONV_ID, type: 'group', title: 'Salon', createdAt: new Date(), participants: [] })),
      update: jest.fn<any>().mockResolvedValue({ id: CONV_ID }),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    participant: { findMany: jest.fn<any>().mockResolvedValue([]) },
    user: {
      findMany: jest.fn<any>(async (args: any) => (args.where?.id?.in ?? [])
        .filter((id: string) => !id.startsWith('c3'))
        .map((id: string) => ({ id }))),
      findFirst: jest.fn<any>().mockResolvedValue(null),
    },
  };
}

function replyDouble() {
  const reply: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    status: jest.fn<any>((code: number) => { reply.statusCode = code; return reply; }),
    code: jest.fn<any>((code: number) => { reply.statusCode = code; return reply; }),
    header: jest.fn<any>((name: string, value: string) => { reply.headers[name.toLowerCase()] = value; return reply; }),
    send: jest.fn<any>((body: unknown) => { reply.body = body; return reply; }),
  };
  return reply;
}

function build(options: Options = {}) {
  const members = new Set<string>(options.members ?? []);
  const prisma = prismaDouble(members);
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
  const create = async (by: string, participantIds: readonly string[]) => {
    members.add(by);
    const reply = replyDouble();
    await handler(
      {
        body: { type: 'group', title: 'Salon', participantIds, communityId: COMMUNITY },
        params: {}, query: {}, headers: {},
        authContext: { type: 'user', isAuthenticated: true, isAnonymous: false, userId: by, registeredUser: { id: by, role: 'USER' } },
        user: { userId: by },
      },
      reply,
    );
    return reply;
  };
  return { prisma, create };
}

const refusedForBudget = (reply: any) =>
  reply.statusCode === 429 && (reply.body as { code?: string })?.code === COMMUNITY_ADDITION_BUDGET_CODE;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('#20464 — créer un salon dans une communauté : budget de l’ACTEUR', () => {
  it('paie une unité par personne qui ENTRE : le plafond horaire passe, la personne de trop est refusée en 429', async () => {
    const h = build();
    const first = await h.create(actor(1), range(0, COMMUNITY_ADDITION_BUDGET.actorPerHour).map(person));
    expect(first.statusCode).not.toBe(429);
    expect(h.prisma.conversation.create).toHaveBeenCalledTimes(1);

    const second = await h.create(actor(1), [person(500)]);
    expect(refusedForBudget(second)).toBe(true);
    expect(Number(second.headers['retry-after'])).toBeGreaterThan(0);
    expect(h.prisma.conversation.create).toHaveBeenCalledTimes(1);
  });

  it('refuse d’un coup un salon qui ferait entrer plus que le plafond, sans rien créer ni écrire', async () => {
    const h = build();
    const reply = await h.create(actor(2), range(0, COMMUNITY_ADDITION_BUDGET.actorPerHour + 1).map(person));
    expect(refusedForBudget(reply)).toBe(true);
    expect(h.prisma.conversation.create).not.toHaveBeenCalled();
    expect(h.prisma.communityMember.createMany).not.toHaveBeenCalled();
    expect(h.prisma.communityMember.updateMany).not.toHaveBeenCalled();
  });

  it('ne fait rien payer pour un participant déjà membre ACTIF : il n’entre pas', async () => {
    const already = range(0, COMMUNITY_ADDITION_BUDGET.actorPerHour * 2).map(person);
    const h = build({ members: already });
    const reply = await h.create(actor(3), already);
    expect(reply.statusCode).not.toBe(429);
    expect(h.prisma.conversation.create).toHaveBeenCalledTimes(1);
  });

  it('compte une tentative vers des comptes NON ajoutables : la porte n’est pas un sondage gratuit', async () => {
    const h = build();
    await h.create(actor(4), range(0, COMMUNITY_ADDITION_BUDGET.actorPerHour).map(unknown));
    expect(sendNotFound).toHaveBeenCalledTimes(1);

    const reply = await h.create(actor(4), [person(1)]);
    expect(refusedForBudget(reply)).toBe(true);
    expect(h.prisma.conversation.create).not.toHaveBeenCalled();
  });
});

describe('#20464 — créer un salon dans une communauté : budget de la PERSONNE qui entre', () => {
  it('borne les entrées d’une même personne tous acteurs confondus', async () => {
    const victim = person(42);
    const h = build();
    for (const n of range(0, COMMUNITY_ADDITION_BUDGET.targetPerDay)) {
      expect((await h.create(actor(100 + n), [victim])).statusCode).not.toBe(429);
    }
    const reply = await h.create(actor(999), [victim, person(43)]);
    expect(refusedForBudget(reply)).toBe(true);
    expect(h.prisma.conversation.create).toHaveBeenCalledTimes(COMMUNITY_ADDITION_BUDGET.targetPerDay);
  });

  it('un lot refusé pour UNE personne ne coûte rien aux autres : leurs unités sont rendues', async () => {
    const victim = person(44);
    const bystander = person(45);
    const h = build();
    for (const n of range(0, COMMUNITY_ADDITION_BUDGET.targetPerDay)) await h.create(actor(200 + n), [victim]);
    for (const n of range(0, 3)) expect(refusedForBudget(await h.create(actor(300 + n), [victim, bystander]))).toBe(true);

    for (const n of range(0, COMMUNITY_ADDITION_BUDGET.targetPerDay)) {
      expect((await h.create(actor(400 + n), [bystander])).statusCode).not.toBe(429);
    }
  });

  it('un même acteur ne prend qu’une part du seau d’une personne : ajouter et retirer en boucle ne la sature pas', async () => {
    const victim = person(46);
    const h = build();
    for (const _ of range(0, COMMUNITY_ADDITION_BUDGET.pairPerDay)) {
      expect((await h.create(actor(7), [victim])).statusCode).not.toBe(429);
    }
    expect(refusedForBudget(await h.create(actor(7), [victim]))).toBe(true);

    for (const n of range(0, COMMUNITY_ADDITION_BUDGET.targetPerDay - COMMUNITY_ADDITION_BUDGET.pairPerDay)) {
      expect((await h.create(actor(500 + n), [victim])).statusCode).not.toBe(429);
    }
  });
});

describe('#20464 — Redis en panne', () => {
  it('laisse passer (fail-open) : un débit est une borne d’abus, pas une garde d’autorisation', async () => {
    const broken = new Proxy({}, { get: () => () => { throw new Error('redis down'); } });
    const h = build({ redis: broken });
    const reply = await h.create(actor(8), range(0, COMMUNITY_ADDITION_BUDGET.actorPerHour + 5).map(person));
    expect(reply.statusCode).not.toBe(429);
    expect(h.prisma.conversation.create).toHaveBeenCalledTimes(1);
  });
});
