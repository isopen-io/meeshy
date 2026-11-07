/**
 * #16703 — les trois chemins qui REMETTENT quelqu'un dans un salon d'une
 * communauté privée consultent la loi de la communauté (`planSalonEntry` /
 * `planCommunityAdmission`), comme les portes d'entrée de #16695 :
 *
 *  1. débannir (`leverBannissementDeParticipant`, cœur de `…/unban`) ;
 *  2. rattacher une conversation à une communauté privée
 *     (`POST /communities/:id/conversations/:conversationId`) ;
 *  3. restaurer un « supprimé pour moi »
 *     (`POST /api/conversations/:id/restore-for-me`).
 *
 * Les témoins observent les ÉCRITURES (participant, ligne de communauté,
 * conversation), jamais le seul statut : un double Prisma répond ce qu'on lui
 * dit, seul ce qui s'écrit distingue la loi appliquée de la loi ignorée.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';

const mockResolveConversationId = jest.fn<any>();

jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: any[]) => mockResolveConversationId(...args),
}));
jest.mock('../../../utils/participant-lookup-cache', () => ({ invalidateParticipantLookup: jest.fn<any>() }));
jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: jest.fn<any>().mockReturnValue({ error: jest.fn<any>(), info: jest.fn<any>(), warn: jest.fn<any>(), debug: jest.fn<any>() }) },
}));
jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: jest.fn<any>().mockReturnValue({ error: jest.fn<any>(), info: jest.fn<any>(), warn: jest.fn<any>(), debug: jest.fn<any>() }) },
}));
jest.mock('../../../services/message-translation/conversationLanguageChanges', () => ({
  announceConversationLanguageChange: jest.fn<any>(),
}));
jest.mock('../../../routes/communities/member-presence', () => ({
  gateConversationParticipantsPresence: jest.fn<any>(async (_p: unknown, _v: unknown, rows: unknown[]) => rows),
}));
jest.mock('../../../routes/users/presence-gate', () => ({
  viewerFromRequest: () => null,
}));
jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(() => async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    (request as unknown as Record<string, unknown>).authContext = { type: 'registered', userId: ACTEUR, hasFullAccess: true };
  }),
  UnifiedAuthRequest: {},
}));

import { leverBannissementDeParticipant } from '../../../routes/conversations/participant-ban-core';
import { registerCoreRoutes } from '../../../routes/communities/core';
import userDeletionsRoutes from '../../../routes/user-deletions';

const CONV_ID = '507f1f77bcf86cd799439011';
const ACTEUR = '507f1f77bcf86cd799439022';
const CIBLE = '507f1f77bcf86cd799439033';
const COMMUNAUTE = '507f1f77bcf86cd799439044';
const CREATEUR = '507f1f77bcf86cd7994390c0';

type Ligne = { readonly userId: string; readonly role: string; readonly isActive: boolean };
type Monde = { readonly isPrivate?: boolean; readonly lignes: readonly Ligne[]; readonly vivants?: readonly string[] };

const membre = (userId: string, role = 'member'): Ligne => ({ userId, role, isActive: true });
const ancien = (userId: string): Ligne => ({ userId, role: 'member', isActive: false });

/** La communauté, ses lignes, et la vérification « compte vivant sans blocage ». */
function communauteDouble(monde: Monde) {
  return {
    community: {
      findFirst: jest.fn<any>(async (args: any) => {
        if (args.where.id !== COMMUNAUTE) return null;
        const where = args.select.members.where;
        return {
          id: COMMUNAUTE,
          createdBy: CREATEUR,
          isPrivate: monde.isPrivate ?? true,
          isActive: true,
          members: monde.lignes.filter((l) => l.userId === where.userId && l.isActive === (where.isActive ?? true)),
        };
      }),
    },
    communityMember: {
      findMany: jest.fn<any>(async (args: any) => monde.lignes
        .filter((l) => args.where.userId.in.includes(l.userId))
        .map((l) => ({ id: `cm-${l.userId}`, ...l }))),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
      createMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
    },
    user: {
      findMany: jest.fn<any>(async (a: any) => (a?.where?.id?.in ?? [])
        .filter((id: string) => monde.vivants === undefined || monde.vivants.includes(id))
        .map((id: string) => ({ id }))),
      findFirst: jest.fn<any>(async () => null),
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockResolveConversationId.mockResolvedValue(CONV_ID);
});

// ─── 1. Débannir ─────────────────────────────────────────────────────────────

const CIBLE_BANNIE = {
  id: 'p-cible',
  userId: CIBLE as string | null,
  role: 'member',
  isActive: false,
  leftAt: new Date('2026-11-01T10:00:00Z'),
  bannedAt: new Date('2026-11-01T10:00:00Z'),
  language: 'fr',
  displayName: 'Bob',
  shareLinkId: null,
};

async function debannir(monde: Monde & { readonly communityId?: string | null; readonly cible?: typeof CIBLE_BANNIE }) {
  const prisma: any = {
    ...communauteDouble(monde),
    participant: {
      findFirst: jest.fn<any>()
        .mockResolvedValueOnce({ id: 'p-acteur', role: 'moderator', conversation: { communityId: monde.communityId === undefined ? COMMUNAUTE : monde.communityId } })
        .mockResolvedValueOnce(monde.cible ?? CIBLE_BANNIE),
      update: jest.fn<any>().mockResolvedValue({}),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
  };
  const verdict = await leverBannissementDeParticipant({
    prisma,
    conversationIdentifier: CONV_ID,
    targetKey: CIBLE,
    currentUserId: ACTEUR,
    platformRole: 'USER',
    socketIO: null,
  });
  return { verdict, prisma };
}

describe('#16703 — débannir dans un salon d’une communauté privée', () => {
  it('lève le bannissement SANS rendre le salon à un non-membre quand le modérateur n’est que membre de la communauté', async () => {
    const { verdict, prisma } = await debannir({ lignes: [membre(ACTEUR), ancien(CIBLE)] });

    expect(verdict.genre).toBe('ok');
    expect(prisma.participant.update).toHaveBeenCalledWith({ where: { id: 'p-cible' }, data: { bannedAt: null } });
    expect(prisma.communityMember.updateMany).not.toHaveBeenCalled();
    expect(prisma.communityMember.createMany).not.toHaveBeenCalled();
  });

  it('rend le salon et fait entrer dans la communauté quand le modérateur y est administrateur ou modérateur', async () => {
    const { prisma } = await debannir({ lignes: [membre(ACTEUR, 'moderator'), ancien(CIBLE)] });

    expect(prisma.participant.update).toHaveBeenCalledWith({
      where: { id: 'p-cible' },
      data: { bannedAt: null, isActive: true, leftAt: null },
    });
    expect(prisma.communityMember.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [`cm-${CIBLE}`] }, isActive: false },
      data: { isActive: true, leftAt: null, role: 'member' },
    });
  });

  it('rend le salon sans rien écrire à la communauté quand la cible en est restée membre', async () => {
    const { prisma } = await debannir({ lignes: [membre(ACTEUR), membre(CIBLE)] });

    expect(prisma.participant.update).toHaveBeenCalledWith({
      where: { id: 'p-cible' },
      data: { bannedAt: null, isActive: true, leftAt: null },
    });
    expect(prisma.communityMember.updateMany).not.toHaveBeenCalled();
    expect(prisma.communityMember.createMany).not.toHaveBeenCalled();
  });

  it('ne rend pas le salon à un compte qui ne peut plus entrer (compte supprimé), même par un administrateur', async () => {
    const { prisma } = await debannir({ lignes: [membre(ACTEUR, 'admin'), ancien(CIBLE)], vivants: [] });

    expect(prisma.participant.update).toHaveBeenCalledWith({ where: { id: 'p-cible' }, data: { bannedAt: null } });
    expect(prisma.communityMember.updateMany).not.toHaveBeenCalled();
  });

  it('ne rend pas le salon à un invité sans compte quand le modérateur n’est que membre de la communauté', async () => {
    const { prisma } = await debannir({ lignes: [membre(ACTEUR)], cible: { ...CIBLE_BANNIE, userId: null } });

    expect(prisma.participant.update).toHaveBeenCalledWith({ where: { id: 'p-cible' }, data: { bannedAt: null } });
  });

  it('ne change rien dans une communauté publique', async () => {
    const { prisma } = await debannir({ isPrivate: false, lignes: [membre(ACTEUR), ancien(CIBLE)] });

    expect(prisma.participant.update).toHaveBeenCalledWith({
      where: { id: 'p-cible' },
      data: { bannedAt: null, isActive: true, leftAt: null },
    });
    expect(prisma.communityMember.findMany).not.toHaveBeenCalled();
  });

  it('ne change rien hors communauté', async () => {
    const { prisma } = await debannir({ communityId: null, lignes: [] });

    expect(prisma.community.findFirst).not.toHaveBeenCalled();
    expect(prisma.participant.update).toHaveBeenCalledWith({
      where: { id: 'p-cible' },
      data: { bannedAt: null, isActive: true, leftAt: null },
    });
  });
});

