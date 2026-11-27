/**
 * LES TROIS EXCLUSIONS DE BLOCAGE DU SALON SUR DEUX NŒUDS (#16800).
 *
 * La frappe, le regard et la position en direct excluent les pairs bloqués. Ils
 * composaient leur liste d'exclusion depuis `userSockets`, une carte PAR
 * PROCESSUS, alors que la diffusion traverse les instances (l'adaptateur Redis
 * est monté en production). Un pair bloqué attaché à l'AUTRE nœud n'entrait
 * donc jamais dans la liste : le blocage cessait en silence dès la deuxième
 * instance.
 *
 * Le monde : deux serveurs Socket.IO RÉELS reliés par un bus d'adaptateurs en
 * mémoire qui reproduit le contrat de `@socket.io/redis-adapter` — l'ensemble
 * `rooms` et l'ensemble `except` voyagent, et chaque nœud les résout chez lui.
 * Chaque nœud a ses PROPRES cartes, comme deux processus. Alice agit sur A ;
 * Bob (qu'elle a bloqué) et Carol (témoin) sont attachés à B.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { createServer, Server as HTTPServer } from 'http';
import { AddressInfo } from 'net';
import { Server as SocketIOServer, type Namespace } from 'socket.io';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { CLIENT_EVENTS, SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ConversationViewingHandler } from '../handlers/ConversationViewingHandler';
import { StatusHandler } from '../handlers/StatusHandler';
import { LocationHandler } from '../handlers/LocationHandler';
import { getSocketRateLimiter } from '../../utils/socket-rate-limiter';
import type { SocketUser } from '../utils/socket-helpers';
import { ADULT_BIRTH, messagingWorld } from '../../__tests__/helpers/messaging-circle-world';

const CONV = '507f1f77bcf86cd799439011';
const ALICE = '507f1f77bcf86cd7994390a1';
const BOB = '507f1f77bcf86cd7994390b2';
const CAROL = '507f1f77bcf86cd7994390c3';
const MEMBERS = [ALICE, BOB, CAROL];

type BroadcastOptions = { rooms: Set<string>; except?: Set<string>; flags?: Record<string, unknown> };
type BroadcastingAdapter = { broadcast(packet: Record<string, unknown>, opts: BroadcastOptions): void };
type AdapterConstructor = new (nsp: Namespace) => BroadcastingAdapter;

/**
 * Le contrat de `@socket.io/redis-adapter@8` (`dist/index.js:131-143`) : le
 * nœud qui reçoit une publication reconstruit `rooms` et `except` en `Set` et
 * diffuse LOCALEMENT. Une id de socket d'un autre nœud n'y résout rien ; une
 * room, si.
 */
function linkedAdapters(): AdapterConstructor {
  const Base = new SocketIOServer().of('/').adapter.constructor as AdapterConstructor;
  const nodes = new Set<BroadcastingAdapter>();
  return class LinkedAdapter extends Base {
    constructor(nsp: Namespace) {
      super(nsp);
      nodes.add(this);
    }

    broadcast(packet: Record<string, unknown>, opts: BroadcastOptions): void {
      for (const node of nodes) {
        const copy: BroadcastOptions = { rooms: new Set(opts.rooms), except: new Set(opts.except ?? []), flags: opts.flags };
        Base.prototype.broadcast.call(node, { ...packet }, copy);
      }
    }
  };
}

function world() {
  return messagingWorld({
    links: [
      [ALICE, BOB, 'ACQUAINTANCE'],
      [ALICE, CAROL, 'ACQUAINTANCE'],
    ],
    users: MEMBERS.map((id) => ({
      id,
      birthDate: ADULT_BIRTH,
      username: id,
      displayName: id,
      blockedUserIds: id === ALICE ? [BOB] : [],
    })),
    participants: MEMBERS.map((id, index) => ({
      id: `p${index}`,
      conversationId: CONV,
      userId: id,
      isActive: true,
      bannedAt: null,
      displayName: id,
      nickname: null,
    })),
    conversations: [{ id: CONV, identifier: 'rando', type: 'group', encryptionMode: null, isActive: true, closedAt: null }],
  }).prisma as unknown as PrismaClient;
}

type Node = {
  readonly http: HTTPServer;
  readonly io: SocketIOServer;
  readonly port: number;
  readonly status: StatusHandler;
};

