/**
 * DELETE /calls/:callId?reason=rejected — le refus AVANT d'avoir rejoint (#8043).
 *
 * La notification d'appel web propose « Refuser » depuis le service worker,
 * sans socket : la route REST doit rejouer le refus socket
 * (`resolvePreJoinDeclineParticipantId` + `endCall(..., 'rejected',
 * { preJoinDecline: true })`) pour un membre qui n'a jamais rejoint un appel
 * qui sonne encore, et ne rien changer à la fin d'appel ordinaire.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockGetCallSession = jest.fn<any>();
const mockEndCall = jest.fn<any>();

jest.mock('../../../services/CallService', () => {
  class CallAlreadyEndedError extends Error {}
  return {
    CallService: jest.fn<any>().mockImplementation(() => ({
      getCallSession: (...args: any[]) => mockGetCallSession(...args),
      endCall: (...args: any[]) => mockEndCall(...args),
      finalizeCallSummary: jest.fn<any>().mockResolvedValue(undefined),
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
const USER_ID = '507f1f77bcf86cd799439022';
const CONV_ID = '507f1f77bcf86cd799439033';
const PART_ID = '507f1f77bcf86cd799439044';

type Handler = (req: unknown, reply: unknown) => Promise<unknown>;

function deleteCallRoute(): Handler {
  const handlers = new Map<string, Handler>();
  const register = (method: string) => (path: string, _opts: unknown, handler: Handler) => void handlers.set(`${method} ${path}`, handler);
  const fastify = {
    prisma: {
      participant: { findFirst: jest.fn<any>().mockResolvedValue({ id: PART_ID, userId: USER_ID, conversationId: CONV_ID, isActive: true }) },
      callSession: { findFirst: jest.fn<any>(), findUnique: jest.fn<any>().mockResolvedValue({ conversationId: CONV_ID }) },
    },
    post: jest.fn<any>(register('POST')),
    get: jest.fn<any>(register('GET')),
    delete: jest.fn<any>(register('DELETE')),
  };
  callRoutes(fastify as never);
  const handler = handlers.get('DELETE /calls/:callId');
  if (handler === undefined) throw new Error('DELETE /calls/:callId non enregistrée');
  return handler;
}

function reply() {
  const r: Record<string, unknown> = {};
  r.status = jest.fn<any>(() => r);
  r.send = jest.fn<any>(() => r);
  r.header = jest.fn<any>(() => r);
  return r;
}

const ringingSession = (overrides: Record<string, unknown> = {}) => ({
  id: CALL_ID,
  conversationId: CONV_ID,
  initiatorId: 'caller-id',
  status: 'ringing',
  mode: 'p2p',
  answeredAt: null,
  participants: [],
  ...overrides,
});

async function end(query: Record<string, string>) {
  await deleteCallRoute()(
    { params: { callId: CALL_ID }, query, body: {}, authContext: { userId: USER_ID, participantId: PART_ID, type: 'registered', hasFullAccess: true } },
    reply(),
  );
}

describe('DELETE /calls/:callId?reason=rejected — refus avant d’avoir rejoint (#8043)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCallSession.mockResolvedValue(ringingSession());
    mockEndCall.mockResolvedValue({ ...ringingSession(), status: 'rejected' });
  });

  it('un membre qui n’a jamais rejoint refuse l’appel qui sonne', async () => {
    await end({ reason: 'rejected' });
    expect(mockEndCall).toHaveBeenCalledWith(CALL_ID, USER_ID, PART_ID, false, 'rejected', { preJoinDecline: true });
  });

  it('sans raison, le chemin de fin d’appel reste inchangé', async () => {
    await end({});
    expect(mockEndCall).toHaveBeenCalledWith(CALL_ID, USER_ID, PART_ID);
  });

  it('un appel déjà décroché ne se refuse pas : chemin de fin ordinaire', async () => {
    mockGetCallSession.mockResolvedValue(ringingSession({ answeredAt: new Date() }));
    await end({ reason: 'rejected' });
    expect(mockEndCall).toHaveBeenCalledWith(CALL_ID, USER_ID, PART_ID);
  });

  it('un participant déjà dans l’appel raccroche par le chemin ordinaire', async () => {
    mockGetCallSession.mockResolvedValue(ringingSession({ participants: [{ id: 'cp-1', participantId: PART_ID, leftAt: null }] }));
    await end({ reason: 'rejected' });
    expect(mockEndCall).toHaveBeenCalledWith(CALL_ID, USER_ID, PART_ID);
  });
});
