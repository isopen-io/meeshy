/**
 * #16695 — les TROIS portes qui ajoutent quelqu'un à un salon déjà rattaché à
 * une communauté appliquent la loi de la communauté (`planSalonEntry`) :
 * `POST /conversations/:id/invite`, `POST /conversations/:id/participants`
 * et la jonction par lien (`POST /links/:key/members`, cœur partagé avec
 * `POST /conversations/join/:linkId` et `POST /anonymous/join/:linkId`).
 *
 * La loi elle-même a ses témoins (`community-salon-entry.test.ts`) ; ici on
 * prouve que chaque porte la CONSULTE avant d'écrire, et écrit l'admission
 * qu'elle rend.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockResolveConversationId = jest.fn<any>();

jest.mock('../../../../services/messaging/messageRequests', () => ({
  ...jest.requireActual<object>('../../../../services/messaging/messageRequests'),
  decideOpenings: jest.fn(async () => new Map()),
  decideDirectOpening: jest.fn(async () => ({ kind: 'direct' })),
}));
jest.mock('../../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: any[]) => mockResolveConversationId(...args),
}));
jest.mock('../../../../utils/participant-lookup-cache', () => ({ invalidateParticipantLookup: jest.fn<any>() }));
jest.mock('../../../../socketio/emitConversationMemberCount', () => ({ emitConversationMemberCountEvent: jest.fn<any>() }));
jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: jest.fn<any>().mockReturnValue({ error: jest.fn<any>(), info: jest.fn<any>(), warn: jest.fn<any>(), debug: jest.fn<any>() }) },
}));
jest.mock('../../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: jest.fn<any>().mockReturnValue({ error: jest.fn<any>(), info: jest.fn<any>(), warn: jest.fn<any>(), debug: jest.fn<any>() }) },
}));
jest.mock('../../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({
    resolveForTarget: jest.fn<any>(async () => ({ showOnline: false, showLastSeenTimestamp: false })),
  }),
}));

import Fastify, { type FastifyRequest } from 'fastify';
import { registerParticipantWriteRoutes } from '../../../../routes/conversations/participants-writes';
import { registerSharingRoutes } from '../../../../routes/conversations/sharing';
import { registerLinkAdmissionRoutes } from '../../../../routes/conversations/link-admission';

const CONV_ID = '507f1f77bcf86cd799439011';
const ACTOR = '507f1f77bcf86cd799439022';
const BOB = '507f1f77bcf86cd799439033';
const COMMUNITY = '507f1f77bcf86cd799439044';
const CREATEUR = '507f1f77bcf86cd7994390c0';

type Ligne = { readonly userId: string; readonly role: string; readonly isActive: boolean };
type Monde = { readonly communityId?: string | null; readonly isPrivate?: boolean; readonly lignes: readonly Ligne[] };

const membre = (userId: string, role = 'member'): Ligne => ({ userId, role, isActive: true });

/** La communauté, ses lignes, et la vérification « compte vivant sans blocage ». */
function communityDouble(monde: Monde) {
  return {
    community: {
      findFirst: jest.fn<any>(async (args: any) => {
        if (args.where.id !== COMMUNITY) return null;
        const where = args.select.members.where;
        return {
          createdBy: CREATEUR,
          isPrivate: monde.isPrivate ?? true,
          members: monde.lignes.filter((l) => l.userId === where.userId && l.isActive === where.isActive),
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
  };
}

const bob = { id: BOB, username: 'bob', displayName: 'Bob', firstName: 'Bob', lastName: 'B', avatar: null, systemLanguage: 'fr', deactivatedAt: null };

// ─── POST /conversations/:id/participants ────────────────────────────────────

async function ajouter(monde: Monde) {
  const rows: any[] = [{ id: 'p-actor', conversationId: CONV_ID, userId: ACTOR, role: 'admin', isActive: true, bannedAt: null, type: 'user', displayName: 'Demo' }];
  const prisma: any = {
    ...communityDouble(monde),
    conversation: {
      findUnique: jest.fn<any>(async () => ({ isActive: true, closedAt: null, communityId: monde.communityId === undefined ? COMMUNITY : monde.communityId })),
      update: jest.fn<any>().mockResolvedValue(undefined),
    },
    participant: {
      findFirst: jest.fn<any>(async (a: any) => rows.find((r) => r.userId === a?.where?.userId && r.isActive) ?? null),
      findMany: jest.fn<any>(async (a: any) => rows.filter((r) => typeof a?.where?.userId !== 'string' || r.userId === a.where.userId)),
      create: jest.fn<any>(async (a: any) => ({ id: 'p-bob', isActive: true, ...a.data })),
      update: jest.fn<any>(async (a: any) => ({ id: a.where.id, ...a.data })),
    },
    user: {
      findMany: jest.fn<any>(async (a: any) => (a?.where?.id?.in ?? []).map((id: string) => ({ id }))),
      findFirst: jest.fn<any>(async (a: any) => (a?.where?.OR ? null : bob)),
    },
    message: { create: jest.fn<any>(async (a: any) => ({ id: 'sys-1', createdAt: new Date(), ...a.data })) },
  };
  const chainable: any = { emit: jest.fn<any>() };
  chainable.to = jest.fn<any>(() => chainable);
  const app = Fastify({ logger: false });
  (app as any).prisma = prisma;
  (app as any).notificationService = {
    createAddedToConversationNotification: jest.fn<any>().mockResolvedValue(undefined),
    createMemberJoinedNotificationsBatch: jest.fn<any>().mockResolvedValue(0),
  };
  (app as any).socketIOHandler = {
    getManager: jest.fn<any>().mockReturnValue({
      getIO: jest.fn<any>().mockReturnValue(chainable),
      joinUserToConversationRoom: jest.fn<any>().mockResolvedValue(undefined),
      broadcastMessage: jest.fn<any>().mockResolvedValue(undefined),
    }),
  };
  const requiredAuth = async (req: any) => {
    req.authContext = { type: 'user', userId: ACTOR, isAuthenticated: true, registeredUser: { id: ACTOR, role: 'USER' } };
  };
  registerParticipantWriteRoutes(app as any, prisma, requiredAuth, { recordActivity: jest.fn<any>().mockResolvedValue(undefined) } as never);
  await app.ready();
  try {
    const single = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/participants`, payload: { userId: BOB } });
    return { single, prisma };
  } finally {
    await app.close();
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  mockResolveConversationId.mockResolvedValue(CONV_ID);
});

describe('#16695 — POST /conversations/:id/participants', () => {
  it('un modérateur de salon, simple membre de la communauté privée, n’y fait pas entrer un non-membre : 403, rien d’écrit', async () => {
    const { single, prisma } = await ajouter({ lignes: [membre(ACTOR)] });
    expect(single.statusCode).toBe(403);
    expect(single.json().code).toBe('COMMUNITY_INVITE_FORBIDDEN');
    expect(prisma.participant.create).not.toHaveBeenCalled();
    expect(prisma.communityMember.createMany).not.toHaveBeenCalled();
  });

  it('un admin de la communauté l’y fait entrer : salon ET communauté', async () => {
    const { single, prisma } = await ajouter({ lignes: [membre(ACTOR, 'admin')] });
    expect(single.statusCode).toBe(200);
    expect(prisma.participant.create).toHaveBeenCalled();
    expect(prisma.communityMember.createMany).toHaveBeenCalledWith({ data: [{ communityId: COMMUNITY, userId: BOB, role: 'member' }] });
  });

  it('un membre actif de la communauté entre par un simple membre, sans écriture de communauté', async () => {
    const { single, prisma } = await ajouter({ lignes: [membre(ACTOR), membre(BOB)] });
    expect(single.statusCode).toBe(200);
    expect(prisma.communityMember.createMany).not.toHaveBeenCalled();
    expect(prisma.communityMember.updateMany).not.toHaveBeenCalled();
  });

  it('une communauté publique est inchangée', async () => {
    const { single, prisma } = await ajouter({ isPrivate: false, lignes: [membre(ACTOR)] });
    expect(single.statusCode).toBe(200);
    expect(prisma.communityMember.findMany).not.toHaveBeenCalled();
  });

  it('un salon hors communauté ne lit aucune communauté', async () => {
    const { single, prisma } = await ajouter({ communityId: null, lignes: [] });
    expect(single.statusCode).toBe(200);
    expect(prisma.community.findFirst).not.toHaveBeenCalled();
  });
});

// ─── POST /conversations/:id/invite ──────────────────────────────────────────

async function inviter(monde: Monde) {
  let handler: any;
  const prisma: any = {
    ...communityDouble(monde),
    conversation: {
      findUnique: jest.fn<any>().mockResolvedValue({
        id: CONV_ID, title: 'Salon', type: 'group', isActive: true, closedAt: null, communityId: COMMUNITY,
        participants: [{ id: 'p-actor', userId: ACTOR, role: 'admin', displayName: 'Demo', user: { id: ACTOR, username: 'demo', role: 'USER' } }],
      }),
      update: jest.fn<any>().mockResolvedValue(undefined),
    },
    user: {
      findMany: jest.fn<any>(async (a: any) => (a?.where?.id?.in ?? []).map((id: string) => ({ id }))),
      findFirst: jest.fn<any>().mockResolvedValue(null),
      findUnique: jest.fn<any>().mockResolvedValue(bob),
    },
    participant: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      create: jest.fn<any>().mockResolvedValue({ id: 'p-bob', userId: BOB, displayName: 'Bob', user: bob }),
      update: jest.fn<any>(),
    },
    message: { create: jest.fn<any>(async ({ data }: any) => ({ id: 'sys-1', createdAt: new Date(), ...data })) },
  };
  const fastify = {
    prisma,
    notificationService: {
      createConversationInviteNotification: jest.fn<any>().mockResolvedValue(undefined),
      createMemberJoinedNotificationsBatch: jest.fn<any>().mockResolvedValue(0),
    },
    socketIOHandler: { getManager: jest.fn<any>().mockReturnValue({ joinUserToConversationRoom: jest.fn<any>().mockResolvedValue(undefined), broadcastMessage: jest.fn<any>().mockResolvedValue(undefined) }) },
    get: jest.fn<any>(),
    patch: jest.fn<any>(),
    post: jest.fn<any>((path: string, _o: unknown, h: any) => { if (path.includes('invite')) handler = h; }),
  };
  registerSharingRoutes(fastify as never, prisma as never, { recordActivity: jest.fn<any>().mockResolvedValue(undefined) } as never);
  const reply: any = {};
  reply.status = jest.fn<any>(() => reply);
  reply.code = jest.fn<any>(() => reply);
  reply.send = jest.fn<any>(() => reply);
  await handler(
    { params: { id: CONV_ID }, body: { userId: BOB }, authContext: { type: 'user', userId: ACTOR, isAuthenticated: true, registeredUser: { id: ACTOR, role: 'USER' } } },
    reply,
  );
  const statut = reply.status.mock.calls.at(-1)?.[0] ?? reply.code.mock.calls.at(-1)?.[0] ?? 200;
  return { statut, corps: reply.send.mock.calls.at(-1)?.[0], prisma };
}

describe('#16695 — POST /conversations/:id/invite', () => {
  it('un simple membre de la communauté privée n’y invite pas un non-membre : 403, rien d’écrit', async () => {
    const { statut, corps, prisma } = await inviter({ lignes: [membre(ACTOR)] });
    expect(statut).toBe(403);
    expect(corps.code).toBe('COMMUNITY_INVITE_FORBIDDEN');
    expect(prisma.participant.create).not.toHaveBeenCalled();
  });

  it('un modérateur de la communauté l’y invite : salon ET communauté', async () => {
    const { statut, prisma } = await inviter({ lignes: [membre(ACTOR, 'moderator')] });
    expect(statut).toBe(200);
    expect(prisma.participant.create).toHaveBeenCalled();
    expect(prisma.communityMember.createMany).toHaveBeenCalledWith({ data: [{ communityId: COMMUNITY, userId: BOB, role: 'member' }] });
  });
});

// ─── Jonction par lien ───────────────────────────────────────────────────────

const shareLink = {
  id: '507f1f77bcf86cd7994390aa', linkId: 'mshy_link', identifier: 'lien', conversationId: CONV_ID, createdBy: ACTOR,
  isActive: true, expiresAt: null, maxUses: null, currentUses: 0, maxConcurrentUsers: null, currentConcurrentUsers: 0,
  maxUniqueSessions: null, currentUniqueSessions: 0, requireAccount: false, requireNickname: false, requireEmail: false,
  requireBirthday: false, allowedCountries: [], allowedLanguages: [], allowedIpRanges: [],
  allowAnonymousMessages: true, allowAnonymousFiles: false, allowAnonymousImages: false, allowViewHistory: false,
  conversation: { id: CONV_ID, title: 'Salon', type: 'group', isActive: true, closedAt: null, communityId: COMMUNITY },
};

async function rejoindreParLien(monde: Monde, identite: 'registered' | 'guest') {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const prisma: any = {
    ...communityDouble(monde),
    conversationShareLink: {
      findFirst: jest.fn<any>().mockResolvedValue(shareLink),
      findUnique: jest.fn<any>().mockResolvedValue(shareLink),
      update: jest.fn<any>().mockResolvedValue({}),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
    },
    user: {
      findUnique: jest.fn<any>().mockResolvedValue({ displayName: 'Bob', username: 'bob' }),
      findMany: jest.fn<any>(async (a: any) => (a?.where?.id?.in ?? []).map((id: string) => ({ id }))),
      findFirst: jest.fn<any>().mockResolvedValue(null),
    },
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      findUnique: jest.fn<any>().mockResolvedValue(null),
      findMany: jest.fn<any>().mockResolvedValue([]),
      create: jest.fn<any>(async ({ data }: any) => ({ id: 'participant-1', avatar: null, ...data })),
      update: jest.fn<any>(async ({ data }: any) => ({ id: 'participant-1', avatar: null, ...data })),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
    },
    anonymousSession: { create: jest.fn<any>(async ({ data }: any) => ({ id: 'session-1', ...data })) },
    message: { create: jest.fn<any>().mockResolvedValue({ id: 'msg-1' }) },
  };
  app.decorate('prisma', prisma as never);
  const auth = async (request: FastifyRequest) => {
    (request as any).authContext = identite === 'registered'
      ? { type: 'user', isAuthenticated: true, isAnonymous: false, userId: BOB, displayName: 'Bob', userLanguage: 'fr', hasFullAccess: true, canSendMessages: true }
      : undefined;
  };
  registerLinkAdmissionRoutes(app as never, prisma, auth, auth);
  await app.ready();
  try {
    const res = await app.inject({ method: 'POST', url: '/links/mshy_link/members', payload: { nickname: 'Bobby' } });
    return { res, prisma };
  } finally {
    await app.close();
  }
}

describe('#16695 — jonction par lien', () => {
  it('le lien d’un simple membre ne fait pas entrer un inscrit non-membre : 403 COMMUNITY_MEMBERS_ONLY, rien d’écrit', async () => {
    const { res, prisma } = await rejoindreParLien({ lignes: [membre(ACTOR)] }, 'registered');
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('COMMUNITY_MEMBERS_ONLY');
    expect(prisma.participant.create).not.toHaveBeenCalled();
    expect(prisma.conversationShareLink.updateMany).not.toHaveBeenCalled();
  });

  it('le lien d’un simple membre ne fait pas entrer un invité sans compte', async () => {
    const { res, prisma } = await rejoindreParLien({ lignes: [membre(ACTOR)] }, 'guest');
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('COMMUNITY_MEMBERS_ONLY');
    expect(prisma.participant.create).not.toHaveBeenCalled();
  });

  it('le lien d’un admin fait entrer l’inscrit dans le salon ET la communauté', async () => {
    const { res, prisma } = await rejoindreParLien({ lignes: [membre(ACTOR, 'admin')] }, 'registered');
    expect(res.statusCode).toBe(201);
    expect(prisma.communityMember.createMany).toHaveBeenCalledWith({ data: [{ communityId: COMMUNITY, userId: BOB, role: 'member' }] });
  });

  it('un membre actif de la communauté entre par le lien d’un simple membre', async () => {
    const { res, prisma } = await rejoindreParLien({ lignes: [membre(ACTOR), membre(BOB)] }, 'registered');
    expect(res.statusCode).toBe(201);
    expect(prisma.communityMember.createMany).not.toHaveBeenCalled();
  });

  it('une communauté publique est inchangée', async () => {
    const { res } = await rejoindreParLien({ isPrivate: false, lignes: [] }, 'guest');
    expect(res.statusCode).toBe(201);
  });
});
