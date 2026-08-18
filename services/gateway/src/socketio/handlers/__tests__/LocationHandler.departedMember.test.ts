/**
 * La CINQUIÈME fin de vie d'un partage de position : la fin de l'APPARTENANCE.
 *
 * Le cycle 73 a couvert la mort du conteneur — le fil fermé éteint ce qu'il
 * portait de vivant. Il reste la fin qui ne tue pas le conteneur mais en SORT
 * le partageur : quitter, être banni, être retiré par un admin, ou supprimer
 * le fil pour soi. Le fil vit, les autres membres restent dans la room, et le
 * partage y survivait.
 *
 * Ce que le partageur perd en sortant, c'est précisément le pouvoir d'arrêter :
 * `handleLiveLocationStop` commence par `_resolveParticipantId`, qui exige
 * `isActive: true` — la sortie fait donc taire le SEUL verbe capable de retirer
 * l'épingle, et il tombe en silence (`return`, sans callback ni erreur).
 * L'épingle reste plantée dans un groupe dont il ne fait plus partie, figée sur
 * sa dernière position connue, jusqu'à huit heures.
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
const OTHER_SHARER_SOCKET = 'socket-other-sharer';
const OTHER_SHARER_ID = 'user-sharer-002';
const CONV_ID = '507f1f77bcf86cd799439011';
const NORMALIZED_CONV_ID = '507f1f77bcf86cd799439022';
const OTHER_CONV_ID = '507f1f77bcf86cd799439033';

const PARIS = { latitude: 48.8566, longitude: 2.3522 };
const LYON = { latitude: 45.764, longitude: 4.8357 };

const OPEN = { isActive: true, closedAt: null };

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

function makeHandler() {
  const io = makeIo();
  const prisma = {
    participant: { findFirst: jest.fn<any>().mockResolvedValue({ id: 'participant-1' }) },
    conversation: { findUnique: jest.fn<any>().mockResolvedValue(OPEN) },
  };
  const handler = new LocationHandler({
    io,
    prisma: prisma as any,
    connectedUsers: new Map<string, any>([
      [SHARER_ID, { id: SHARER_ID, isAnonymous: false, displayName: 'Alice' }],
      [OTHER_SHARER_ID, { id: OTHER_SHARER_ID, isAnonymous: false, displayName: 'Bob' }],
    ]),
    socketToUser: new Map<string, string>([
      [SHARER_SOCKET, SHARER_ID],
      [OTHER_SHARER_SOCKET, OTHER_SHARER_ID],
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
  conversationId = CONV_ID,
  durationMinutes = 30
) =>
  handler.handleLiveLocationStart(
    socket,
    { ...PARIS, conversationId, durationMinutes },
    undefined
  );

const roomEmissions = (io: any, event: string, room = ROOMS.conversation(NORMALIZED_CONV_ID)) =>
  (io._room(room)?.emit.mock.calls ?? []).filter((call: unknown[]) => call[0] === event);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('LocationHandler — la fin de l\'APPARTENANCE', () => {
  let handler: LocationHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockGetConnectedUser.mockImplementation((userId: string) => ({
      user: {
        id: userId,
        isAnonymous: false,
        displayName: userId === SHARER_ID ? 'Alice' : 'Bob',
      },
      realUserId: userId,
    }));
  });

  afterEach(() => {
    handler?.dispose();
    jest.useRealTimers();
  });

  describe('endSessionsForDepartedMember', () => {
    it("diffuse location:live-stopped à toute la room — le partant compris, seul point d'accroche pour couper son GPS", async () => {
      const ctx = makeHandler();
      handler = ctx.handler;
      await startShare(handler, makeSocket(SHARER_SOCKET));

      handler.endSessionsForDepartedMember(NORMALIZED_CONV_ID, SHARER_ID);

      expect(roomEmissions(ctx.io, SERVER_EVENTS.LOCATION_LIVE_STOPPED)).toEqual([
        [
          SERVER_EVENTS.LOCATION_LIVE_STOPPED,
          expect.objectContaining({ conversationId: NORMALIZED_CONV_ID, userId: SHARER_ID }),
        ],
      ]);
    });

    it("n'éteint QUE le partant — le fil vit, et les partages des membres restants avec lui", async () => {
      const ctx = makeHandler();
      handler = ctx.handler;
      await startShare(handler, makeSocket(SHARER_SOCKET));
      await startShare(handler, makeSocket(OTHER_SHARER_SOCKET));

      handler.endSessionsForDepartedMember(NORMALIZED_CONV_ID, SHARER_ID);

      const stopped = roomEmissions(ctx.io, SERVER_EVENTS.LOCATION_LIVE_STOPPED);
      expect(stopped).toHaveLength(1);
      expect(stopped[0][1]).toEqual(expect.objectContaining({ userId: SHARER_ID }));
    });

    it("ne touche pas le partage que le MÊME compte tient dans un AUTRE fil", async () => {
      const ctx = makeHandler();
      handler = ctx.handler;
      const socket = makeSocket(SHARER_SOCKET);
      await startShare(handler, socket);
      await startShare(handler, socket, OTHER_CONV_ID);

      handler.endSessionsForDepartedMember(NORMALIZED_CONV_ID, SHARER_ID);

      expect(
        roomEmissions(ctx.io, SERVER_EVENTS.LOCATION_LIVE_STOPPED, ROOMS.conversation(OTHER_CONV_ID))
      ).toHaveLength(0);
    });

    it("tait les mises à jour d'après — le terme est avancé, pas oublié", async () => {
      const ctx = makeHandler();
      handler = ctx.handler;
      const socket = makeSocket(SHARER_SOCKET);
      await startShare(handler, socket);
      handler.endSessionsForDepartedMember(NORMALIZED_CONV_ID, SHARER_ID);
      (socket.to as jest.Mock).mockClear();

      await handler.handleLiveLocationUpdate(socket, { ...LYON, conversationId: CONV_ID });

      expect(socket.to).not.toHaveBeenCalled();
    });

    it("ne rejoue plus le partage éteint à un arrivant", async () => {
      const ctx = makeHandler();
      handler = ctx.handler;
      await startShare(handler, makeSocket(SHARER_SOCKET));
      handler.endSessionsForDepartedMember(NORMALIZED_CONV_ID, SHARER_ID);

      const joiner = makeSocket(OTHER_SHARER_SOCKET);
      handler.replayLiveLocationsTo(joiner, NORMALIZED_CONV_ID);

      expect(joiner.emit).not.toHaveBeenCalled();
    });

    it("n'annonce pas DEUX fois la même fin quand le socket meurt ensuite", async () => {
      const ctx = makeHandler();
      handler = ctx.handler;
      await startShare(handler, makeSocket(SHARER_SOCKET));

      handler.endSessionsForDepartedMember(NORMALIZED_CONV_ID, SHARER_ID);
      handler.handleSocketDisconnecting(SHARER_SOCKET);

      expect(roomEmissions(ctx.io, SERVER_EVENTS.LOCATION_LIVE_STOPPED)).toHaveLength(1);
    });

    it('la minuterie désarmée ne rediffuse rien à son terme', async () => {
      const ctx = makeHandler();
      handler = ctx.handler;
      await startShare(handler, makeSocket(SHARER_SOCKET));

      handler.endSessionsForDepartedMember(NORMALIZED_CONV_ID, SHARER_ID);
      jest.advanceTimersByTime(31 * 60_000);

      expect(roomEmissions(ctx.io, SERVER_EVENTS.LOCATION_LIVE_STOPPED)).toHaveLength(1);
    });

    it("n'annonce rien pour un partage DÉJÀ terminé par son terme", async () => {
      const ctx = makeHandler();
      handler = ctx.handler;
      await startShare(handler, makeSocket(SHARER_SOCKET));
      jest.advanceTimersByTime(31 * 60_000);

      handler.endSessionsForDepartedMember(NORMALIZED_CONV_ID, SHARER_ID);

      expect(roomEmissions(ctx.io, SERVER_EVENTS.LOCATION_LIVE_STOPPED)).toHaveLength(1);
    });

    it("ne diffuse rien quand le partant ne partageait pas — le cas ordinaire, et il ne doit rien coûter", () => {
      const ctx = makeHandler();
      handler = ctx.handler;

      handler.endSessionsForDepartedMember(NORMALIZED_CONV_ID, SHARER_ID);

      expect(ctx.io.to).not.toHaveBeenCalled();
    });

    it("n'interroge JAMAIS la base — l'appartenance vient de finir, la lire ne rendrait rien", async () => {
      const ctx = makeHandler();
      handler = ctx.handler;
      await startShare(handler, makeSocket(SHARER_SOCKET));
      ctx.prisma.participant.findFirst.mockClear();
      ctx.prisma.conversation.findUnique.mockClear();

      handler.endSessionsForDepartedMember(NORMALIZED_CONV_ID, SHARER_ID);

      expect(ctx.prisma.participant.findFirst).not.toHaveBeenCalled();
      expect(ctx.prisma.conversation.findUnique).not.toHaveBeenCalled();
    });
  });

  /**
   * La preuve du COÛT : sans extinction, le partant n'a plus aucun recours.
   * Ce témoin fige le mécanisme qui la rend nécessaire — il ne teste pas le
   * correctif, il teste ce qui le motive, et il doit rester vert après.
   */
  describe("pourquoi le partant ne peut pas s'arrêter lui-même", () => {
    it('location:live-stop tombe en SILENCE dès que l\'appartenance est finie', async () => {
      const ctx = makeHandler();
      handler = ctx.handler;
      const socket = makeSocket(SHARER_SOCKET);
      await startShare(handler, socket);

      // L'appartenance vient de finir : `_resolveParticipantId` exige
      // `isActive: true` et ne rend plus rien.
      ctx.prisma.participant.findFirst.mockResolvedValue(null);
      (socket.to as jest.Mock).mockClear();

      await handler.handleLiveLocationStop(socket, { conversationId: CONV_ID });

      expect(socket.to).not.toHaveBeenCalled();
      expect(roomEmissions(ctx.io, SERVER_EVENTS.LOCATION_LIVE_STOPPED)).toHaveLength(0);
    });
  });
});
