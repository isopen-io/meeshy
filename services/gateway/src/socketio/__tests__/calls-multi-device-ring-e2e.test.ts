/**
 * UN APPELÉ À PLUSIEURS APPAREILS DÉCROCHE SUR CELUI QU'IL VEUT (#11468).
 *
 * Recette staging du 2026-10-21, appel `6ad8fddeb91996bb0ad3745f` : l'appelé
 * est connecté sur trois appareils, chacun rejoint la room de l'appel dès la
 * sonnerie. La règle C8 ne gardait que la DERNIÈRE socket arrivée ; l'offre de
 * l'appelant ne partait qu'à elle. L'appareil qui a décroché, arrivé 4 ms plus
 * tôt, attendait une offre qui ne venait jamais, et l'appel finissait « manqué ».
 * La passerelle rediffusait en plus `call:participant-joined` à chaque arrivée :
 * l'appelant web détruisait son lien et envoyait une seconde offre.
 *
 * VRAIES sockets (client et serveur Socket.IO, rooms réelles, validation Zod
 * réelle) ; seul le CallService est simulé, et il tient l'état que la base
 * tiendrait : qui a déjà rejoint, et si l'appel est décroché.
 */

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { createServer, Server as HTTPServer } from 'http';
import { AddressInfo } from 'net';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { CallEventsHandler } from '../CallEventsHandler';
import { getSocketRateLimiter } from '../../utils/socket-rate-limiter';
import { CALL_EVENTS } from '@meeshy/shared/types/video-call';
import { ROOMS } from '@meeshy/shared/types/socketio-events';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { CallService } from '../../services/CallService';
import { openCallRingTables } from '../../__tests__/helpers/call-ring-policy-tables';

const CONV_ID = '507f1f77bcf86cd799439042';
const CALLER = 'user-caller';
const CALLEE = 'user-callee';
const SDP = 'v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111';
const SETTLE_MS = 250;

type Received = { readonly event: string; readonly payload: { readonly signal?: { readonly type: string; readonly candidate?: string } } };
type CallState = { answeredAt: Date | null; readonly joined: Set<string> };

function row(callId: string, id: string, participantId: string, userId: string) {
  return {
    id,
    callSessionId: callId,
    participantId,
    role: 'participant',
    joinedAt: new Date(),
    leftAt: null,
    isAudioEnabled: true,
    isVideoEnabled: false,
    connectionQuality: null,
    participant: { userId, displayName: userId, user: { username: userId, displayName: userId, avatar: null } },
  };
}

const calls = new Map<string, CallState>();
let nextCallId = '';

const stateOf = (callId: string): CallState => {
  const existing = calls.get(callId);
  if (existing) return existing;
  const created: CallState = { answeredAt: null, joined: new Set([CALLER]) };
  calls.set(callId, created);
  return created;
};

const session = (callId: string) => ({
  id: callId,
  conversationId: CONV_ID,
  mode: 'p2p',
  status: stateOf(callId).answeredAt ? 'active' : 'ringing',
  metadata: { type: 'audio' },
  initiatorId: CALLER,
  answeredAt: stateOf(callId).answeredAt,
  initiator: { id: CALLER, username: 'caller', displayName: 'Caller', avatar: null },
  conversation: { type: 'direct' },
  participants: [row(callId, 'cp-caller', 'p-caller', CALLER), row(callId, 'cp-callee', 'p-callee', CALLEE)],
});

const callServiceStub = {
  initiateCall: async () => session(nextCallId),
  joinCall: async ({ callId, userId }: { callId: string; userId: string }) => {
    const rejoined = stateOf(callId).joined.has(userId);
    stateOf(callId).joined.add(userId);
    return { callSession: session(callId), iceServers: [], rejoined };
  },
  getCallSession: async (callId: string) => session(callId),
  generateIceServers: () => [],
  getIceServerTtl: () => 86400,
  scheduleRingingTimeout: () => undefined,
  clearRingingTimeout: () => undefined,
  updateCallStatus: async (callId: string, status: string) => {
    if (status === 'active' && !stateOf(callId).answeredAt) stateOf(callId).answeredAt = new Date();
  },
  createCallSummaryMessage: async () => null,
  createLiveCallMessage: async () => null,
  persistCallStats: async () => undefined,
} as unknown as CallService;

const prismaStub = {
  ...openCallRingTables(),
  participant: { findFirst: async () => ({ id: 'p-callee' }), findMany: async () => [{ userId: CALLEE }] },
  callSession: { findUnique: async () => ({ conversationId: CONV_ID }) },
  user: { findMany: async () => [] },
} as unknown as PrismaClient;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function connect(port: number, userId: string): Promise<ClientSocket> {
  const socket = ioClient(`http://localhost:${port}`, { transports: ['websocket'], auth: { userId } });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('connect timeout')), 5_000);
    socket.on('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
  });
}

function record(socket: ClientSocket): Received[] {
  const received: Received[] = [];
  socket.onAny((event: string, payload: Received['payload']) => received.push({ event, payload }));
  return received;
}

function ack<T>(socket: ClientSocket, event: string, payload: unknown): Promise<T> {
  return new Promise<T>((resolve) => socket.emit(event, payload, resolve));
}

const signalsOf = (received: Received[]) =>
  received.filter((r) => r.event === CALL_EVENTS.SIGNAL).map((r) => r.payload.signal?.type === 'ice-candidate' ? r.payload.signal.candidate : r.payload.signal?.type);
const joinedCount = (received: Received[]) => received.filter((r) => r.event === CALL_EVENTS.PARTICIPANT_JOINED).length;

