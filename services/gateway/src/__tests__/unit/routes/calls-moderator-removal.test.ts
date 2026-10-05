/**
 * DELETE /calls/:callId/participants/:participantId — l'EXCLUSION par un
 * modérateur ferme l'écran de l'exclu.
 *
 * `call:participant-left` dit aux RESTANTS qu'un pair s'en va ; aucun client
 * ne s'en sert pour se refermer lui-même (le web l'ignore quand il le nomme).
 * L'exclu garde donc un appel mort à l'écran tant que rien ne lui dit « c'est
 * TOI qu'on sort » : `call:force-leave` sur sa room PERSONNELLE, puis ses
 * sockets quittent la room de l'appel.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

const mockGetCallSession = jest.fn<any>();
const mockLeaveCall = jest.fn<any>();

jest.mock('../../../services/CallService', () => {
  class CallAlreadyEndedError extends Error {}
  return {
    CallService: jest.fn<any>().mockImplementation(() => ({
      getCallSession: (...args: any[]) => mockGetCallSession(...args),
      leaveCall: (...args: any[]) => mockLeaveCall(...args),
      finalizeCallSummary: jest.fn<any>(),
      broadcastCallEndedIfTerminal: jest.fn<any>(),
      invalidateSignalCache: jest.fn<any>(),
      broadcastParticipantLeft: jest.fn<any>(),
    })),
    CallAlreadyEndedError,
  };
});

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn<any>().mockReturnValue(jest.fn<any>()),
}));

jest.mock('../../../middleware/validation', () => ({
  createValidationMiddleware: jest.fn<any>().mockReturnValue(jest.fn<any>()),
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn<any>(), warn: jest.fn<any>(), error: jest.fn<any>(), debug: jest.fn<any>() },
}));

import callRoutes from '../../../routes/calls';

const CALL_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439033';
const MODERATOR_ID = '507f1f77bcf86cd799439022';
const MODERATOR_PART = '507f1f77bcf86cd799439044';
const TARGET_ID = '507f1f77bcf86cd799439055';
const TARGET_PART = '507f1f77bcf86cd799439066';
const GUEST_PART = '507f1f77bcf86cd799439077';

type Handler = (req: unknown, reply: unknown) => Promise<unknown>;

type Target = { readonly id: string; readonly userId: string | null; readonly role: string };

function harness(target: Target, options: { readonly withSocket?: boolean } = {}) {
  const emitted: Array<{ room: string; event: string; payload: unknown }> = [];
  const leftRooms: Array<{ from: string; room: string }> = [];
  const io = {
    to: (room: string) => ({ emit: (event: string, payload: unknown) => void emitted.push({ room, event, payload }) }),
    in: (from: string) => ({
      fetchSockets: async () => [{ leave: (room: string) => void leftRooms.push({ from, room }) }],
    }),
  };
  const handlers = new Map<string, Handler>();
  const register = (method: string) => (path: string, _opts: unknown, handler: Handler) => void handlers.set(`${method} ${path}`, handler);
  const findFirst = jest.fn<any>(async ({ where }: { where: Record<string, unknown> }) => {
    if (where['userId'] === MODERATOR_ID) return { id: MODERATOR_PART, userId: MODERATOR_ID, role: 'moderator' };
    if (target.userId !== null && where['userId'] === target.userId) return target;
    if (where['id'] === target.id) return target;
    return null;
  });
  const fastify = {
    prisma: { participant: { findFirst } },
    socketIOHandler: options.withSocket === false ? undefined : { getManager: () => ({ getIO: () => io }) },
    post: jest.fn<any>(register('POST')),
    get: jest.fn<any>(register('GET')),
    delete: jest.fn<any>(register('DELETE')),
  };
  callRoutes(fastify as never);
  const handler = handlers.get('DELETE /calls/:callId/participants/:participantId');
  if (handler === undefined) throw new Error('route de sortie non enregistrée');
  const reply: Record<string, unknown> = {};
  reply.status = jest.fn<any>(() => reply);
  reply.send = jest.fn<any>(() => reply);
  reply.header = jest.fn<any>(() => reply);
  const remove = async (participantId: string, actor = MODERATOR_ID) => {
    await handler({ params: { callId: CALL_ID, participantId }, authContext: { userId: actor, type: 'registered', hasFullAccess: true } }, reply);
  };
  return { emitted, leftRooms, remove, reply };
}

const activeSession = () => ({
  id: CALL_ID,
  conversationId: CONV_ID,
  mode: 'p2p',
  status: 'active',
  participants: [
    { id: 'cp-mod', participantId: MODERATOR_PART, leftAt: null },
    { id: 'cp-target', participantId: TARGET_PART, leftAt: null },
    { id: 'cp-guest', participantId: GUEST_PART, leftAt: null },
  ],
});

const forceLeaves = (emitted: ReadonlyArray<{ room: string; event: string; payload: unknown }>) =>
  emitted.filter((e) => e.event === SERVER_EVENTS.CALL_FORCE_LEAVE);

describe('un modérateur exclut quelqu’un d’un appel de groupe', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCallSession.mockResolvedValue(activeSession());
    mockLeaveCall.mockResolvedValue(activeSession());
  });

  it('l’exclu reçoit call:force-leave sur sa room personnelle', async () => {
    const h = harness({ id: TARGET_PART, userId: TARGET_ID, role: 'member' });
    await h.remove(TARGET_ID);
    expect(forceLeaves(h.emitted)).toEqual([
      { room: ROOMS.user(TARGET_ID), event: SERVER_EVENTS.CALL_FORCE_LEAVE, payload: { callId: CALL_ID, reason: 'removed' } },
    ]);
  });

  it('ses appareils quittent la room de l’appel', async () => {
    const h = harness({ id: TARGET_PART, userId: TARGET_ID, role: 'member' });
    await h.remove(TARGET_ID);
    expect(h.leftRooms).toEqual([{ from: ROOMS.user(TARGET_ID), room: ROOMS.call(CALL_ID) }]);
  });

  it('un invité sans compte est adressé par sa room de participant', async () => {
    const h = harness({ id: GUEST_PART, userId: null, role: 'member' });
    await h.remove(GUEST_PART);
    expect(forceLeaves(h.emitted).map((e) => e.room)).toEqual([ROOMS.user(GUEST_PART)]);
  });

  it('quitter soi-même n’envoie aucune fin forcée', async () => {
    const h = harness({ id: TARGET_PART, userId: TARGET_ID, role: 'member' });
    await h.remove(MODERATOR_ID);
    expect(mockLeaveCall).toHaveBeenCalled();
    expect(forceLeaves(h.emitted)).toEqual([]);
  });

  it('une exclusion refusée n’envoie rien', async () => {
    const h = harness({ id: TARGET_PART, userId: TARGET_ID, role: 'admin' });
    await h.remove(TARGET_ID);
    expect(mockLeaveCall).not.toHaveBeenCalled();
    expect(forceLeaves(h.emitted)).toEqual([]);
  });

  it('sans couche socket, l’exclusion aboutit quand même', async () => {
    const h = harness({ id: TARGET_PART, userId: TARGET_ID, role: 'member' }, { withSocket: false });
    await h.remove(TARGET_ID);
    expect(mockLeaveCall).toHaveBeenCalled();
    expect(h.reply.status).not.toHaveBeenCalledWith(500);
  });
});
