/**
 * « Est dans la conversation » (#8892) — de VRAIES sockets Socket.IO (client
 * et serveur réels, rooms réelles, validation Zod et limiteur réels) autour
 * du vrai `ConversationViewingHandler`. Seule la base est stubée.
 *
 * Le scénario est celui du porteur : quelqu'un a la conversation ouverte, un
 * autre arrive — il doit le voir tout de suite, sans que le premier ne bouge.
 *
 *   Bob ouvre la conversation ──viewing:start──▶ Alice (déjà connectée)
 *   Carol se connecte         ──viewing:snapshot [Bob]──▶ Carol, d'emblée
 *   Carol ouvre à son tour    ──viewing:start──▶ Alice et Bob
 *   Bob se déconnecte         ──viewing:stop──▶ Alice et Carol
 */

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { createServer, Server as HTTPServer } from 'http';
import { AddressInfo } from 'net';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { CLIENT_EVENTS, SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ConversationViewingHandler } from '../handlers/ConversationViewingHandler';
import { getSocketRateLimiter } from '../../utils/socket-rate-limiter';
import type { SocketUser } from '../utils/socket-helpers';

const CONV = '507f1f77bcf86cd799439011';
const ALICE = '507f1f77bcf86cd7994390a1';
const BOB = '507f1f77bcf86cd7994390b2';
const CAROL = '507f1f77bcf86cd7994390c3';
const MEMBERS = [ALICE, BOB, CAROL];

const prismaStub = {
  conversation: { findUnique: async () => null },
  participant: {
    findFirst: async ({ where }: { where: { userId?: string; conversationId?: string } }) =>
      where.conversationId === CONV && MEMBERS.includes(where.userId ?? '')
        ? { id: `p-${where.userId}`, displayName: where.userId, nickname: null }
        : null,
  },
  user: {
    findUnique: async () => ({ blockedUserIds: [] }),
    findMany: async () => [],
  },
} as unknown as PrismaClient;

type Received = { readonly event: string; readonly data: unknown };

function nextEvent<T = unknown>(socket: ClientSocket, event: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), 5_000);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

describe('« Est dans la conversation » — e2e sur de vraies sockets', () => {
  let httpServer: HTTPServer;
  let io: SocketIOServer;
  let port: number;
  const clients: ClientSocket[] = [];

  beforeAll(async () => {
    httpServer = createServer();
    io = new SocketIOServer(httpServer);
    const connectedUsers = new Map<string, SocketUser>();
    const socketToUser = new Map<string, string>();
    const userSockets = new Map<string, Set<string>>();
    const handler = new ConversationViewingHandler({
      io: io as never,
      prisma: prismaStub,
      privacyPreferencesService: { shouldShowOnlineStatus: async () => true },
      connectedUsers,
      socketToUser,
      userSockets,
    });

    /* Miroir de l'authentification de MeeshySocketIOManager / AuthHandler :
       rooms jointes, maps posées, `authenticated`, PUIS les instantanés. */
    io.on('connection', async (socket) => {
      const userId = socket.handshake.auth.userId as string;
      connectedUsers.set(userId, { id: userId, socketId: socket.id, isAnonymous: false, language: 'fr' } as SocketUser);
      socketToUser.set(socket.id, userId);
      userSockets.set(userId, new Set([...(userSockets.get(userId) ?? []), socket.id]));
      socket.on(CLIENT_EVENTS.VIEWING_START, (data: unknown) => void handler.handleStart(socket as never, data).catch(() => undefined));
      socket.on(CLIENT_EVENTS.VIEWING_STOP, (data: unknown) => void handler.handleStop(socket as never, data).catch(() => undefined));
      socket.on('disconnecting', () => {
        userSockets.get(userId)?.delete(socket.id);
        void handler.handleSocketDisconnecting(socket.id).catch(() => undefined);
      });
      await socket.join([ROOMS.user(userId), ROOMS.conversation(CONV)]);
      socket.emit(SERVER_EVENTS.AUTHENTICATED, { success: true, user: { id: userId } });
      await handler.emitRoomSnapshots(socket as never);
    });

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        port = (httpServer.address() as AddressInfo).port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    for (const c of clients) c.disconnect();
    getSocketRateLimiter().destroy();
    io?.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  /** Connecte en journalisant TOUT ce que la socket reçoit dès le premier
   * octet — les écouteurs sont posés avant la connexion, comme un client. */
  async function connect(userId: string): Promise<{ socket: ClientSocket; received: Received[] }> {
    const socket = ioClient(`http://localhost:${port}`, { transports: ['websocket'], auth: { userId }, autoConnect: false });
    const received: Received[] = [];
    socket.onAny((event: string, data: unknown) => received.push({ event, data }));
    const authenticated = nextEvent(socket, SERVER_EVENTS.AUTHENTICATED);
    socket.connect();
    await authenticated;
    clients.push(socket);
    return { socket, received };
  }

  const settle = () => new Promise((resolve) => setTimeout(resolve, 150));
  const viewing = (received: readonly Received[]) =>
    received.filter((r) => r.event.startsWith('viewing:')).map((r) => [r.event, r.data]);

  it('celui qui arrive voit tout de suite qui est déjà dans la conversation, et chacun voit les allées et venues', async () => {
    const alice = await connect(ALICE);
    const bob = await connect(BOB);

    const bobArrives = nextEvent(alice.socket, SERVER_EVENTS.VIEWING_START);
    bob.socket.emit(CLIENT_EVENTS.VIEWING_START, { conversationId: CONV });
    expect(await bobArrives).toEqual({ userId: BOB, conversationId: CONV });

    const carol = await connect(CAROL);
    await settle();
    expect(viewing(carol.received)).toEqual([[SERVER_EVENTS.VIEWING_SNAPSHOT, { conversationId: CONV, userIds: [BOB] }]]);
    const authenticatedAt = carol.received.findIndex((r) => r.event === SERVER_EVENTS.AUTHENTICATED);
    const snapshotAt = carol.received.findIndex((r) => r.event === SERVER_EVENTS.VIEWING_SNAPSHOT);
    expect(snapshotAt).toBeGreaterThan(authenticatedAt);

    const carolSeenByAlice = nextEvent(alice.socket, SERVER_EVENTS.VIEWING_START);
    const carolSeenByBob = nextEvent(bob.socket, SERVER_EVENTS.VIEWING_START);
    carol.socket.emit(CLIENT_EVENTS.VIEWING_START, { conversationId: CONV });
    expect(await carolSeenByAlice).toEqual({ userId: CAROL, conversationId: CONV });
    expect(await carolSeenByBob).toEqual({ userId: CAROL, conversationId: CONV });

    const bobLeavesForAlice = nextEvent(alice.socket, SERVER_EVENTS.VIEWING_STOP);
    const bobLeavesForCarol = nextEvent(carol.socket, SERVER_EVENTS.VIEWING_STOP);
    bob.socket.disconnect();
    expect(await bobLeavesForAlice).toEqual({ userId: BOB, conversationId: CONV });
    expect(await bobLeavesForCarol).toEqual({ userId: BOB, conversationId: CONV });

    await settle();
    expect(viewing(alice.received).some(([event, data]) => event === SERVER_EVENTS.VIEWING_START && (data as { userId: string }).userId === ALICE)).toBe(false);
  });
});
