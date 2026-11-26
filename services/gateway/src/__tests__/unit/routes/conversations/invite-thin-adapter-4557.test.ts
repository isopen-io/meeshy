/**
 * #4557, critère 2 — **`POST /conversations/:id/invite` est un ADAPTATEUR de la
 * porte d'ajout, jamais une copie.**
 *
 * Les deux portes faisaient entrer la même personne par deux implémentations :
 * l'invitation n'écrivait pas `avatar` sur la ligne, posait `isActive` à la main,
 * prévenait l'invité par une notification propre et ne prévenait pas les
 * membres présents. Chaque divergence était une règle retapée une fois de trop.
 *
 * Ce fichier COMPARE les deux portes sur la même personne et la même
 * conversation — un témoin posé sur une seule ne rougirait pas d'une
 * redivergence — puis vérifie que l'invitation garde sa réponse historique
 * (`participant` + `message`) et ses refus d'erreur, que ses appelants
 * éventuels lisent encore.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const mockResolveConversationId = jest.fn<any>();
const mockSendSuccess = jest.fn<any>((reply: any) => reply);
const mockSendNotFound = jest.fn<any>((reply: any) => reply);
const mockSendBadRequest = jest.fn<any>((reply: any) => reply);
const mockSendForbidden = jest.fn<any>((reply: any) => reply);
const mockSendError = jest.fn<any>((reply: any) => reply);
const mockSendInternalError = jest.fn<any>((reply: any) => reply);

jest.mock('../../../../services/messaging/messageRequests', () => ({
  ...jest.requireActual<object>('../../../../services/messaging/messageRequests'),
  decideDirectOpening: jest.fn(async () => ({ kind: 'direct' })),
}));
jest.mock('../../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: any[]) => mockResolveConversationId(...args),
}));
jest.mock('../../../../utils/response', () => ({
  sendSuccess: (...args: any[]) => mockSendSuccess(...args),
  sendBadRequest: (...args: any[]) => mockSendBadRequest(...args),
  sendUnauthorized: jest.fn<any>((reply: any) => reply),
  sendForbidden: (...args: any[]) => mockSendForbidden(...args),
  sendNotFound: (...args: any[]) => mockSendNotFound(...args),
  sendConflict: jest.fn<any>((reply: any) => reply),
  sendInternalError: (...args: any[]) => mockSendInternalError(...args),
  sendError: (...args: any[]) => mockSendError(...args),
}));
jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn<any>().mockReturnValue({
      error: jest.fn<any>(), info: jest.fn<any>(), warn: jest.fn<any>(), debug: jest.fn<any>(),
    }),
  },
}));
jest.mock('../../../../utils/participant-lookup-cache', () => ({ invalidateParticipantLookup: jest.fn<any>() }));
jest.mock('../../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: jest.fn<any>().mockReturnValue({
    resolveForTarget: jest.fn<any>().mockResolvedValue({ showOnline: false, showLastActive: false }),
    filterPresenceForViewer: jest.fn<any>((_viewer: any, rows: any) => rows),
  }),
}));
jest.mock('../../../../services/achievements/CerclesAchievements', () => ({
  CerclesAchievements: jest.fn().mockImplementation(() => ({ recordEvent: jest.fn<any>().mockResolvedValue(undefined) })),
}));
jest.mock('@meeshy/shared/types/api-schemas', () => ({
  conversationSchema: { type: 'object' },
  conversationParticipantSchema: { type: 'object' },
  conversationResponseSchema: { type: 'object' },
  errorResponseSchema: { type: 'object' },
}));

import { registerInviteRoute } from '../../../../routes/conversations/sharing-invite';
import { registerParticipantWriteRoutes } from '../../../../routes/conversations/participants-writes';

const CONV_ID = '507f1f77bcf86cd799439011';
const ACTOR_ID = '507f1f77bcf86cd799439022';
const TARGET_ID = '507f1f77bcf86cd799439033';
const ACTOR_ROW_ID = '507f1f77bcf86cd799439077';
const OTHER_ID = '507f1f77bcf86cd799439044';

const noop = jest.fn<any>((reply: any) => reply);

const targetUser = () => ({
  id: TARGET_ID, username: 'target', displayName: 'Target', avatar: 'https://cdn/target.png',
  systemLanguage: 'es', regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null,
  firstName: 'T', lastName: 'Arget', role: 'USER', deactivatedAt: null,
  createdAt: new Date('2025-01-01'), updatedAt: new Date('2025-01-01'),
});

type Situation = 'nouveau' | 'deja-membre' | 'inconnu';

function buildWorld(situation: Situation) {
  const actorRow = {
    id: ACTOR_ROW_ID, userId: ACTOR_ID, conversationId: CONV_ID, role: 'moderator', type: 'user',
    isActive: true, bannedAt: null, displayName: 'Actor', joinedAt: new Date('2026-01-01'),
    user: { id: ACTOR_ID, username: 'actor', role: 'USER' },
  };
  const otherRow = { ...actorRow, id: 'other-row', userId: OTHER_ID, role: 'member', displayName: 'Other' };
  const targetRow = { ...actorRow, id: 'target-row', userId: TARGET_ID, role: 'member', displayName: 'Target' };
  const rows: any[] = situation === 'deja-membre' ? [actorRow, otherRow, targetRow] : [actorRow, otherRow];
  const created: any[] = [];

  const matches = (row: any, where: any) =>
    (where?.userId === undefined || (typeof where.userId === 'string' ? where.userId === row.userId : !(where.userId.notIn ?? []).includes(row.userId)))
    && (where?.conversationId === undefined || where.conversationId === row.conversationId)
    && (where?.isActive === undefined || where.isActive === row.isActive)
    && (where?.id === undefined || where.id === row.id);

  const prisma = {
    conversation: {
      findUnique: jest.fn<any>(async (args: any) => ({
        id: CONV_ID, type: 'group', title: 'Groupe', isActive: true, closedAt: null, communityId: null,
        encryptionMode: null, createdAt: new Date('2025-01-01'),
        participants: rows.filter((row) => matches(row, args?.include?.participants?.where)),
      })),
      update: jest.fn<any>().mockResolvedValue({ id: CONV_ID }),
    },
    participant: {
      findFirst: jest.fn<any>(async (args: any) => [...rows, ...created].find((row) => matches(row, args?.where)) ?? null),
      findUnique: jest.fn<any>(async (args: any) => {
        const row = [...rows, ...created].find((r) => r.id === args?.where?.id);
        return row ? { ...row, user: targetUser() } : null;
      }),
      findMany: jest.fn<any>(async (args: any) => [...rows, ...created].filter((row) => matches(row, args?.where))),
      create: jest.fn<any>(async (args: any) => {
        const row = { id: 'created-row', isActive: true, ...args?.data };
        created.push(row);
        return { ...row, user: targetUser() };
      }),
      update: jest.fn<any>(async (args: any) => ({ id: args?.where?.id, ...args?.data, user: targetUser() })),
      count: jest.fn<any>().mockResolvedValue(rows.length + 1),
    },
    user: {
      findUnique: jest.fn<any>(async () => (situation === 'inconnu' ? null : targetUser())),
      findFirst: jest.fn<any>(async () => (situation === 'inconnu' ? null : targetUser())),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    message: { create: jest.fn<any>(async (args: any) => ({ id: 'sys-row', ...args?.data })) },
  } as any;

  const emitted: string[] = [];
  const io = { to: jest.fn<any>(() => ({ emit: jest.fn<any>((event: string) => { emitted.push(event); }) })) };
  const manager = {
    getIO: jest.fn<any>().mockReturnValue(io),
    joinUserToConversationRoom: jest.fn<any>().mockResolvedValue(undefined),
    broadcastMessage: jest.fn<any>().mockResolvedValue(undefined),
  };
  const notificationService = {
    createMemberJoinedNotification: jest.fn<any>().mockResolvedValue(undefined),
    createMemberJoinedNotificationsBatch: jest.fn<any>().mockResolvedValue(0),
    createConversationInviteNotification: jest.fn<any>().mockResolvedValue(undefined),
    createAddedToConversationNotification: jest.fn<any>().mockResolvedValue(undefined),
  };
  const routes: { method: string; path: string; handler: any }[] = [];
  const register = (method: string) => jest.fn<any>((path: string, options: any, handler: any) => {
    routes.push({ method, path, handler: handler ?? options.handler ?? options });
  });
  const fastify = {
    routes, prisma, notificationService,
    mentionService: { invalidateCacheForConversation: jest.fn<any>().mockResolvedValue(undefined) },
    socketIOHandler: { getManager: jest.fn<any>().mockReturnValue(manager) },
    get: register('GET'), post: register('POST'), patch: register('PATCH'), delete: register('DELETE'),
  } as any;
  const engagement = { recordActivity: jest.fn<any>().mockResolvedValue(undefined) };

  return { prisma, fastify, manager, notificationService, emitted, engagement };
}

async function enterThrough(porte: 'invite' | 'participants', situation: Situation = 'nouveau') {
  const world = buildWorld(situation);
  registerInviteRoute(world.fastify, world.prisma, world.engagement);
  registerParticipantWriteRoutes(world.fastify, world.prisma, noop, world.engagement);
  const fragment = porte === 'invite' ? ':id/invite' : ':id/participants';
  const route = world.fastify.routes.find((r: any) => r.method === 'POST' && r.path.endsWith(fragment));
  if (!route) throw new Error(`POST *${fragment} introuvable`);

  const reply: any = { status: jest.fn<any>(), send: jest.fn<any>() };
  reply.status.mockReturnValue(reply);
  await route.handler({
    params: { id: CONV_ID }, body: { userId: TARGET_ID }, headers: {}, ip: '127.0.0.1',
    authContext: {
      type: 'user', userId: ACTOR_ID, isAuthenticated: true, isAnonymous: false,
      registeredUser: { id: ACTOR_ID, role: 'USER' },
    },
    user: { userId: ACTOR_ID },
  }, reply);

  const notified = Object.entries(world.notificationService)
    .filter(([, fn]) => (fn as jest.Mock).mock.calls.length > 0)
    .map(([name]) => name)
    .sort();
  const writtenRow = world.prisma.participant.create.mock.calls[0]?.[0]?.data;
  return { world, notified, writtenRow };
}

function withoutClock(data: Record<string, unknown> | undefined) {
  if (!data) return data;
  const { joinedAt: _joinedAt, ...rest } = data;
  return rest;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockResolveConversationId.mockResolvedValue(CONV_ID);
});

describe('#4557 — invite et participants font entrer la personne par la MÊME admission', () => {
  it('écrivent la même ligne, champ par champ (langue du prisme, avatar, droits)', async () => {
    const parInvite = await enterThrough('invite');
    const parParticipants = await enterThrough('participants');

    expect(parInvite.writtenRow).toBeDefined();
    expect(withoutClock(parInvite.writtenRow)).toEqual(withoutClock(parParticipants.writtenRow));
  });

  it('émettent les mêmes diffusions d\'arrivée, dans le même ordre', async () => {
    const parInvite = await enterThrough('invite');
    const parParticipants = await enterThrough('participants');

    expect(parParticipants.world.emitted.length).toBeGreaterThan(0);
    expect(parInvite.world.emitted).toEqual(parParticipants.world.emitted);
    expect(parInvite.world.manager.joinUserToConversationRoom).toHaveBeenCalledWith(TARGET_ID, CONV_ID);
    expect(parInvite.world.manager.broadcastMessage.mock.calls.length)
      .toBe(parParticipants.world.manager.broadcastMessage.mock.calls.length);
  });

  it('préviennent les mêmes personnes, par les mêmes notifications — les membres présents compris', async () => {
    const parInvite = await enterThrough('invite');
    const parParticipants = await enterThrough('participants');

    expect(parInvite.notified).toEqual(parParticipants.notified);
    expect(parInvite.notified).toContain('createMemberJoinedNotificationsBatch');
  });
});

describe('#4557 — l\'invitation garde son contrat historique', () => {
  it('rend `participant` (la ligne écrite) et `message`', async () => {
    await enterThrough('invite');

    expect(mockSendSuccess).toHaveBeenCalledTimes(1);
    const body = mockSendSuccess.mock.calls[0][1] as { participant: { id: string }; message: string };
    expect(body.participant.id).toBe('created-row');
    expect(body.message).toContain('Target');
  });

  it('un déjà membre reste un 400, sans ligne écrite', async () => {
    const { world } = await enterThrough('invite', 'deja-membre');

    expect(mockSendBadRequest).toHaveBeenCalled();
    expect(mockSendSuccess).not.toHaveBeenCalled();
    expect(world.prisma.participant.create).not.toHaveBeenCalled();
  });

  it('un inconnu reste un 404, sans ligne écrite', async () => {
    const { world } = await enterThrough('invite', 'inconnu');

    expect(mockSendNotFound).toHaveBeenCalled();
    expect(world.prisma.participant.create).not.toHaveBeenCalled();
  });
});

describe('#4557 — l\'adaptateur ne recopie pas l\'admission', () => {
  const source = readFileSync(join(__dirname, '../../../../routes/conversations/sharing-invite.ts'), 'utf8');

  it('appelle le site unique', () => {
    expect(source).toContain('admitConversationMember(');
  });

  it('n\'écrit aucune ligne Participant lui-même', () => {
    expect(source).not.toMatch(/participant\.(create|update|upsert)\(/);
    expect(source).not.toContain('commitParticipantRejoin');
  });
});
