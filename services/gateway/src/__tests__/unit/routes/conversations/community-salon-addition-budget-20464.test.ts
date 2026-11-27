/**
 * #20464 — créer un salon dans une communauté y fait ENTRER ses participants,
 * sans leur accord. C'est la loi de `POST /communities/:id/invite` (#16639) :
 * elle débite donc le MÊME budget que les deux routes d'ajout (#19812).
 *
 * Témoins : l'acteur paie au nombre de personnes qui ENTRENT (pas une requête
 * pour 250 personnes) ; une tentative vers des comptes non ajoutables compte
 * aussi (pas de sondage gratuit) ; un refus d'autorisation passe AVANT le
 * budget ; la cible a son plafond, tous acteurs confondus, compté par
 * communauté DISTINCTE (un cycle ajout/retrait ne le remplit pas) ; un lot
 * refusé n'écrit rien et ne coûte rien aux autres personnes du lot ; magasin
 * en panne ⇒ le geste passe (fail-open écrit).
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
  sendSuccess: jest.fn<any>((reply: any) => reply),
  sendError: jest.fn<any>((reply: any) => reply),
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
import { sendError, sendForbidden, sendNotFound } from '../../../../utils/response';
import { COMMUNITY_ADDITION_BUDGET, COMMUNITY_ADDITION_BUDGET_CODE } from '../../../../utils/community-addition-budget';

const CONV_ID = '507f1f77bcf86cd799439011';
const CREATOR = '507f1f77bcf86cd799439099';

const idOf = (prefix: string, n: number) => `${prefix}${n.toString(16).padStart(24 - prefix.length, '0')}`;
const personne = (n: number) => idOf('a1', n);
const acteur = (n: number) => idOf('b2', n);
const communaute = (n: number) => idOf('c3', n);
const morts = (n: number) => idOf('d4', n);

type Monde = { isPrivate?: boolean; role?: string };

function prismaDouble(monde: Monde = {}) {
  return {
    community: {
      findFirst: jest.fn<any>(async (args: any) => ({
        id: args.where.id,
        createdBy: CREATOR,
        isPrivate: monde.isPrivate ?? false,
        members: [{ userId: 'x', role: monde.role ?? 'member' }],
      })),
    },
    communityMember: {
      findMany: jest.fn<any>().mockResolvedValue([]),
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
      findMany: jest.fn<any>(async (args: any) => (args.where?.id?.in ?? [])
        .filter((id: string) => !id.startsWith('d4'))
        .map((id: string) => ({ id }))),
      findFirst: jest.fn<any>().mockResolvedValue(null),
    },
  };
}

function replyDouble() {
  const reply: any = {
    status: jest.fn<any>(() => reply),
    code: jest.fn<any>(() => reply),
    header: jest.fn<any>(() => reply),
    send: jest.fn<any>(() => reply),
  };
  return reply;
}

/** UN serveur : ses seaux vivent d'une requête à l'autre, comme en production. */
function serveur(monde: Monde = {}) {
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
  const creer = async (par: string, participantIds: readonly string[], communityId = communaute(1)) => {
    const reply = replyDouble();
    jest.mocked(sendError).mockClear();
    prisma.conversation.create.mockClear();
    await handler(
      {
        body: { type: 'group', title: 'Salon', participantIds, communityId },
        params: {}, query: {}, headers: {},
        authContext: {
          type: 'user', isAuthenticated: true, isAnonymous: false,
          userId: par, registeredUser: { id: par, role: 'USER' },
        },
        user: { userId: par },
      },
      reply,
    );
    const refuse = jest.mocked(sendError).mock.calls.find(([, status]) => status === 429);
    return {
      budgetRefuse: refuse !== undefined && (refuse[3] as { code?: string })?.code === COMMUNITY_ADDITION_BUDGET_CODE,
      cree: prisma.conversation.create.mock.calls.length > 0,
      retryAfter: reply.header.mock.calls.find(([name]: [string]) => name === 'Retry-After')?.[1],
    };
  };
  return { creer, prisma };
}

const range = (n: number, f: (i: number) => string) => Array.from({ length: n }, (_, i) => f(i + 1));

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.RATE_LIMIT_DISABLED;
});

afterEach(() => {
  delete process.env.RATE_LIMIT_DISABLED;
});

