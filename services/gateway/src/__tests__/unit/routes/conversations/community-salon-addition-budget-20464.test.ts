/**
 * #20464 — créer un salon dans une communauté y fait ENTRER ses participants
 * sans leur accord : jusqu'à 250 personnes par requête, sans aucun débit. Le
 * geste débite désormais le budget de `POST /communities/:id/invite` et
 * `…/members` (#19812) : une unité par personne qui ENTRE à l'acteur, une à
 * chacune, tout ou rien, avant toute écriture.
 *
 * Témoins : le plafond horaire de l'acteur ; un lot trop gros refusé sans rien
 * écrire et sans fermer la journée de l'acteur ; un membre déjà actif ne coûte
 * rien ; le plafond d'une personne tous salons confondus ; un lot refusé rend
 * ce qu'il avait pris aux autres ; sonder un compte non ajoutable coûte ; le
 * magasin en panne laisse passer (fail-open écrit).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

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
  sendSuccess: jest.fn<any>((reply: any) => { reply.statusCode = 200; return reply; }),
  sendForbidden: jest.fn<any>((reply: any) => { reply.statusCode = 403; return reply; }),
  sendNotFound: jest.fn<any>((reply: any) => { reply.statusCode = 404; return reply; }),
  sendInternalError: jest.fn<any>((reply: any) => { reply.statusCode = 500; return reply; }),
  sendError: jest.fn<any>((reply: any, status: number, _error: string, extra: any) => {
    reply.statusCode = status;
    reply.code = extra?.code;
    return reply;
  }),
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
import { COMMUNITY_ADDITION_BUDGET, COMMUNITY_ADDITION_BUDGET_CODE } from '../../../../utils/community-addition-budget';
import { RateLimiter } from '../../../../utils/rate-limiter';

const CONV_ID = '507f1f77bcf86cd799439011';
const MOI = '507f1f77bcf86cd799439022';
const CREATEUR = '507f1f77bcf86cd799439033';

const idOf = (prefix: string, n: number) => `${prefix}${n.toString(16).padStart(24 - prefix.length, '0')}`;
const personne = (n: number) => idOf('a1', n);
const communaute = (n: number) => idOf('d4', n);
const acteur = (n: number) => idOf('b2', n);
const range = (from: number, count: number) => Array.from({ length: count }, (_, i) => from + i);

type Monde = {
  /** Membres ACTIFS de chaque communauté, en plus de l'appelant. */
  readonly membresActifs?: readonly string[];
  /** Comptes vivants ; absent = tout le monde l'est. */
  readonly vivants?: readonly string[];
};

function prismaDouble(monde: Monde, appelant: () => string) {
  return {
    community: {
      findFirst: jest.fn<any>(async (args: any) => ({
        id: args.where.id,
        createdBy: CREATEUR,
        isPrivate: false,
        members: [{ userId: appelant(), role: 'member' }],
      })),
    },
    communityMember: {
      findMany: jest.fn<any>(async (args: any) => (args.where.userId.in as string[])
        .filter((id) => id === appelant() || (monde.membresActifs ?? []).includes(id))
        .map((id) => ({ id: `cm-${id}`, userId: id, isActive: true }))),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
      createMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
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
        .filter((id: string) => monde.vivants === undefined || monde.vivants.includes(id))
        .map((id: string) => ({ id }))),
      findFirst: jest.fn<any>().mockResolvedValue(null),
    },
  };
}

type Reponse = { statusCode?: number; code?: string; headers: Record<string, string> };

function replyDouble(): Reponse & Record<string, unknown> {
  const reply: any = { headers: {} };
  reply.status = jest.fn<any>((s: number) => { reply.statusCode = s; return reply; });
  reply.header = jest.fn<any>((k: string, v: string) => { reply.headers[k] = v; return reply; });
  reply.send = jest.fn<any>(() => reply);
  return reply;
}

function monde(options: Monde = {}) {
  const etat = { appelant: MOI };
  const prisma = prismaDouble(options, () => etat.appelant);
  let handler: any;
  const fastify: any = {
    post: jest.fn<any>((_path: string, _opts: any, h: any) => { handler = h; }),
    socketIOHandler: {
      getManager: jest.fn<any>().mockReturnValue({
        getIO: jest.fn<any>().mockReturnValue({ to: jest.fn<any>().mockReturnValue({ emit: jest.fn<any>() }) }),
        joinUserToConversationRoom: jest.fn<any>().mockResolvedValue(undefined),
      }),
    },
  };
  registerCreateConversationRoute(fastify, prisma as never, jest.fn<any>());
  const creer = async (participantIds: readonly string[], communityId = communaute(0)): Promise<Reponse> => {
    const reply = replyDouble();
    await handler(
      {
        body: { type: 'group', title: 'Salon', participantIds, communityId },
        params: {}, query: {}, headers: {},
        authContext: {
          type: 'user', isAuthenticated: true, isAnonymous: false,
          userId: etat.appelant, registeredUser: { id: etat.appelant, role: 'USER' },
        },
        user: { userId: etat.appelant },
      },
      reply,
    );
    return reply;
  };
  return { prisma, creer, en: (id: string) => { etat.appelant = id; } };
}

const ids = (nums: readonly number[]) => nums.map(personne);

beforeEach(() => jest.clearAllMocks());
afterEach(() => jest.restoreAllMocks());