const offer = { type: 'offer', from: CALLER, to: CALLEE, sdp: SDP };
const candidate = (n: number) => ({ type: 'ice-candidate', from: CALLER, to: CALLEE, candidate: `candidate:${n} 1 udp 2122260223 10.0.0.${n} 5000${n} typ host`, sdpMid: '0', sdpMLineIndex: 0 });

describe('Appels — l’appelé à plusieurs appareils (#11468)', () => {
  let httpServer: HTTPServer;
  let io: SocketIOServer;
  let handler: CallEventsHandler;
  let port: number;
  const clients: ClientSocket[] = [];

  beforeAll(async () => {
    httpServer = createServer();
    io = new SocketIOServer(httpServer);
    handler = new CallEventsHandler(prismaStub, callServiceStub);
    const userBySocket = new Map<string, string>();
    io.on('connection', (socket) => {
      const userId = socket.handshake.auth.userId as string;
      userBySocket.set(socket.id, userId);
      void socket.join(ROOMS.user(userId));
      handler.setupCallEvents(socket, io, (socketId) => userBySocket.get(socketId));
    });
    await new Promise<void>((resolve) => httpServer.listen(0, () => {
      port = (httpServer.address() as AddressInfo).port;
      resolve();
    }));
  });

  afterAll(async () => {
    clients.forEach((c) => c.disconnect());
    handler?.destroy();
    getSocketRateLimiter().destroy();
    io?.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  const device = async (userId: string) => {
    const socket = await connect(port, userId);
    clients.push(socket);
    return { socket, received: record(socket) };
  };

  const ringing = async (callId: string) => {
    nextCallId = callId;
    const caller = await device(CALLER);
    const answering = await device(CALLEE);
    const other = await device(CALLEE);
    await ack(caller.socket, CALL_EVENTS.INITIATE, { conversationId: CONV_ID, type: 'audio' });
    const firstJoin = ack(answering.socket, CALL_EVENTS.JOIN, { callId });
    await sleep(4);
    const secondJoin = ack(other.socket, CALL_EVENTS.JOIN, { callId });
    await Promise.all([firstJoin, secondJoin]);
    await sleep(SETTLE_MS);
    return { caller, answering, other };
  };

  const sendOffer = async (callId: string, caller: { socket: ClientSocket }) => {
    await ack(caller.socket, CALL_EVENTS.SIGNAL, { callId, signal: offer });
    await ack(caller.socket, CALL_EVENTS.SIGNAL, { callId, signal: candidate(1) });
    await sleep(SETTLE_MS);
  };

  it('l’offre et ses candidats atteignent chaque appareil qui sonne, y compris celui arrivé 4 ms plus tôt', async () => {
    const callId = '507f1f77bcf86cd799439051';
    const { caller, answering, other } = await ringing(callId);
    await sendOffer(callId, caller);

    expect(signalsOf(answering.received)).toEqual(['offer', candidate(1).candidate]);
    expect(signalsOf(other.received)).toEqual(['offer', candidate(1).candidate]);
  }, 20_000);

  it('deux appareils de l’appelé qui rejoignent ne produisent qu’UNE annonce chez l’appelant', async () => {
    const { caller } = await ringing('507f1f77bcf86cd799439052');

    expect(joinedCount(caller.received)).toBe(1);
  }, 20_000);

  it('un appareil arrivé après l’offre reçoit l’offre puis ses candidats, sans nouvelle annonce', async () => {
    const callId = '507f1f77bcf86cd799439053';
    const { caller } = await ringing(callId);
    await sendOffer(callId, caller);

    const late = await device(CALLEE);
    await ack(late.socket, CALL_EVENTS.JOIN, { callId });
    await sleep(SETTLE_MS);

    expect(signalsOf(late.received)).toEqual(['offer', candidate(1).candidate]);
    expect(joinedCount(caller.received)).toBe(1);
  }, 20_000);

  it('un re-join sur la même socket ne réannonce rien et ne rejoue pas une offre déjà remise', async () => {
    const callId = '507f1f77bcf86cd799439054';
    const { caller, answering } = await ringing(callId);
    await sendOffer(callId, caller);

    await ack(answering.socket, CALL_EVENTS.JOIN, { callId });
    await sleep(SETTLE_MS);

    expect(joinedCount(caller.received)).toBe(1);
    expect(signalsOf(answering.received)).toEqual(['offer', candidate(1).candidate]);
  }, 20_000);

  it('l’appareil qui répond fait taire les autres, reçoit seul la suite, et sa reconnexion est annoncée', async () => {
    const callId = '507f1f77bcf86cd799439055';
    const { caller, answering, other } = await ringing(callId);
    await sendOffer(callId, caller);

    await ack(answering.socket, CALL_EVENTS.SIGNAL, { callId, signal: { type: 'answer', from: CALLEE, to: CALLER, sdp: SDP } });
    await sleep(SETTLE_MS);
    await ack(caller.socket, CALL_EVENTS.SIGNAL, { callId, signal: candidate(2) });
    await sleep(SETTLE_MS);

    expect(signalsOf(caller.received)).toEqual(['answer']);
    expect(other.received.some((r) => r.event === CALL_EVENTS.ALREADY_ANSWERED)).toBe(true);
    expect(answering.received.some((r) => r.event === CALL_EVENTS.ALREADY_ANSWERED)).toBe(false);
    expect(signalsOf(answering.received)).toEqual(['offer', candidate(1).candidate, candidate(2).candidate]);
    expect(signalsOf(other.received)).toEqual(['offer', candidate(1).candidate]);

    const reconnected = await device(CALLEE);
    await ack(reconnected.socket, CALL_EVENTS.JOIN, { callId });
    await sleep(SETTLE_MS);
    expect(joinedCount(caller.received)).toBe(2);
  }, 20_000);
});
