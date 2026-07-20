/**
 * CallService.createLiveCallMessage — live call message unit tests.
 *
 * The live message is posted at `call:initiate` with `kind: 'call-live'` and
 * the SAME deterministic `clientMessageId` as the terminal summary, so the
 * terminal path later edits it in-place (or wins the race outright: a P2002
 * here means the call already ended and posted its final summary — the live
 * message must NOT be created). The pure label/metadata mapping is tested in
 * packages/shared (call-summary.test.ts); here we cover the persistence
 * wiring, the non-terminal guard and the race semantics with a mocked Prisma.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

jest.mock('@meeshy/shared/types/video-call', () => ({
  CALL_ERROR_CODES: { CALL_NOT_FOUND: 'CALL_NOT_FOUND', NOT_A_PARTICIPANT: 'NOT_A_PARTICIPANT' }
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

jest.mock('../../../services/TURNCredentialService', () => ({
  TURNCredentialService: jest.fn().mockImplementation(() => ({}))
}));

import { CallService } from '../../../services/CallService';
import { Prisma } from '@meeshy/shared/prisma/client';

type MockFn = jest.Mock<any>;

const createMockPrisma = () => ({
  callSession: { findUnique: jest.fn() as MockFn, update: (jest.fn() as MockFn).mockResolvedValue(undefined) },
  participant: { findFirst: jest.fn() as MockFn },
  message: { create: jest.fn() as MockFn }
});

const CALL_ID = '6650000000000000000000aa';
const CONVERSATION_ID = '6650000000000000000000bb';
const INITIATOR_USER_ID = '6650000000000000000000cc';
const INITIATOR_PARTICIPANT_ID = '6650000000000000000000dd';

const makeSession = (overrides: Record<string, unknown> = {}) => ({
  id: CALL_ID,
  conversationId: CONVERSATION_ID,
  initiatorId: INITIATOR_USER_ID,
  status: 'initiated',
  metadata: { type: 'audio' },
  ...overrides
});

const makeSUT = () => {
  const prisma = createMockPrisma();
  const sut = new CallService(prisma as never);
  return { sut, prisma };
};

describe('CallService.createLiveCallMessage', () => {
  beforeEach(() => jest.clearAllMocks());

  it('posts the live audio message attributed to the initiator participant', async () => {
    const { sut, prisma } = makeSUT();
    prisma.callSession.findUnique.mockResolvedValue(makeSession());
    prisma.participant.findFirst.mockResolvedValue({ id: INITIATOR_PARTICIPANT_ID });
    prisma.message.create.mockResolvedValue({ id: 'm1', conversationId: CONVERSATION_ID });

    const result = await sut.createLiveCallMessage(CALL_ID);

    expect(result).toEqual({ id: 'm1', conversationId: CONVERSATION_ID });
    expect(prisma.message.create).toHaveBeenCalledTimes(1);
    const arg = prisma.message.create.mock.calls[0][0] as any;
    expect(arg.data).toMatchObject({
      conversationId: CONVERSATION_ID,
      senderId: INITIATOR_PARTICIPANT_ID,
      content: 'Appel audio en cours',
      messageType: 'system',
      messageSource: 'system',
      clientMessageId: `call-summary:${CALL_ID}`
    });
  });

  it('persists the call-live structured metadata with no measurements', async () => {
    const { sut, prisma } = makeSUT();
    prisma.callSession.findUnique.mockResolvedValue(makeSession({ metadata: { type: 'video' }, status: 'ringing' }));
    prisma.participant.findFirst.mockResolvedValue({ id: INITIATOR_PARTICIPANT_ID });
    prisma.message.create.mockResolvedValue({ id: 'm1' });

    await sut.createLiveCallMessage(CALL_ID);

    const arg = prisma.message.create.mock.calls[0][0] as any;
    expect(arg.data.content).toBe('Appel vidéo en cours');
    expect(arg.data.metadata).toEqual({
      kind: 'call-live',
      callId: CALL_ID,
      initiatorId: INITIATOR_USER_ID,
      callType: 'video',
      outcome: 'completed',
      durationSeconds: 0,
      bytesTotal: null,
      bytesEstimated: false,
      networkQuality: null
    });
  });

  it('returns null and creates nothing once the call is terminal', async () => {
    for (const status of ['ended', 'missed', 'rejected', 'failed']) {
      const { sut, prisma } = makeSUT();
      prisma.callSession.findUnique.mockResolvedValue(makeSession({ status }));

      const result = await sut.createLiveCallMessage(CALL_ID);

      expect(result).toBeNull();
      expect(prisma.message.create).not.toHaveBeenCalled();
    }
  });

  it('returns null when the call does not exist', async () => {
    const { sut, prisma } = makeSUT();
    prisma.callSession.findUnique.mockResolvedValue(null);

    expect(await sut.createLiveCallMessage(CALL_ID)).toBeNull();
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it('returns null when the initiator has no participant row', async () => {
    const { sut, prisma } = makeSUT();
    prisma.callSession.findUnique.mockResolvedValue(makeSession());
    prisma.participant.findFirst.mockResolvedValue(null);

    expect(await sut.createLiveCallMessage(CALL_ID)).toBeNull();
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it('yields to a concurrent terminal path: P2002 resolves to null', async () => {
    const { sut, prisma } = makeSUT();
    prisma.callSession.findUnique.mockResolvedValue(makeSession());
    prisma.participant.findFirst.mockResolvedValue({ id: INITIATOR_PARTICIPANT_ID });
    prisma.message.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test'
      })
    );

    expect(await sut.createLiveCallMessage(CALL_ID)).toBeNull();
  });

  it('rethrows non-P2002 prisma errors', async () => {
    const { sut, prisma } = makeSUT();
    prisma.callSession.findUnique.mockResolvedValue(makeSession());
    prisma.participant.findFirst.mockResolvedValue({ id: INITIATOR_PARTICIPANT_ID });
    prisma.message.create.mockRejectedValue(new Error('db down'));

    await expect(sut.createLiveCallMessage(CALL_ID)).rejects.toThrow('db down');
  });
});