describe('#20464 — créer un salon dans une communauté débite le budget de l’ACTEUR', () => {
  it('un lot plus grand que le plafond horaire est refusé en 429 nommé, sans rien créer ni faire entrer', async () => {
    const m = monde();
    const r = await m.creer(ids(range(0, COMMUNITY_ADDITION_BUDGET.actorPerHour + 1)));

    expect(r.statusCode).toBe(429);
    expect(r.code).toBe(COMMUNITY_ADDITION_BUDGET_CODE);
    expect(Number(r.headers['Retry-After'])).toBeGreaterThan(0);
    expect(m.prisma.conversation.create).not.toHaveBeenCalled();
    expect(m.prisma.communityMember.createMany).not.toHaveBeenCalled();
    expect(m.prisma.communityMember.updateMany).not.toHaveBeenCalled();
  });

  it('un lot refusé ne coûte qu’UNE tentative : il ne ferme pas la journée de l’acteur', async () => {
    const m = monde();
    expect((await m.creer(ids(range(0, 250)))).statusCode).toBe(429);
    const r = await m.creer(ids(range(300, COMMUNITY_ADDITION_BUDGET.actorPerHour - 1)));
    expect(r.statusCode).not.toBe(429);
    expect(m.prisma.conversation.create).toHaveBeenCalledTimes(1);
  });

  it('compte chaque personne qui ENTRE : 30 en un salon, puis une de plus est refusée', async () => {
    const m = monde();
    expect((await m.creer(ids(range(0, COMMUNITY_ADDITION_BUDGET.actorPerHour)))).statusCode).not.toBe(429);
    const r = await m.creer([personne(999)], communaute(1));
    expect(r.statusCode).toBe(429);
    expect(m.prisma.conversation.create).toHaveBeenCalledTimes(1);
  });

  it('un membre déjà ACTIF n’entre pas, donc ne coûte rien', async () => {
    const membres = ids(range(0, 80));
    const m = monde({ membresActifs: membres });
    const r = await m.creer(membres);
    expect(r.statusCode).toBe(200);
    expect(m.prisma.conversation.create).toHaveBeenCalledTimes(1);
    expect((await m.creer(ids(range(500, COMMUNITY_ADDITION_BUDGET.actorPerHour)))).statusCode).not.toBe(429);
  });

  it('sonder un compte NON ajoutable coûte une unité : la porte n’est pas un sondage gratuit', async () => {
    const m = monde({ vivants: [] });
    const codes: number[] = [];
    for (const n of range(0, COMMUNITY_ADDITION_BUDGET.actorPerHour + 1)) {
      codes.push((await m.creer([personne(n)])).statusCode ?? 0);
    }
    expect(codes.slice(0, COMMUNITY_ADDITION_BUDGET.actorPerHour).every((c) => c === 404)).toBe(true);
    expect(codes[COMMUNITY_ADDITION_BUDGET.actorPerHour]).toBe(429);
    expect(m.prisma.conversation.create).not.toHaveBeenCalled();
  });

  it('magasin en panne : le geste passe (fail-open écrit, comme les autres budgets)', async () => {
    jest.spyOn(RateLimiter.prototype, 'consume').mockResolvedValue(null);
    const m = monde();
    expect((await m.creer(ids(range(0, 250)))).statusCode).not.toBe(429);
    expect(m.prisma.conversation.create).toHaveBeenCalledTimes(1);
  });
});

describe('#20464 — créer un salon débite le budget de chaque personne qui ENTRE', () => {
  it('une personne ne peut être ajoutée qu’à dix communautés par jour, tous acteurs et tous salons confondus', async () => {
    const m = monde();
    const victime = personne(42);
    for (const n of range(0, COMMUNITY_ADDITION_BUDGET.targetPerDay)) {
      m.en(acteur(n));
      expect((await m.creer([victime], communaute(n))).statusCode).not.toBe(429);
    }
    m.en(acteur(500));
    const r = await m.creer([victime], communaute(500));
    expect(r.statusCode).toBe(429);
    expect(m.prisma.conversation.create).toHaveBeenCalledTimes(COMMUNITY_ADDITION_BUDGET.targetPerDay);
  });

  it('un salon refusé pour UNE personne rend aux autres ce qu’il leur avait pris', async () => {
    const m = monde();
    const victime = personne(42);
    const voisine = personne(43);
    for (const n of range(0, COMMUNITY_ADDITION_BUDGET.targetPerDay)) {
      m.en(acteur(n));
      await m.creer([victime], communaute(n));
    }
    m.en(acteur(600));
    expect((await m.creer([voisine, victime], communaute(600))).statusCode).toBe(429);

    for (const n of range(0, COMMUNITY_ADDITION_BUDGET.targetPerDay)) {
      m.en(acteur(700 + n));
      expect((await m.creer([voisine], communaute(700 + n))).statusCode).not.toBe(429);
    }
  });

  it('plusieurs salons de la MÊME communauté ne comptent qu’une fois une même personne', async () => {
    const m = monde();
    const victime = personne(42);
    for (const n of range(0, COMMUNITY_ADDITION_BUDGET.targetPerDay + 3)) {
      m.en(acteur(n));
      expect((await m.creer([victime], communaute(0))).statusCode).not.toBe(429);
    }
  });
});
