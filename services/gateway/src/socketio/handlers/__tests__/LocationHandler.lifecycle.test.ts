/**
 * Cycle de vie d'un partage de position en direct.
 *
 * Le handler ne diffusait `location:live-stopped` que sur un `location:live-stop`
 * EXPLICITE. Trois fins de vie n'en produisaient donc aucun :
 *
 *   - le socket du partageur meurt (arrêt forcé, crash, perte de réseau) ;
 *   - le terme `expiresAt` est atteint — jusqu'à 8 heures après le début ;
 *   - la passerelle relaie encore des positions au-delà de ce terme.
 *
 * Et sans état serveur, `socket.to(room)` ne touchait que les sockets présents à
 * l'instant du départ : un participant qui ouvre la conversation ensuite
 * n'apprenait jamais l'existence du partage.
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

// Le limiteur est un SINGLETON de module et `LOCATION_LIVE_START` plafonne à 10
// départs/minute/compte — cette suite en fait davantage pour le même compte, et
// dans une horloge figée où la fenêtre ne glisse pas. Le laisser réel ferait
// échouer les derniers tests sur un plafond qui n'est pas leur sujet ; ses
// propres branches sont couvertes par `LocationHandler.test.ts`.
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

const makePrisma = () => ({
  participant: { findFirst: jest.fn<any>().mockResolvedValue({ id: 'participant-1' }) },
});

function makeHandler() {
  const io = makeIo();
  const connectedUsers = new Map<string, any>([
    [SHARER_ID, { id: SHARER_ID, isAnonymous: false, displayName: 'Alice' }],
    [VIEWER_ID, { id: VIEWER_ID, isAnonymous: false, displayName: 'Bob' }],
  ]);
  const socketToUser = new Map<string, string>([
    [SHARER_SOCKET, SHARER_ID],
    [VIEWER_SOCKET, VIEWER_ID],
  ]);
  const handler = new LocationHandler({
    io,
    prisma: makePrisma() as any,
    connectedUsers,
    socketToUser,
    normalizeConversationId: jest.fn<any>(async (id: string) =>
      id === CONV_ID ? NORMALIZED_CONV_ID : id
    ),
  });
  return { handler, io, socketToUser };
}

const startShare = (handler: LocationHandler, socket: Socket, durationMinutes = 30) =>
  handler.handleLiveLocationStart(
    socket,
    { ...PARIS, conversationId: CONV_ID, durationMinutes },
    undefined
  );

const roomStopEmissions = (io: any) =>
  (io._room(ROOMS.conversation(NORMALIZED_CONV_ID))?.emit.mock.calls ?? []).filter(
    (call: unknown[]) => call[0] === SERVER_EVENTS.LOCATION_LIVE_STOPPED
  );

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('LocationHandler — cycle de vie du partage', () => {
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

  // ── D1 : retrait sur mort du socket ────────────────────────────────────────

  describe('retrait quand le socket du partageur meurt', () => {
    it('diffuse location:live-stopped à la conversation', async () => {
      const ctx = makeHandler();
      handler = ctx.handler;
      await startShare(handler, makeSocket(SHARER_SOCKET));

      handler.handleSocketDisconnecting(SHARER_SOCKET);

      expect(roomStopEmissions(ctx.io)).toEqual([
        [
          SERVER_EVENTS.LOCATION_LIVE_STOPPED,
          expect.objectContaining({ conversationId: NORMALIZED_CONV_ID, userId: SHARER_ID }),
        ],
      ]);
    });

    it('retire chaque conversation où ce socket partageait', async () => {
      const ctx = makeHandler();
      handler = ctx.handler;
      const socket = makeSocket(SHARER_SOCKET);
      await startShare(handler, socket);
      await handler.handleLiveLocationStart(
        socket,
        { ...PARIS, conversationId: OTHER_CONV_ID, durationMinutes: 30 },
        undefined
      );

      handler.handleSocketDisconnecting(SHARER_SOCKET);

      expect(roomStopEmissions(ctx.io)).toHaveLength(1);
      expect(
        ctx.io._room(ROOMS.conversation(OTHER_CONV_ID))?.emit
      ).toHaveBeenCalledWith(
        SERVER_EVENTS.LOCATION_LIVE_STOPPED,
        expect.objectContaining({ conversationId: OTHER_CONV_ID, userId: SHARER_ID })
      );
    });

    it('ne retire rien quand un socket sans partage se déconnecte', async () => {
      const ctx = makeHandler();
      handler = ctx.handler;
      await startShare(handler, makeSocket(SHARER_SOCKET));

      handler.handleSocketDisconnecting(VIEWER_SOCKET);

      expect(roomStopEmissions(ctx.io)).toHaveLength(0);
    });

    it('ne retire pas une session reprise par un autre appareil du même compte', async () => {
      const ctx = makeHandler();
      handler = ctx.handler;
      const phone = makeSocket(SHARER_SOCKET);
      const laptop = makeSocket('socket-sharer-laptop');
      ctx.socketToUser.set('socket-sharer-laptop', SHARER_ID);

      await startShare(handler, phone);
      // Le second appareil reprend le partage de la MÊME conversation : la
      // session appartient désormais à lui.
      await startShare(handler, laptop);

      handler.handleSocketDisconnecting(SHARER_SOCKET);

      expect(roomStopEmissions(ctx.io)).toHaveLength(0);
    });

    it('ne rediffuse pas le retrait déjà annoncé par l\'expiration', async () => {
      const ctx = makeHandler();
      handler = ctx.handler;
      await startShare(handler, makeSocket(SHARER_SOCKET), 15);

      jest.advanceTimersByTime(15 * 60_000);
      expect(roomStopEmissions(ctx.io)).toHaveLength(1);

      // L'entrée survit à son terme, et c'est cette déconnexion qui la ramasse —
      // mais sa fin a déjà été annoncée.
      handler.handleSocketDisconnecting(SHARER_SOCKET);

      expect(roomStopEmissions(ctx.io)).toHaveLength(1);
    });

    it('ne diffuse rien deux fois si le partageur avait déjà arrêté explicitement', async () => {
      const ctx = makeHandler();
      handler = ctx.handler;
      const socket = makeSocket(SHARER_SOCKET);
      await startShare(handler, socket);
      await handler.handleLiveLocationStop(socket, { conversationId: CONV_ID });

      handler.handleSocketDisconnecting(SHARER_SOCKET);

      expect(roomStopEmissions(ctx.io)).toHaveLength(0);
    });
  });

  // ── D3 : expiration appliquée par le serveur ───────────────────────────────

  describe('expiration', () => {
    it('diffuse location:live-stopped au terme de durationMinutes', async () => {
      const ctx = makeHandler();
      handler = ctx.handler;
      await startShare(handler, makeSocket(SHARER_SOCKET), 15);

      jest.advanceTimersByTime(15 * 60_000 - 1);
      expect(roomStopEmissions(ctx.io)).toHaveLength(0);

      jest.advanceTimersByTime(1);
      expect(roomStopEmissions(ctx.io)).toEqual([
        [
          SERVER_EVENTS.LOCATION_LIVE_STOPPED,
          expect.objectContaining({ conversationId: NORMALIZED_CONV_ID, userId: SHARER_ID }),
        ],
      ]);
    });

    it('ne relaie plus les positions après le terme', async () => {
      const ctx = makeHandler();
      handler = ctx.handler;
      const socket = makeSocket(SHARER_SOCKET);
      await startShare(handler, socket, 15);

      jest.advanceTimersByTime(15 * 60_000);
      await handler.handleLiveLocationUpdate(socket, { ...LYON, conversationId: CONV_ID });

      expect((socket as any)._toRoom.emit).not.toHaveBeenCalledWith(
        SERVER_EVENTS.LOCATION_LIVE_UPDATED,
        expect.anything()
      );
    });

    it('relaie encore les positions avant le terme', async () => {
      const ctx = makeHandler();
      handler = ctx.handler;
      const socket = makeSocket(SHARER_SOCKET);
      await startShare(handler, socket, 15);

      await handler.handleLiveLocationUpdate(socket, { ...LYON, conversationId: CONV_ID });

      expect((socket as any)._toRoom.emit).toHaveBeenCalledWith(
        SERVER_EVENTS.LOCATION_LIVE_UPDATED,
        expect.objectContaining({ userId: SHARER_ID, latitude: LYON.latitude })
      );
    });

    it('relaie une position dont la passerelle ignore la session', async () => {
      // Redémarrage de la passerelle : le registre est vide, le partageur
      // continue d'émettre. Une session INCONNUE n'est pas une session
      // TERMINÉE — la couper ferait mourir tout partage en cours à chaque
      // déploiement.
      const ctx = makeHandler();
      handler = ctx.handler;
      const socket = makeSocket(SHARER_SOCKET);

      await handler.handleLiveLocationUpdate(socket, { ...LYON, conversationId: CONV_ID });

      expect((socket as any)._toRoom.emit).toHaveBeenCalledWith(
        SERVER_EVENTS.LOCATION_LIVE_UPDATED,
        expect.objectContaining({ userId: SHARER_ID })
      );
    });

    it('la minuterie ne survit pas à un arrêt explicite', async () => {
      const ctx = makeHandler();
      handler = ctx.handler;
      const socket = makeSocket(SHARER_SOCKET);
      await startShare(handler, socket, 15);
      await handler.handleLiveLocationStop(socket, { conversationId: CONV_ID });

      jest.advanceTimersByTime(15 * 60_000);

      // Un seul retrait : celui de l'arrêt explicite, diffusé par `socket.to`.
      expect(roomStopEmissions(ctx.io)).toHaveLength(0);
      expect((socket as any)._toRoom.emit).toHaveBeenCalledTimes(2);
    });
  });

  // ── D2 : rattrapage à l'entrée dans la conversation ────────────────────────

  describe('rattrapage à la jonction', () => {
    it('rejoue location:live-started au socket entrant', async () => {
      const ctx = makeHandler();
      handler = ctx.handler;
      await startShare(handler, makeSocket(SHARER_SOCKET), 30);

      const viewer = makeSocket(VIEWER_SOCKET);
      handler.replayLiveLocationsTo(viewer, NORMALIZED_CONV_ID);

      expect(viewer.emit).toHaveBeenCalledWith(
        SERVER_EVENTS.LOCATION_LIVE_STARTED,
        expect.objectContaining({
          conversationId: NORMALIZED_CONV_ID,
          userId: SHARER_ID,
          username: 'Alice',
          durationMinutes: 30,
        })
      );
    });

    it('rejoue la DERNIÈRE position connue, pas celle du départ', async () => {
      const ctx = makeHandler();
      handler = ctx.handler;
      const socket = makeSocket(SHARER_SOCKET);
      await startShare(handler, socket, 30);
      await handler.handleLiveLocationUpdate(socket, { ...LYON, conversationId: CONV_ID });

      const viewer = makeSocket(VIEWER_SOCKET);
      handler.replayLiveLocationsTo(viewer, NORMALIZED_CONV_ID);

      expect(viewer.emit).toHaveBeenCalledWith(
        SERVER_EVENTS.LOCATION_LIVE_STARTED,
        expect.objectContaining({ latitude: LYON.latitude, longitude: LYON.longitude })
      );
    });

    it('ne rejoue pas son propre partage au partageur qui revient', async () => {
      const ctx = makeHandler();
      handler = ctx.handler;
      await startShare(handler, makeSocket(SHARER_SOCKET), 30);

      const reconnected = makeSocket('socket-sharer-again');
      ctx.socketToUser.set('socket-sharer-again', SHARER_ID);
      handler.replayLiveLocationsTo(reconnected, NORMALIZED_CONV_ID);

      expect(reconnected.emit).not.toHaveBeenCalled();
    });

    it('ne rejoue pas les partages des autres conversations', async () => {
      const ctx = makeHandler();
      handler = ctx.handler;
      await startShare(handler, makeSocket(SHARER_SOCKET), 30);

      const viewer = makeSocket(VIEWER_SOCKET);
      handler.replayLiveLocationsTo(viewer, OTHER_CONV_ID);

      expect(viewer.emit).not.toHaveBeenCalled();
    });

    it('ne rejoue pas un partage arrêté', async () => {
      const ctx = makeHandler();
      handler = ctx.handler;
      const socket = makeSocket(SHARER_SOCKET);
      await startShare(handler, socket, 30);
      await handler.handleLiveLocationStop(socket, { conversationId: CONV_ID });

      const viewer = makeSocket(VIEWER_SOCKET);
      handler.replayLiveLocationsTo(viewer, NORMALIZED_CONV_ID);

      expect(viewer.emit).not.toHaveBeenCalled();
    });

    it('ne rejoue pas un partage expiré', async () => {
      const ctx = makeHandler();
      handler = ctx.handler;
      await startShare(handler, makeSocket(SHARER_SOCKET), 15);

      jest.advanceTimersByTime(15 * 60_000);

      const viewer = makeSocket(VIEWER_SOCKET);
      handler.replayLiveLocationsTo(viewer, NORMALIZED_CONV_ID);

      expect(viewer.emit).not.toHaveBeenCalled();
    });

    it('ne rejoue rien à un socket qu\'aucun compte ne réclame', async () => {
      const ctx = makeHandler();
      handler = ctx.handler;
      await startShare(handler, makeSocket(SHARER_SOCKET), 30);

      const stranger = makeSocket('socket-unknown');
      handler.replayLiveLocationsTo(stranger, NORMALIZED_CONV_ID);

      expect(stranger.emit).not.toHaveBeenCalled();
    });
  });

  // ── dispose ────────────────────────────────────────────────────────────────

  it('dispose désarme les minuteries sans rien diffuser', async () => {
    const ctx = makeHandler();
    handler = ctx.handler;
    await startShare(handler, makeSocket(SHARER_SOCKET), 15);

    handler.dispose();
    jest.advanceTimersByTime(15 * 60_000);

    expect(roomStopEmissions(ctx.io)).toHaveLength(0);
  });
});
