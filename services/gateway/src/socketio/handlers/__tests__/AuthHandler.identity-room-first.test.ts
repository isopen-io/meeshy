/**
 * #16796 — une socket n'entre dans ses rooms de conversation qu'APRÈS sa room
 * d'identité `ROOMS.user(id)`, et jamais sans elle.
 *
 * Les signaux de salon (frappe, regard, position) excluent un pair bloqué par
 * sa room d'identité (#16800). Une socket présente dans une room de
 * conversation mais absente de sa room personnelle est donc INEXCLUABLE : elle
 * recevrait les annonces d'un compte qui l'a bloquée. `Promise.allSettled`
 * avalait l'échec de cette jonction et la suite rejoignait quand même les
 * conversations. Fail-closed : la room d'identité se réessaie, et si elle
 * reste impossible, aucune room de conversation n'est rejointe — la socket le
 * DIT (`allConversationRoomsUnreachable` / `unreachableConversations`), si bien
 * que la file hors ligne garde ses messages.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { AuthHandler } from '../AuthHandler';
import { LIVE_SID, liveSession } from '../../../services/auth/__tests__/live-session-double';
import type { Socket } from 'socket.io';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { StatusService } from '../../../services/StatusService';
import jwt from 'jsonwebtoken';

const USER_ID = 'aaaaaaaaaaaaaaaaaaaa0123';

const socketWith = (auth: Record<string, unknown>, join: jest.Mock): Socket => ({
  id: 'socket-123',
  handshake: { auth, headers: {} },
  emit: jest.fn(),
  join,
  leave: jest.fn(),
  on: jest.fn(),
  disconnect: jest.fn(),
} as unknown as Socket);

const joinFailingFor = (failing: (room: string) => boolean) =>
  jest.fn<any>().mockImplementation(async (room: string) => {
    if (failing(room)) throw new Error('adapter down');
  });

const conversationJoins = (join: jest.Mock) =>
  join.mock.calls.map(([room]) => String(room)).filter((room) => room.startsWith('conversation:'));

describe('AuthHandler — la room d’identité précède les rooms de conversation (#16796)', () => {
  let authHandler: AuthHandler;
  let prisma: PrismaClient;
  let connectedUsers: Map<string, any>;

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-key-for-unit-tests';
    prisma = {
      user: {
        findUnique: jest.fn<any>().mockResolvedValue({
          id: USER_ID, systemLanguage: 'en',
          regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null,
        }),
        update: jest.fn<any>().mockResolvedValue(undefined),
      },
      participant: {
        findFirst: jest.fn<any>().mockResolvedValue({
          id: 'anon-123', isActive: true, displayName: 'Anonymous',
          language: 'en', conversationId: 'conv-guest',
        }),
        findUnique: jest.fn(),
        findMany: jest.fn<any>().mockResolvedValue([{ conversationId: 'conv-aaa' }, { conversationId: 'conv-bbb' }]),
      },
      userSession: { findFirst: jest.fn(async () => liveSession()) },
      callParticipant: { findMany: jest.fn<any>().mockResolvedValue([]) },
    } as unknown as PrismaClient;
    connectedUsers = new Map();
    authHandler = new AuthHandler({
      prisma,
      statusService: {
        updateLastSeen: jest.fn(), noteHeartbeat: jest.fn(),
        markConnected: jest.fn(), markDisconnected: jest.fn(),
      } as unknown as StatusService,
      maintenanceService: {
        updateUserOnlineStatus: jest.fn<any>().mockResolvedValue(undefined),
        updateAnonymousOnlineStatus: jest.fn<any>().mockResolvedValue(undefined),
      },
      callService: { leaveCall: jest.fn<any>().mockResolvedValue(undefined) },
      connectedUsers,
      socketToUser: new Map(),
      userSockets: new Map(),
    } as any);
    jest.spyOn(jwt, 'verify').mockReturnValue({ sid: LIVE_SID, userId: USER_ID } as any);
  });

  afterEach(() => { jest.restoreAllMocks(); });

  const authenticateRegistered = (join: jest.Mock) =>
    authHandler.handleTokenAuthentication(socketWith({ token: 'valid-jwt-token' }, join));

  const authenticateGuest = (join: jest.Mock) =>
    authHandler.handleTokenAuthentication(socketWith({ sessionToken: 'anon-session-123' }, join));

  it('rejoint_la_room_d_identite_avant_toute_room_de_conversation', async () => {
    const join = joinFailingFor(() => false);

    await authenticateRegistered(join);

    const rooms = join.mock.calls.map(([room]) => String(room));
    const identity = rooms.indexOf(`user:${USER_ID}`);
    const firstConversation = rooms.findIndex((room) => room.startsWith('conversation:'));
    expect(identity).toBeGreaterThanOrEqual(0);
    expect(firstConversation).toBeGreaterThan(identity);
  });

  it('ne_rejoint_aucune_conversation_quand_la_room_d_identite_reste_impossible', async () => {
    const join = joinFailingFor((room) => room === `user:${USER_ID}`);

    await authenticateRegistered(join);

    expect(conversationJoins(join)).toEqual([]);
    expect(connectedUsers.get(USER_ID)?.allConversationRoomsUnreachable).toBe(true);
  });

  it('reessaie_la_room_d_identite_avant_de_renoncer', async () => {
    let identityAttempts = 0;
    const join = jest.fn<any>().mockImplementation(async (room: string) => {
      if (room === `user:${USER_ID}` && identityAttempts++ === 0) throw new Error('adapter blip');
    });

    await authenticateRegistered(join);

    expect(conversationJoins(join)).toEqual(['conversation:conv-aaa', 'conversation:conv-bbb']);
    expect(connectedUsers.get(USER_ID)?.allConversationRoomsUnreachable).toBeUndefined();
  });

  it('l_invite_sans_room_d_identite_ne_rejoint_pas_sa_conversation', async () => {
    const join = joinFailingFor((room) => room === 'user:anon-123');

    await authenticateGuest(join);

    expect(conversationJoins(join)).toEqual([]);
    expect(connectedUsers.get('anon-123')?.unreachableConversations).toEqual(new Set(['conv-guest']));
  });
});