describe('#20464 — un salon créé dans une communauté débite le budget des ajouts', () => {
  it('l’acteur paie au nombre de personnes qui ENTRENT : 31 d’un coup dépasse les 30 de l’heure, rien n’est créé', async () => {
    const { creer, prisma } = serveur();

    const issue = await creer(acteur(1), range(COMMUNITY_ADDITION_BUDGET.actorPerHour + 1, personne));

    expect(issue.budgetRefuse).toBe(true);
    expect(issue.retryAfter).toEqual(expect.any(String));
    expect(issue.cree).toBe(false);
    expect(prisma.communityMember.createMany).not.toHaveBeenCalled();
  });

  it('30 personnes passent, et le salon suivant du même acteur est refusé — le seau survit à la requête', async () => {
    const { creer } = serveur();

    const premier = await creer(acteur(1), range(COMMUNITY_ADDITION_BUDGET.actorPerHour, personne));
    const second = await creer(acteur(1), [idOf('e5', 1)]);

    expect(premier.cree).toBe(true);
    expect(second.budgetRefuse).toBe(true);
    expect(second.cree).toBe(false);
  });

  it('un salon sans invité ne coûte rien (l’appelant seul n’est pas un ajout)', async () => {
    const { creer } = serveur();

    const salons = await Promise.all(range(40, () => '').map(() => creer(acteur(1), [])));

    expect(salons.every((s) => s.cree && !s.budgetRefuse)).toBe(true);
  });

  it('sonder des comptes non ajoutables coûte autant qu’ajouter : 30 morts, puis un vivant ⇒ 429', async () => {
    const { creer } = serveur();

    const sonde = await creer(acteur(1), range(COMMUNITY_ADDITION_BUDGET.actorPerHour, morts));
    const ensuite = await creer(acteur(1), [personne(1)]);

    expect(sendNotFound).toHaveBeenCalled();
    expect(sonde.cree).toBe(false);
    expect(ensuite.budgetRefuse).toBe(true);
  });

  it('un refus d’AUTORISATION passe avant le budget : 403, et le seau n’est pas entamé', async () => {
    const monde: Monde = { isPrivate: true, role: 'member' };
    const { creer } = serveur(monde);

    const refus = await creer(acteur(1), range(COMMUNITY_ADDITION_BUDGET.actorPerHour + 5, personne));
    expect(refus.budgetRefuse).toBe(false);
    expect(sendForbidden).toHaveBeenCalledWith(expect.anything(), expect.any(String), { code: 'COMMUNITY_INVITE_FORBIDDEN' });

    monde.isPrivate = false;
    const ensuite = await creer(acteur(1), range(COMMUNITY_ADDITION_BUDGET.actorPerHour, personne));
    expect(ensuite.cree).toBe(true);
  });

  it('une création qui échoue après le plan rend le budget des cibles : rien d’écrit, rien de pris', async () => {
    const { creer, prisma } = serveur();
    const cible = personne(7);
    prisma.conversation.create.mockRejectedValue(new Error('panne'));
    for (let i = 0; i < COMMUNITY_ADDITION_BUDGET.targetPerDay; i += 1) {
      const echec = await creer(acteur(i + 1), [cible], communaute(i + 1));
      expect(echec.cree).toBe(true);
    }
    prisma.conversation.create.mockImplementation(async () => ({ id: CONV_ID, type: 'group', title: 'Salon', createdAt: new Date(), participants: [] }));
    prisma.communityMember.createMany.mockClear();

    const reel = await creer(acteur(40), [cible], communaute(40));

    expect(reel.budgetRefuse).toBe(false);
    expect(prisma.communityMember.createMany).toHaveBeenCalled();
  });

  it('la cible a son plafond, tous acteurs confondus : dix communautés distinctes, la onzième est refusée', async () => {
    const { creer } = serveur();
    const cible = personne(7);

    const dix = await Promise.all(
      range(COMMUNITY_ADDITION_BUDGET.targetPerDay, (i) => String(i)).map((_, i) => creer(acteur(i + 1), [cible], communaute(i + 1))),
    );
    const onzieme = await creer(acteur(50), [cible], communaute(50));

    expect(dix.every((s) => s.cree)).toBe(true);
    expect(onzieme.budgetRefuse).toBe(true);
    expect(onzieme.cree).toBe(false);
  });

  it('un cycle ajout/retrait dans la MÊME communauté ne remplit pas le seau de la cible, et s’arrête au plafond de la paire', async () => {
    const { creer } = serveur();
    const cible = personne(7);

    const cycles = [];
    for (let i = 0; i < COMMUNITY_ADDITION_BUDGET.pairPerDay; i += 1) {
      cycles.push(await creer(acteur(i + 1), [cible], communaute(1)));
    }
    const deTrop = await creer(acteur(9), [cible], communaute(1));
    expect(deTrop.budgetRefuse).toBe(true);
    expect(deTrop.cree).toBe(false);
    const ailleurs = await Promise.all(
      range(COMMUNITY_ADDITION_BUDGET.targetPerDay - 1, (i) => String(i)).map((_, i) => creer(acteur(i + 2), [cible], communaute(i + 2))),
    );

    expect(cycles.every((s) => s.cree)).toBe(true);
    expect(ailleurs.every((s) => s.cree)).toBe(true);
  });

  it('un lot refusé par une cible saturée n’écrit rien et ne coûte rien aux autres personnes du lot', async () => {
    const { creer, prisma } = serveur();
    const saturee = personne(7);
    const voisine = personne(8);
    for (let i = 0; i < COMMUNITY_ADDITION_BUDGET.targetPerDay; i += 1) {
      await creer(acteur(i + 1), [saturee], communaute(i + 1));
    }
    prisma.communityMember.createMany.mockClear();

    const lot = await creer(acteur(20), [voisine, saturee], communaute(20));
    const ensuite = await Promise.all(
      range(COMMUNITY_ADDITION_BUDGET.targetPerDay, (i) => String(i)).map((_, i) => creer(acteur(i + 30), [voisine], communaute(i + 30))),
    );

    expect(lot.budgetRefuse).toBe(true);
    expect(lot.cree).toBe(false);
    expect(ensuite.every((s) => s.cree)).toBe(true);
  });

  it('magasin indisponible (consume → null) : le geste passe — fail-open, comme les autres budgets', async () => {
    process.env.RATE_LIMIT_DISABLED = 'true';
    const { creer } = serveur();

    const issue = await creer(acteur(1), range(COMMUNITY_ADDITION_BUDGET.actorPerHour + 20, personne));

    expect(issue.budgetRefuse).toBe(false);
    expect(issue.cree).toBe(true);
  });
});