// ─── 2. Rattacher une conversation ───────────────────────────────────────────

async function rattacher(monde: Monde & { readonly participants: ReadonlyArray<{ userId: string | null; role: string; isActive?: boolean }> }) {
  const prisma: any = {
    ...communauteDouble(monde),
    community: {
      findFirst: jest.fn<any>(async () => ({
        id: COMMUNAUTE,
        createdBy: CREATEUR,
        isPrivate: monde.isPrivate ?? true,
        members: [{ role: 'admin' }],
      })),
    },
    conversation: {
      findFirst: jest.fn<any>().mockResolvedValue({
        id: CONV_ID,
        communityId: null,
        participants: monde.participants.map((p) => ({ isActive: true, ...p })),
      }),
      update: jest.fn<any>().mockResolvedValue({ id: CONV_ID, communityId: COMMUNAUTE, participants: [], _count: { messages: 0, participants: 0 } }),
    },
  };
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: any) => {
    req.authContext = { isAuthenticated: true, userId: ACTEUR, registeredUser: { id: ACTEUR, role: 'USER' } };
  });
  app.decorate('prisma', prisma);
  await app.register(registerCoreRoutes);
  await app.ready();
  try {
    const res = await app.inject({ method: 'POST', url: `/communities/${COMMUNAUTE}/conversations/${CONV_ID}` });
    return { res, prisma };
  } finally {
    await app.close();
  }
}

