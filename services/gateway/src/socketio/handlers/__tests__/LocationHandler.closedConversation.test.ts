/**
 * La quatrième fin de vie d'un partage de position : la CLÔTURE du fil.
 *
 * `Conversation.closedAt` est documenté par « Conversation closed for all — no
 * one can write, messages stay readable ». Deux verbes du partage de position
 * l'ignoraient :
 *
 *   - DÉMARRER un partage dans un fil clos — accepté, diffusé, et armé pour huit
 *     heures dans une conversation que les clients viennent de retirer de leur
 *     cache (`conversation:closed`) ;
 *   - le partage DÉJÀ en cours quand la clôture tombe — aucun chemin de clôture
 *     ne l'éteignait, si bien que l'épingle survivait dans un fil que son
 *     propriétaire ne peut même plus ouvrir pour l'arrêter.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

const mockGetConnectedUser = jest.fn() as jest.Mock<any>;

jest.mock('../../utils/socket-helpers', () => ({
  getConnectedUser: (...args: unknown[]) => mockGetConnectedUser(...args),
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
  },
}));

jest.mock('../../../utils/socket-rate-limiter.js', () => ({
  getSocketRateLimiter: () => ({ checkLimit: async () => true }),
  SOCKET_RATE_LIMITS: {
    LOCATION_LIVE_START: {},
    LOCATION_LIVE_UPDATE: {},
    LOCATION_LIVE_STOP: {},
  },
}));

import { LocationHandler } from '../LocationHandler';
import type { Socket } from 'socket.io';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';

// ─── Factories ────────────────────────────────────────────────────────────────

const SHARER_SOCKET = 'socket-sharer';
const SHARER_ID = 'user-sharer-001';
const VIEWER_SOCKET = 'socket-viewer';
const VIEWER_ID = 'user-viewer-002';
const CONV_ID = '507f1f77bcf86cd799439011';
const NORMALIZED_CONV_ID = '507f1f77bcf86cd799439022';
const OTHER_CONV_ID = '507f1f77bcf86cd799439033';

const PARIS = { latitude: 48.8566, longitude: 2.3522 };
const LYON = { latitude: 45.764, longitude: 4.8357 };

/** Les deux formes de clôture que la base porte réellement. */
const OPEN = { isActive: true, closedAt: null };
const CLOSED_MODERN = { isActive: false, closedAt: new Date('2026-08-18T09:00:00Z') };
/**
 * La population HÉRITÉE : les fils fermés par l'ancien `leave.ts` (avant le
 * cycle 67) portent `isActive: false` et AUCUN `closedAt`, que rien ne
 * rétro-remplit.
 */
const CLOSED_LEGACY = { isActive: false, closedAt: null };

function makeSocket(id: string): Socket {
  const toRoom = { emit: jest.fn() };
  return {
    id,
    emit: jest.fn(),
    to: jest.fn<any>().mockReturnValue(toRoom),
    _toRoom: toRoom,
  } as unknown as Socket;
}

function makeIo() {
  const roomEmitters = new Map<string, { emit: jest.Mock }>();
  return {
    to: jest.fn<any>((room: string) => {
      const existing = roomEmitters.get(room);
      if (existing) return existing;
      const created = { emit: jest.fn() };
      roomEmitters.set(room, created);
      return created;
    }),
    _room: (room: string) => roomEmitters.get(room),
  } as any;
}

function makeHandler(conversationRow: unknown = OPEN) {
  const io = makeIo();
  const prisma = {
    participant: { findFirst: jest.fn<any>().mockResolvedValue({ id: 'participant-1' }) },
    conversation: { findUnique: jest.fn<any>().mockResolvedValue(conversationRow) },
  };
  const handler = new LocationHandler({
    io,
    prisma: prisma as any,
    connectedUsers: new Map<string, any>([
      [SHARER_ID, { id: SHARER_ID, isAnonymous: false, displayName: 'Alice' }],
      [VIEWER_ID, { id: VIEWER_ID, isAnonymous: false, displayName: 'Bob' }],
    ]),
    socketToUser: new Map<string, string>([
      [SHARER_SOCKET, SHARER_ID],
      [VIEWER_SOCKET, VIEWER_ID],
    ]),
    normalizeConversationId: jest.fn<any>(async (id: string) =>
      id === CONV_ID ? NORMALIZED_CONV_ID : id
    ),
  });
  return { handler, io, prisma };
}

