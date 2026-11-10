/**
 * #17117 — une conversation EXTERNE n'a qu'un membre Meeshy : son ouvreur. Le
 * fil est adressé au numéro de l'ami sur un réseau tiers ; un second membre
 * écrirait sous l'identité téléphonique de l'ouvreur (audit adversarial du
 * 2026-11-10, constat ÉLEVÉ). Les QUATRE portes qui font entrer quelqu'un —
 * ajout de participant, invitation, création de lien, jonction par lien — la
 * refusent en `409 EXTERNAL_CONVERSATION_SINGLE_MEMBER`, sans rien écrire.
 *
 * Et fermer le fil efface l'adresse de l'ami : le numéro ne survit pas à la
 * conversation (sortie du dernier membre, suppression).
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
import { EXTERNAL_CONVERSATION_ERROR_CODES, EXTERNAL_CONVERSATION_TYPE } from '@meeshy/shared/types/external-conversation';
import { registerParticipantWriteRoutes } from '../../../../routes/conversations/participants-writes';
import { registerSharingRoutes } from '../../../../routes/conversations/sharing';
import { registerLinkAdmissionRoutes } from '../../../../routes/conversations/link-admission';
import { registerLeaveRoutes } from '../../../../routes/conversations/leave';
import { mintConversationShareLink } from '../../../../routes/links/utils/share-link-mint';

const CONV_ID = '507f1f77bcf86cd799439011';
const OPENER = '507f1f77bcf86cd799439022';
const BOB = '507f1f77bcf86cd799439033';
const SINGLE_MEMBER = EXTERNAL_CONVERSATION_ERROR_CODES.SINGLE_MEMBER;

const bob = { id: BOB, username: 'bob', displayName: 'Bob', firstName: 'Bob', lastName: 'B', avatar: null, systemLanguage: 'fr', deactivatedAt: null };
const asOpener = { type: 'user', userId: OPENER, isAuthenticated: true, registeredUser: { id: OPENER, role: 'USER' } };

beforeEach(() => {
  jest.clearAllMocks();
  mockResolveConversationId.mockResolvedValue(CONV_ID);
});

// ─── POST /conversations/:id/participants ────────────────────────────────────

async function addParticipant(type: string) {
  const prisma: any = {
    conversation: {
      findUnique: jest.fn<any>(async () => ({ isActive: true, closedAt: null, communityId: null, type })),
      update: jest.fn<any>().mockResolvedValue(undefined),
    },
    participant: {
      findFirst: jest.fn<any>(async () => ({ id: 'p-opener', conversationId: CONV_ID, userId: OPENER, role: 'creator', isActive: true, type: 'user', displayName: 'Alice' })),
      findMany: jest.fn<any>().mockResolvedValue([]),
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
  const requiredAuth = async (req: any) => { req.authContext = asOpener; };
  registerParticipantWriteRoutes(app as any, prisma, requiredAuth, { recordActivity: jest.fn<any>().mockResolvedValue(undefined) } as never);
  await app.ready();
  try {
    const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/participants`, payload: { userId: BOB } });
    return { res, prisma };
  } finally {
    await app.close();
  }
}

describe('#17117 — POST /conversations/:id/participants', () => {
  it('le créateur d’une conversation externe n’y ajoute personne : 409, rien d’écrit', async () => {
    const { res, prisma } = await addParticipant(EXTERNAL_CONVERSATION_TYPE);

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ success: false, code: SINGLE_MEMBER });
    expect(prisma.participant.create).not.toHaveBeenCalled();
    expect(prisma.participant.update).not.toHaveBeenCalled();
  });

  it('un groupe est inchangé', async () => {
    const { res, prisma } = await addParticipant('group');

    expect(res.statusCode).toBe(200);
    expect(prisma.participant.create).toHaveBeenCalled();
  });
});

// ─── POST /conversations/:id/invite ──────────────────────────────────────────

async function invite(type: string) {
  let handler: any;
  const prisma: any = {
    conversation: {
      findUnique: jest.fn<any>().mockResolvedValue({
        id: CONV_ID, title: null, type, isActive: true, closedAt: null, communityId: null,
        participants: [{ id: 'p-opener', userId: OPENER, role: 'creator', displayName: 'Alice', user: { id: OPENER, username: 'alice', role: 'USER' } }],
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
  await handler({ params: { id: CONV_ID }, body: { userId: BOB }, authContext: asOpener }, reply);
  const status = reply.status.mock.calls.at(-1)?.[0] ?? reply.code.mock.calls.at(-1)?.[0] ?? 200;
  return { status, body: reply.send.mock.calls.at(-1)?.[0], prisma };
}

describe('#17117 — POST /conversations/:id/invite', () => {
  it('le créateur d’une conversation externe n’y invite personne : 409, rien d’écrit', async () => {
    const { status, body, prisma } = await invite(EXTERNAL_CONVERSATION_TYPE);

    expect(status).toBe(409);
    expect(body).toMatchObject({ success: false, code: SINGLE_MEMBER });
    expect(prisma.participant.create).not.toHaveBeenCalled();
  });

  it('un groupe est inchangé', async () => {
    const { status, prisma } = await invite('group');

    expect(status).toBe(200);
    expect(prisma.participant.create).toHaveBeenCalled();
  });
});

// ─── Création d'un lien de partage ───────────────────────────────────────────

async function mint(type: string) {
  const prisma: any = {
    conversation: { findUnique: jest.fn<any>(async () => ({ id: CONV_ID, type, title: null, isActive: true, closedAt: null })) },
    participant: { findFirst: jest.fn<any>(async () => ({ id: 'p-opener', role: 'creator', userId: OPENER, isActive: true })) },
    conversationShareLink: { create: jest.fn<any>(async (a: any) => ({ id: 'lnk', ...a?.data })) },
  };
  const reply: any = {};
  reply.status = jest.fn<any>(() => reply);
  reply.code = jest.fn<any>(() => reply);
  reply.send = jest.fn<any>(() => reply);
  const minted = await mintConversationShareLink({
    prisma, reply, log: { error: jest.fn<any>() }, notificationService: undefined, socketIOHandler: undefined,
    userId: OPENER, userRole: 'USER', input: { conversationId: CONV_ID, name: 'Lien' } as never,
  });
  return { minted, status: reply.status.mock.calls.at(-1)?.[0] ?? reply.code.mock.calls.at(-1)?.[0], body: reply.send.mock.calls.at(-1)?.[0], prisma };
}

describe('#17117 — créer un lien de partage', () => {
  it('le créateur d’une conversation externe n’en publie pas de lien : 409, aucun lien écrit', async () => {
    const { minted, status, body, prisma } = await mint(EXTERNAL_CONVERSATION_TYPE);

    expect(minted).toBeNull();
    expect(status).toBe(409);
    expect(body).toMatchObject({ success: false, code: SINGLE_MEMBER });
    expect(prisma.conversationShareLink.create).not.toHaveBeenCalled();
  });
});

// ─── Jonction par lien (défense en profondeur : un lien écrit avant la garde) ─

const shareLink = {
  id: '507f1f77bcf86cd7994390aa', linkId: 'mshy_link', identifier: 'lien', conversationId: CONV_ID, createdBy: OPENER,
  isActive: true, expiresAt: null, maxUses: null, currentUses: 0, maxConcurrentUsers: null, currentConcurrentUsers: 0,
  maxUniqueSessions: null, currentUniqueSessions: 0, requireAccount: false, requireNickname: false, requireEmail: false,
  requireBirthday: false, allowedCountries: [], allowedLanguages: [], allowedIpRanges: [],
  allowAnonymousMessages: true, allowAnonymousFiles: false, allowAnonymousImages: false, allowViewHistory: false,
  conversation: { id: CONV_ID, title: null, type: EXTERNAL_CONVERSATION_TYPE, isActive: true, closedAt: null, communityId: null },
};

async function joinByLink(identity: 'registered' | 'guest') {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const prisma: any = {
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
    (request as any).authContext = identity === 'registered'
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

describe('#17117 — jonction par lien', () => {
  it.each(['registered', 'guest'] as const)('un %s n’entre pas dans une conversation externe par un lien : 409, rien d’écrit', async (identity) => {
    const { res, prisma } = await joinByLink(identity);

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe(SINGLE_MEMBER);
    expect(prisma.participant.create).not.toHaveBeenCalled();
    expect(prisma.conversationShareLink.updateMany).not.toHaveBeenCalled();
  });
});

// ─── Fermer le fil efface l'adresse de l'ami ─────────────────────────────────

async function leaveAsLastMember(type: string) {
  const prisma: any = {
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue({ id: 'p-opener', conversationId: CONV_ID, userId: OPENER, role: 'creator', displayName: 'Alice', isActive: true }),
      count: jest.fn<any>().mockResolvedValue(0),
      findMany: jest.fn<any>().mockResolvedValue([]),
      update: jest.fn<any>().mockResolvedValue({}),
    },
    notification: { findMany: jest.fn<any>().mockResolvedValue([]) },
    conversation: {
      update: jest.fn<any>().mockResolvedValue({ id: CONV_ID, type, isActive: false, participants: [] }),
      count: jest.fn<any>().mockResolvedValue(0),
    },
    conversationShareLink: { updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }) },
    externalConversationPeer: { deleteMany: jest.fn<any>().mockResolvedValue({ count: 1 }) },
    $transaction: jest.fn<any>((ops: any) => Promise.all(ops)),
  };
  const app = Fastify({ logger: false });
  app.decorate('socketIOHandler', null as any);
  registerLeaveRoutes(app, prisma, jest.fn() as never, async (req: FastifyRequest) => { (req as any).authContext = asOpener; });
  await app.ready();
  try {
    const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/leave`, payload: {} });
    return { res, prisma };
  } finally {
    await app.close();
  }
}

describe('#17117 — fermer une conversation externe efface le numéro de l’ami', () => {
  it('la sortie du dernier membre efface l’adresse du pair', async () => {
    const { res, prisma } = await leaveAsLastMember(EXTERNAL_CONVERSATION_TYPE);

    expect(res.statusCode).toBe(200);
    expect(prisma.externalConversationPeer.deleteMany).toHaveBeenCalledWith({ where: { conversationId: CONV_ID } });
  });

  it('la sortie du dernier membre d’un groupe ne lit ni n’écrit aucune adresse de pair', async () => {
    const { res, prisma } = await leaveAsLastMember('group');

    expect(res.statusCode).toBe(200);
    expect(prisma.externalConversationPeer.deleteMany).not.toHaveBeenCalled();
  });
});
