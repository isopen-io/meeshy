/**
 * DELETE /calls/:callId/participants/:participantId — l'admin d'un appel
 * (#8438) et la personne invitée dans l'appel (#8433).
 *
 * Celui qui a LANCÉ l'appel, connecté, retire qui il veut sans être modérateur
 * de la conversation. Un simple membre qui ne l'a pas lancé ne retire
 * personne. Une personne invitée — sans participation active à la conversation
 * — peut se retirer elle-même, et un modérateur peut la retirer.
 */

import { describe, it, expect, jest } from '@jest/globals';

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

type Member = { readonly id: string; readonly userId: string; readonly role: string };

const MEMBERS: Record<string, Member> = {
  alice: { id: 'p-alice', userId: 'alice', role: 'member' },
  bob: { id: 'p-bob', userId: 'bob', role: 'member' },
  carol: { id: 'p-carol', userId: 'carol', role: 'member' },
  mod: { id: 'p-mod', userId: 'mod', role: 'moderator' },
  admin: { id: 'p-admin', userId: 'admin', role: 'admin' },
};

const inCall = (key: string, active = true) => ({
  id: `cp-${key}`,
  participantId: `p-${key}`,
  leftAt: null,
  participant: { userId: key, role: MEMBERS[key]?.role ?? 'call-guest', isActive: active && key in MEMBERS },
});

const session = (keys: string[], initiatorId = 'alice') => ({
  id: CALL_ID,
  conversationId: CONV_ID,
  initiatorId,
  mode: 'p2p',
  status: 'active',
  participants: keys.map((key) => inCall(key)),
});

type Handler = (req: unknown, reply: unknown) => Promise<unknown>;

function removal(call: ReturnType<typeof session>) {
  mockGetCallSession.mockReset();
  mockLeaveCall.mockReset();
  mockGetCallSession.mockResolvedValue(call);
  mockLeaveCall.mockResolvedValue(call);
  const findFirst = jest.fn<any>(async ({ where }: { where: Record<string, unknown> }) => {
    const byUser = Object.values(MEMBERS).find((m) => m.userId === where['userId']);
    const byId = Object.values(MEMBERS).find((m) => m.id === where['id']);
    return byUser ?? byId ?? null;
  });
  const handlers = new Map<string, Handler>();
  const register = (method: string) => (path: string, _opts: unknown, handler: Handler) => void handlers.set(`${method} ${path}`, handler);
  const io = {
    to: () => ({ emit: () => undefined }),
    in: () => ({ fetchSockets: async () => [] }),
  };
  const fastify = {
    prisma: { participant: { findFirst } },
    socketIOHandler: { getManager: () => ({ getIO: () => io }) },
    post: jest.fn<any>(register('POST')),
    get: jest.fn<any>(register('GET')),
    delete: jest.fn<any>(register('DELETE')),
  };
  callRoutes(fastify as never);
  const handler = handlers.get('DELETE /calls/:callId/participants/:participantId');
  if (handler === undefined) throw new Error('route de sortie non enregistrée');
  return async (actor: string, target: string) => {
    const reply: Record<string, unknown> = {};
    reply.status = jest.fn<any>(() => reply);
    reply.send = jest.fn<any>(() => reply);
    reply.header = jest.fn<any>(() => reply);
    await handler({ params: { callId: CALL_ID, participantId: target }, authContext: { userId: actor, type: 'registered', hasFullAccess: true } }, reply);
    const status = (reply.status as jest.Mock).mock.calls[0]?.[0] ?? 200;
    const body = (reply.send as jest.Mock).mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    return { status, code: body?.['error'] ?? body?.['code'], left: mockLeaveCall.mock.calls[0]?.[0] };
  };
}

describe('l’initiateur de l’appel en est l’admin (#8438)', () => {
  it('l’initiateur, simple membre, retire un autre participant', async () => {
    const remove = removal(session(['alice', 'bob', 'carol']));

    const outcome = await remove('alice', 'bob');

    expect(outcome.status).toBe(200);
    expect(outcome.left).toMatchObject({ callId: CALL_ID, userId: 'alice', participantId: 'p-bob' });
  });

  it('l’initiateur retire même un admin de la conversation', async () => {
    const remove = removal(session(['alice', 'admin']));

    expect((await remove('alice', 'admin')).status).toBe(200);
  });

  it('un membre qui n’a pas lancé l’appel ne retire personne', async () => {
    const remove = removal(session(['alice', 'bob', 'carol']));

    const outcome = await remove('bob', 'carol');

    expect(outcome.status).toBe(403);
    expect(mockLeaveCall).not.toHaveBeenCalled();
  });

  it('l’initiateur qui a quitté l’appel n’en est plus l’admin', async () => {
    const remove = removal(session(['bob', 'carol']));

    expect((await remove('alice', 'bob')).status).toBe(403);
  });
});

describe('une personne invitée dans l’appel (#8433)', () => {
  it('se retire elle-même, sans être membre de la conversation', async () => {
    const remove = removal(session(['alice', 'bob', 'dave']));

    const outcome = await remove('dave', 'dave');

    expect(outcome.status).toBe(200);
    expect(outcome.left).toMatchObject({ participantId: 'p-dave', userId: 'dave' });
  });

  it('un modérateur la retire', async () => {
    const remove = removal(session(['alice', 'mod', 'dave']));

    const outcome = await remove('mod', 'dave');

    expect(outcome.status).toBe(200);
    expect(outcome.left).toMatchObject({ participantId: 'p-dave' });
  });

  it('elle ne retire personne, et un inconnu qui n’est pas dans l’appel non plus', async () => {
    const remove = removal(session(['alice', 'bob', 'dave']));
    expect((await remove('dave', 'bob')).status).toBe(403);

    const again = removal(session(['alice', 'bob']));
    expect((await again('mallory', 'mallory')).status).toBe(403);
    expect(mockLeaveCall).not.toHaveBeenCalled();
  });
});