const startShare = (
  handler: LocationHandler,
  socket: Socket,
  callback?: (response: any) => void,
  durationMinutes = 30
) =>
  handler.handleLiveLocationStart(
    socket,
    { ...PARIS, conversationId: CONV_ID, durationMinutes },
    callback as any
  );

const roomEmissions = (io: any, event: string, room = ROOMS.conversation(NORMALIZED_CONV_ID)) =>
  (io._room(room)?.emit.mock.calls ?? []).filter((call: unknown[]) => call[0] === event);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('LocationHandler — la conversation CLOSE', () => {
  let handler: LocationHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockGetConnectedUser.mockImplementation((userId: string) => ({
      user: { id: userId, isAnonymous: false, displayName: userId === SHARER_ID ? 'Alice' : 'Bob' },
      realUserId: userId,
    }));
  });

  afterEach(() => {
    handler?.dispose();
    jest.useRealTimers();
  });

  // ── C1 : on ne DÉMARRE pas un partage dans un fil clos ─────────────────────

  describe('location:live-start refusé', () => {
    it('refuse un fil fermé par closedAt, sans rien diffuser', async () => {
      const ctx = makeHandler(CLOSED_MODERN);
      handler = ctx.handler;
      const socket = makeSocket(SHARER_SOCKET);
      const callback = jest.fn();

      await startShare(handler, socket, callback);

      expect(callback).toHaveBeenCalledWith({ success: false, error: 'Conversation is closed' });
      expect(socket.to).not.toHaveBeenCalled();
    });

    it('refuse la population HÉRITÉE — isActive: false SANS closedAt', async () => {
      const ctx = makeHandler(CLOSED_LEGACY);
      handler = ctx.handler;
      const callback = jest.fn();

      await startShare(handler, makeSocket(SHARER_SOCKET), callback);

      expect(callback).toHaveBeenCalledWith({ success: false, error: 'Conversation is closed' });
    });

    it("n'ouvre AUCUNE session — rien à rejouer, rien à expirer", async () => {
      const ctx = makeHandler(CLOSED_MODERN);
      handler = ctx.handler;
      await startShare(handler, makeSocket(SHARER_SOCKET), jest.fn());

      const viewer = makeSocket(VIEWER_SOCKET);
      handler.replayLiveLocationsTo(viewer, NORMALIZED_CONV_ID);
      jest.advanceTimersByTime(31 * 60_000);

      expect(viewer.emit).not.toHaveBeenCalled();
      expect(roomEmissions(ctx.io, SERVER_EVENTS.LOCATION_LIVE_STOPPED)).toHaveLength(0);
    });

    it('le select demande les DEUX colonnes de la clôture', async () => {
      const ctx = makeHandler(OPEN);
      handler = ctx.handler;
      await startShare(handler, makeSocket(SHARER_SOCKET), jest.fn());

      expect(ctx.prisma.conversation.findUnique).toHaveBeenCalledWith({
        where: { id: NORMALIZED_CONV_ID },
        select: { isActive: true, closedAt: true },
      });
    });

    it('une conversation OUVERTE démarre normalement', async () => {
      const ctx = makeHandler(OPEN);
      handler = ctx.handler;
      const socket = makeSocket(SHARER_SOCKET);
      const callback = jest.fn();

      await startShare(handler, socket, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
      expect(socket.to).toHaveBeenCalledWith(ROOMS.conversation(NORMALIZED_CONV_ID));
    });

    it("n'interroge PAS l'état du fil sur le chemin chaud des mises à jour", async () => {
      const ctx = makeHandler(OPEN);
      handler = ctx.handler;
      const socket = makeSocket(SHARER_SOCKET);
      await startShare(handler, socket, jest.fn());
      ctx.prisma.conversation.findUnique.mockClear();

      await handler.handleLiveLocationUpdate(socket, { ...LYON, conversationId: CONV_ID });

      expect(ctx.prisma.conversation.findUnique).not.toHaveBeenCalled();
    });
  });

  // ── C2 : la clôture ÉTEINT les partages en cours ───────────────────────────

  describe('endSessionsForClosedConversation', () => {
    it('diffuse location:live-stopped à toute la room', async () => {
      const ctx = makeHandler(OPEN);
      handler = ctx.handler;
      await startShare(handler, makeSocket(SHARER_SOCKET), jest.fn());

      handler.endSessionsForClosedConversation(NORMALIZED_CONV_ID);

      expect(roomEmissions(ctx.io, SERVER_EVENTS.LOCATION_LIVE_STOPPED)).toEqual([
        [
          SERVER_EVENTS.LOCATION_LIVE_STOPPED,
          expect.objectContaining({ conversationId: NORMALIZED_CONV_ID, userId: SHARER_ID }),
        ],
      ]);
    });

    it('tait les mises à jour d\'après — le terme est avancé, pas oublié', async () => {
      const ctx = makeHandler(OPEN);
      handler = ctx.handler;
      const socket = makeSocket(SHARER_SOCKET);
      await startShare(handler, socket, jest.fn());
      handler.endSessionsForClosedConversation(NORMALIZED_CONV_ID);
      (socket.to as jest.Mock).mockClear();

      await handler.handleLiveLocationUpdate(socket, { ...LYON, conversationId: CONV_ID });

      expect(socket.to).not.toHaveBeenCalled();
    });

    it('ne rejoue plus le partage éteint à un arrivant', async () => {
      const ctx = makeHandler(OPEN);
      handler = ctx.handler;
      await startShare(handler, makeSocket(SHARER_SOCKET), jest.fn());
      handler.endSessionsForClosedConversation(NORMALIZED_CONV_ID);

      const viewer = makeSocket(VIEWER_SOCKET);
      handler.replayLiveLocationsTo(viewer, NORMALIZED_CONV_ID);

      expect(viewer.emit).not.toHaveBeenCalled();
    });

    it("n'annonce pas DEUX fois la même fin quand le socket meurt ensuite", async () => {
      const ctx = makeHandler(OPEN);
      handler = ctx.handler;
      await startShare(handler, makeSocket(SHARER_SOCKET), jest.fn());

      handler.endSessionsForClosedConversation(NORMALIZED_CONV_ID);
      handler.handleSocketDisconnecting(SHARER_SOCKET);

      expect(roomEmissions(ctx.io, SERVER_EVENTS.LOCATION_LIVE_STOPPED)).toHaveLength(1);
    });

    it('la minuterie désarmée ne rediffuse rien à son terme', async () => {
      const ctx = makeHandler(OPEN);
      handler = ctx.handler;
      await startShare(handler, makeSocket(SHARER_SOCKET), jest.fn());

      handler.endSessionsForClosedConversation(NORMALIZED_CONV_ID);
      jest.advanceTimersByTime(31 * 60_000);

      expect(roomEmissions(ctx.io, SERVER_EVENTS.LOCATION_LIVE_STOPPED)).toHaveLength(1);
    });

    it("ne touche pas les partages des AUTRES conversations", async () => {
      const ctx = makeHandler(OPEN);
      handler = ctx.handler;
      const socket = makeSocket(SHARER_SOCKET);
      await startShare(handler, socket, jest.fn());
      await handler.handleLiveLocationStart(
        socket,
        { ...PARIS, conversationId: OTHER_CONV_ID, durationMinutes: 30 },
        undefined
      );

      handler.endSessionsForClosedConversation(NORMALIZED_CONV_ID);

      expect(
        roomEmissions(ctx.io, SERVER_EVENTS.LOCATION_LIVE_STOPPED, ROOMS.conversation(OTHER_CONV_ID))
      ).toHaveLength(0);
    });

    it("n'annonce rien pour un partage DÉJÀ terminé par son terme", async () => {
      const ctx = makeHandler(OPEN);
      handler = ctx.handler;
      await startShare(handler, makeSocket(SHARER_SOCKET), jest.fn());
      jest.advanceTimersByTime(31 * 60_000);

      handler.endSessionsForClosedConversation(NORMALIZED_CONV_ID);

      expect(roomEmissions(ctx.io, SERVER_EVENTS.LOCATION_LIVE_STOPPED)).toHaveLength(1);
    });

    it("ne diffuse rien quand le fil ne portait aucun partage", () => {
      const ctx = makeHandler(OPEN);
      handler = ctx.handler;

      handler.endSessionsForClosedConversation(NORMALIZED_CONV_ID);

      expect(ctx.io.to).not.toHaveBeenCalled();
    });
  });
});