async function startNode(adapter: AdapterConstructor, prisma: PrismaClient): Promise<Node> {
  const http = createServer();
  const io = new SocketIOServer(http, { adapter: adapter as never });
  const connectedUsers = new Map<string, SocketUser>();
  const socketToUser = new Map<string, string>();
  const userSockets = new Map<string, Set<string>>();
  const deps = { io: io as never, prisma, connectedUsers, socketToUser, userSockets };
  const viewing = new ConversationViewingHandler({
    ...deps,
    privacyPreferencesService: { shouldShowOnlineStatus: async () => true },
  });
  const status = new StatusHandler({
    ...deps,
    statusService: { updateLastSeen: () => undefined } as never,
    privacyPreferencesService: { shouldShowTypingIndicator: async () => true } as never,
  });
  const location = new LocationHandler({
    ...deps,
    normalizeConversationId: async (id: string) => id,
    engagement: null,
  });

  io.on('connection', async (socket) => {
    const userId = socket.handshake.auth.userId as string;
    await socket.join([ROOMS.user(userId), ROOMS.conversation(CONV)]);
    connectedUsers.set(userId, { id: userId, socketId: socket.id, isAnonymous: false, language: 'fr' } as SocketUser);
    socketToUser.set(socket.id, userId);
    userSockets.set(userId, new Set([...(userSockets.get(userId) ?? []), socket.id]));
    socket.on(CLIENT_EVENTS.VIEWING_START, (data: unknown) => void viewing.handleStart(socket as never, data).catch(() => undefined));
    socket.on(CLIENT_EVENTS.TYPING_START, (data: { conversationId: string }) => void status.handleTypingStart(socket as never, data).catch(() => undefined));
    socket.on(CLIENT_EVENTS.LOCATION_LIVE_START, (data: never) => void location.handleLiveLocationStart(socket as never, data).catch(() => undefined));
    socket.emit(SERVER_EVENTS.AUTHENTICATED, { success: true, user: { id: userId } });
  });

  const port = await new Promise<number>((resolve) => http.listen(0, () => resolve((http.address() as AddressInfo).port)));
  return { http, io, port, status };
}

type Received = { readonly event: string; readonly data: unknown };

describe('les exclusions de blocage du salon tiennent sur DEUX nœuds (#16800)', () => {
  const clients: ClientSocket[] = [];
  let nodeA: Node;
  let nodeB: Node;

  beforeAll(async () => {
    const adapter = linkedAdapters();
    const prisma = world();
    [nodeA, nodeB] = await Promise.all([startNode(adapter, prisma), startNode(adapter, prisma)]);
  });

  afterAll(async () => {
    for (const c of clients) c.disconnect();
    nodeA.status.destroy();
    nodeB.status.destroy();
    getSocketRateLimiter().destroy();
    for (const node of [nodeA, nodeB]) {
      node.io.close();
      await new Promise<void>((resolve) => node.http.close(() => resolve()));
    }
  });

  async function connect(node: Node, userId: string): Promise<{ socket: ClientSocket; received: Received[] }> {
    const socket = ioClient(`http://localhost:${node.port}`, { transports: ['websocket'], auth: { userId }, autoConnect: false, forceNew: true });
    const received: Received[] = [];
    socket.onAny((event: string, data: unknown) => received.push({ event, data }));
    const authenticated = new Promise<void>((resolve) => socket.once(SERVER_EVENTS.AUTHENTICATED, () => resolve()));
    socket.connect();
    await authenticated;
    clients.push(socket);
    return { socket, received };
  }

  const settle = () => new Promise((resolve) => setTimeout(resolve, 300));
  const events = (received: readonly Received[]) => received.map((r) => r.event);
  const FAMILIES = [SERVER_EVENTS.TYPING_START, SERVER_EVENTS.VIEWING_START, SERVER_EVENTS.LOCATION_LIVE_STARTED];

  it('un pair bloqué attaché à l\'autre nœud ne reçoit ni la frappe, ni le regard, ni la position ; le témoin les reçoit toutes', async () => {
    const alice = await connect(nodeA, ALICE);
    const bob = await connect(nodeB, BOB);
    const carol = await connect(nodeB, CAROL);
    await settle();

    alice.socket.emit(CLIENT_EVENTS.TYPING_START, { conversationId: CONV });
    alice.socket.emit(CLIENT_EVENTS.VIEWING_START, { conversationId: CONV });
    alice.socket.emit(CLIENT_EVENTS.LOCATION_LIVE_START, { conversationId: CONV, latitude: 48.8566, longitude: 2.3522, durationMinutes: 60 });
    await settle();

    expect(FAMILIES.filter((event) => events(carol.received).includes(event))).toEqual(FAMILIES);
    expect(FAMILIES.filter((event) => events(bob.received).includes(event))).toEqual([]);
  });
});
