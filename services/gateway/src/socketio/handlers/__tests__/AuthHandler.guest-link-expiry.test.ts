/**
 * #10437 — un invité dont le lien de partage a EXPIRÉ perd sa room socket.
 *
 * Avant : la porte `SHARE_LINK_EXPIRED` vivait route par route, en REST. Le
 * socket de l'invité restait dans `ROOMS.conversation(...)` et recevait chaque
 * `message:new` ; à la reconnexion, `_authenticateAnonymousUser` (la porte
 * invitée — c'est elle, et non `_joinUserConversations`, qui joint la room
 * d'un invité) le remettait dans la room sans regarder le lien.
 *
 * Désormais :
 * - à la connexion (et à la reconnexion), un lien échu refuse la session :
 *   `error { code: SHARE_LINK_EXPIRED }`, déconnexion, aucune room ;
 * - une session DÉJÀ connectée est sortie À L'ÉCHÉANCE par un minuteur armé à
 *   l'authentification (même patron que l'expiration du JWT,
 *   `_scheduleTokenExpiry`), qui RELIT le lien quand il sonne : un lien
 *   prolongé entre-temps réarme, un lien échu coupe le socket.
 *
 * Le double de Prisma JUGE chaque `where` contre des documents.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { AuthHandler } from '../AuthHandler';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { StatusService } from '../../../services/StatusService';
import { hashSessionToken } from '../../../utils/session-token';
import { matchesMongoWhere, type MongoDocument } from '../../../__tests__/helpers/mongo-where';

const TOKEN = 'anon-session-expiry';
const LINK_ID = '507f1f77bcf86cd799439033';
const CONV_ID = '507f1f77bcf86cd799439022';
const GUEST_ID = '507f1f77bcf86cd799439011';
const NOW = new Date('2026-10-13T10:00:00Z');
const HOUR = 60 * 60 * 1000;

type World = { participants: MongoDocument[]; links: MongoDocument[]; linkReadFails: boolean };

function guestRow(): MongoDocument {
  return {
    id: GUEST_ID,
    conversationId: CONV_ID,
    type: 'anonymous',
    sessionTokenHash: hashSessionToken(TOKEN),
    isActive: true,
    displayName: 'Invité',
    language: 'fr',
    shareLinkId: LINK_ID,
    anonymousSession: { shareLinkId: LINK_ID },
  };
}

function buildHandler(world: World) {
  const prisma = {
    participant: {
      findFirst: jest.fn(async ({ where }: { where: MongoDocument }) =>
        world.participants.find((row) => matchesMongoWhere(row, where)) ?? null
      ),
      findMany: jest.fn(async () => []),
    },
    conversationShareLink: {
      findUnique: jest.fn(async ({ where }: { where: MongoDocument }) => {
        if (world.linkReadFails) throw new Error('mongo down');
        return world.links.find((row) => matchesMongoWhere(row, where)) ?? null;
      }),
    },
    callParticipant: { findMany: jest.fn(async () => []) },
  } as unknown as PrismaClient;

  const connectedUsers = new Map<string, unknown>();
  const handler = new AuthHandler({
    prisma,
    statusService: { updateLastSeen: jest.fn(), noteHeartbeat: jest.fn(), markConnected: jest.fn(), markDisconnected: jest.fn() } as unknown as StatusService,
    maintenanceService: { updateUserOnlineStatus: jest.fn(async () => undefined), updateAnonymousOnlineStatus: jest.fn(async () => undefined) } as never,
    callService: { leaveCall: jest.fn(async () => undefined) } as never,
    connectedUsers: connectedUsers as never,
    socketToUser: new Map(),
    userSockets: new Map(),
  });
  return { handler, connectedUsers };
}

function guestSocket() {
  const disconnectListeners: Array<() => void> = [];
  const socket = {
    id: 'socket-guest',
    handshake: { auth: { sessionToken: TOKEN }, headers: {} },
    emit: jest.fn(),
    join: jest.fn(async () => undefined),
    leave: jest.fn(),
    on: jest.fn((event: string, listener: () => void) => {
      if (event === 'disconnect') disconnectListeners.push(listener);
    }),
    disconnect: jest.fn(() => disconnectListeners.forEach((listener) => listener())),
  };
  return socket;
}

const expiredError = (socket: ReturnType<typeof guestSocket>) =>
  socket.emit.mock.calls.filter(([event, data]) => event === 'error' && (data as { code?: string })?.code === 'SHARE_LINK_EXPIRED');

const joinedConversationRoom = (socket: ReturnType<typeof guestSocket>) =>
  socket.join.mock.calls.some(([room]) => room === `conversation:${CONV_ID}`);

describe('AuthHandler — un lien de partage expiré sort l’invité de sa room (#10437)', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('refuse à la (re)connexion la session d’un invité dont le lien a expiré : aucune room, socket coupé', async () => {
    const world: World = { participants: [guestRow()], links: [{ id: LINK_ID, expiresAt: new Date(NOW.getTime() - HOUR) }], linkReadFails: false };
    const { handler, connectedUsers } = buildHandler(world);
    const socket = guestSocket();

    await handler.handleTokenAuthentication(socket as never);

    expect(expiredError(socket)).toHaveLength(1);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(joinedConversationRoom(socket)).toBe(false);
    expect(connectedUsers.size).toBe(0);
  });

  it('refuse la session quand le lien est illisible — fail-closed', async () => {
    const world: World = { participants: [guestRow()], links: [], linkReadFails: true };
    const { handler } = buildHandler(world);
    const socket = guestSocket();

    await handler.handleTokenAuthentication(socket as never);

    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(joinedConversationRoom(socket)).toBe(false);
  });

  it('admet un invité au lien vivant, puis le coupe À L’ÉCHÉANCE du lien', async () => {
    const world: World = { participants: [guestRow()], links: [{ id: LINK_ID, expiresAt: new Date(NOW.getTime() + HOUR) }], linkReadFails: false };
    const { handler } = buildHandler(world);
    const socket = guestSocket();

    await handler.handleTokenAuthentication(socket as never);
    expect(joinedConversationRoom(socket)).toBe(true);
    expect(socket.disconnect).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(HOUR - 1000);
    expect(socket.disconnect).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(2000);
    expect(expiredError(socket)).toHaveLength(1);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('relit le lien à l’échéance : un lien PROLONGÉ entre-temps réarme au lieu de couper', async () => {
    const world: World = { participants: [guestRow()], links: [{ id: LINK_ID, expiresAt: new Date(NOW.getTime() + HOUR) }], linkReadFails: false };
    const { handler } = buildHandler(world);
    const socket = guestSocket();

    await handler.handleTokenAuthentication(socket as never);
    world.links[0] = { id: LINK_ID, expiresAt: new Date(NOW.getTime() + 3 * HOUR) };

    await jest.advanceTimersByTimeAsync(2 * HOUR);
    expect(socket.disconnect).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(2 * HOUR);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('n’arme rien pour un lien sans échéance', async () => {
    const world: World = { participants: [guestRow()], links: [{ id: LINK_ID }], linkReadFails: false };
    const { handler } = buildHandler(world);
    const socket = guestSocket();

    await handler.handleTokenAuthentication(socket as never);
    await jest.advanceTimersByTimeAsync(400 * 24 * HOUR);

    expect(joinedConversationRoom(socket)).toBe(true);
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('désarme le minuteur quand le socket part avant l’échéance', async () => {
    const world: World = { participants: [guestRow()], links: [{ id: LINK_ID, expiresAt: new Date(NOW.getTime() + HOUR) }], linkReadFails: false };
    const { handler } = buildHandler(world);
    const socket = guestSocket();

    await handler.handleTokenAuthentication(socket as never);
    socket.disconnect();
    socket.disconnect.mockClear();

    await jest.advanceTimersByTimeAsync(2 * HOUR);
    expect(expiredError(socket)).toHaveLength(0);
    expect(socket.disconnect).not.toHaveBeenCalled();
  });
});