describe('#16703 — rattacher une conversation à une communauté privée', () => {
  const ADMIN_CONV = { userId: ACTEUR, role: 'admin' };

  it('fait entrer dans la communauté les participants qui n’en sont pas membres', async () => {
    const { res, prisma } = await rattacher({
      lignes: [membre(ACTEUR, 'admin')],
      participants: [ADMIN_CONV, { userId: CIBLE, role: 'member' }, { userId: null, role: 'member' }],
    });

    expect(res.statusCode).toBe(200);
    expect(prisma.conversation.update).toHaveBeenCalled();
    expect(prisma.communityMember.createMany).toHaveBeenCalledWith({
      data: [{ communityId: COMMUNAUTE, userId: CIBLE, role: 'member' }],
    });
  });

  it('refuse sans rien écrire quand un participant ne peut pas entrer dans la communauté', async () => {
    const { res, prisma } = await rattacher({
      lignes: [membre(ACTEUR, 'admin')],
      vivants: [],
      participants: [ADMIN_CONV, { userId: CIBLE, role: 'member' }],
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('COMMUNITY_PARTICIPANT_NOT_ADDABLE');
    expect(prisma.conversation.update).not.toHaveBeenCalled();
    expect(prisma.communityMember.createMany).not.toHaveBeenCalled();
  });

  it('ne compte pas un participant parti du salon', async () => {
    const { res, prisma } = await rattacher({
      lignes: [membre(ACTEUR, 'admin')],
      vivants: [],
      participants: [ADMIN_CONV, { userId: CIBLE, role: 'member', isActive: false }],
    });

    expect(res.statusCode).toBe(200);
    expect(prisma.communityMember.createMany).not.toHaveBeenCalled();
  });

  it('ne fait entrer personne dans une communauté publique', async () => {
    const { res, prisma } = await rattacher({
      isPrivate: false,
      lignes: [membre(ACTEUR, 'admin')],
      participants: [ADMIN_CONV, { userId: CIBLE, role: 'member' }],
    });

    expect(res.statusCode).toBe(200);
    expect(prisma.communityMember.findMany).not.toHaveBeenCalled();
    expect(prisma.communityMember.createMany).not.toHaveBeenCalled();
  });
});

// ─── 3. Restaurer un « supprimé pour moi » ───────────────────────────────────

async function restaurer(monde: Monde & { readonly communityId?: string | null }) {
  const prisma: any = {
    ...communauteDouble(monde),
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue({
        id: 'p-acteur',
        deletedForMe: new Date('2026-11-01'),
        bannedAt: null,
        language: 'fr',
        conversation: { isActive: true, communityId: monde.communityId === undefined ? COMMUNAUTE : monde.communityId },
      }),
      update: jest.fn<any>().mockResolvedValue({}),
    },
  };
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);
  await app.register(userDeletionsRoutes);
  await app.ready();
  try {
    const res = await app.inject({ method: 'POST', url: `/api/v1/conversations/${CONV_ID}/restore-for-me` });
    return { res, prisma };
  } finally {
    await app.close();
  }
}

describe('#16703 — restaurer un « supprimé pour moi » dans un salon d’une communauté privée', () => {
  it('refuse à qui n’est plus membre de la communauté, sans rallumer sa ligne', async () => {
    const { res, prisma } = await restaurer({ lignes: [ancien(ACTEUR)] });

    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('COMMUNITY_MEMBERS_ONLY');
    expect(prisma.participant.update).not.toHaveBeenCalled();
  });

  it('restaure un membre actif de la communauté', async () => {
    const { res, prisma } = await restaurer({ lignes: [membre(ACTEUR)] });

    expect(res.statusCode).toBe(200);
    expect(prisma.participant.update).toHaveBeenCalled();
  });

  it('restaure hors communauté et dans une communauté publique', async () => {
    const horsCommunaute = await restaurer({ communityId: null, lignes: [] });
    const publique = await restaurer({ isPrivate: false, lignes: [] });

    expect(horsCommunaute.res.statusCode).toBe(200);
    expect(publique.res.statusCode).toBe(200);
  });
});
