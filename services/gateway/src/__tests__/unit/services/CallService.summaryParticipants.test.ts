/**
 * Le résumé d'appel PERSISTE ses participants (#17868, #18242) : ceux qui ont
 * DÉCROCHÉ, par leur seul `userId` (le nom se compose à la lecture, B2), lus
 * seulement quand le résumé va réellement s'écrire. Une panne de lecture
 * remonte pour que la reprise de `postCallSummary` joue ; seule la dernière
 * tentative sert le résumé sans la ligne.
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
import { findManyIn, type MongoDocument } from '../../helpers/mongo-where';

type AsyncMock = jest.Mock<(args?: unknown) => Promise<unknown>>;
type Written = { readonly data: { readonly metadata: Record<string, unknown> } };

const CALL_ID = '6650000000000000000000aa';
const CONVERSATION_ID = '6650000000000000000000bb';
const INITIATOR_USER_ID = '6650000000000000000000cc';
const INITIATOR_PARTICIPANT_ID = '6650000000000000000000dd';
const ANSWERED_AT = new Date('2026-11-14T10:00:05.000Z');

const asyncMock = (value?: unknown): AsyncMock => jest.fn<(args?: unknown) => Promise<unknown>>().mockResolvedValue(value);

const makeSUT = () => {
  const prisma = {
    callSession: { findUnique: asyncMock(), updateMany: asyncMock({ count: 1 }) },
    participant: { findFirst: asyncMock({ id: INITIATOR_PARTICIPANT_ID }) },
    callParticipant: { findMany: asyncMock([]) },
    message: {
      create: asyncMock({ id: 'm1', conversationId: CONVERSATION_ID }),
      findFirst: asyncMock(null),
      update: asyncMock({ id: 'm-live', conversationId: CONVERSATION_ID })
    }
  };
  return { sut: new CallService(prisma as never), prisma };
};

const writtenMetadata = (write: AsyncMock): Record<string, unknown> => (write.mock.calls[0][0] as Written).data.metadata;

const session = (overrides: Record<string, unknown> = {}) => ({
  id: CALL_ID,
  conversationId: CONVERSATION_ID,
  initiatorId: INITIATOR_USER_ID,
  status: 'ended',
  endReason: 'completed',
  duration: 272,
  answeredAt: ANSWERED_AT,
  metadata: { type: 'video' },
  ...overrides
});

/** Une ligne telle que MongoDB la garde, rattachée à l'appel : le double évalue le `where`. */
const line = (userId: string, overrides: Record<string, unknown> = {}): MongoDocument => ({
  callSessionId: CALL_ID,
  role: 'participant',
  answeredAt: ANSWERED_AT,
  leftAt: null,
  participant: { userId },
  ...overrides
});

const GROUP_OF_THREE = [
  line(INITIATOR_USER_ID, { role: 'initiator', answeredAt: null }),
  line('u_karim', { answeredAt: null, leftAt: new Date('2026-11-14T10:00:02.000Z') }),
  line('u_awa')
];

const linesOf = (rows: ReadonlyArray<MongoDocument>) => {
  const { findMany } = findManyIn(rows);
  return (args?: unknown) => findMany(args as Parameters<typeof findMany>[0]);
};

const LIVE = { id: 'm-live', metadata: { kind: 'call-live', callId: CALL_ID, initiatorId: INITIATOR_USER_ID, callType: 'video', outcome: 'completed' } };

describe('CallService.createCallSummaryMessage — participants persistés', () => {
  beforeEach(() => jest.clearAllMocks());

  it('persiste ceux qui ont DÉCROCHÉ, par leur seul userId, dans l\'ordre d\'arrivée (Karim a sonné puis refusé)', async () => {
    const { sut, prisma } = makeSUT();
    prisma.callSession.findUnique.mockResolvedValue(session());
    prisma.callParticipant.findMany.mockImplementation(linesOf(GROUP_OF_THREE));

    await sut.createCallSummaryMessage(CALL_ID);

    const metadata = writtenMetadata(prisma.message.create);
    expect(metadata.participants).toEqual([{ userId: INITIATOR_USER_ID }, { userId: 'u_awa' }]);
    expect(JSON.stringify(metadata)).not.toMatch(/displayName/);
  });

  it('l\'édition du message vivant (call-live → call) les pose aussi', async () => {
    const { sut, prisma } = makeSUT();
    prisma.callSession.findUnique.mockResolvedValue(session());
    prisma.message.findFirst.mockResolvedValue(LIVE);
    prisma.callParticipant.findMany.mockImplementation(linesOf([line('u_awa')]));

    await sut.createCallSummaryMessage(CALL_ID);

    expect(writtenMetadata(prisma.message.update)).toMatchObject({ kind: 'call', participants: [{ userId: 'u_awa' }] });
  });

  it('un résumé déjà TERMINAL ne relit pas les participants : la lecture vient après `findExisting()`', async () => {
    const { sut, prisma } = makeSUT();
    prisma.callSession.findUnique.mockResolvedValue(session());
    prisma.message.findFirst.mockResolvedValue({ id: 'm-done', metadata: { kind: 'call' } });

    expect(await sut.createCallSummaryMessage(CALL_ID)).toBeNull();
    expect(prisma.callParticipant.findMany).not.toHaveBeenCalled();
  });

  it('un appel jamais décroché n\'a aucun participant à nommer : clé absente, aucune lecture', async () => {
    const { sut, prisma } = makeSUT();
    prisma.callSession.findUnique.mockResolvedValue(session({ status: 'missed', endReason: 'missed', duration: 0, answeredAt: null }));

    await sut.createCallSummaryMessage(CALL_ID);

    expect('participants' in writtenMetadata(prisma.message.create)).toBe(false);
    expect(prisma.callParticipant.findMany).not.toHaveBeenCalled();
  });

  it('une panne de lecture REMONTE (la reprise de postCallSummary joue) et rien n\'est écrit', async () => {
    const { sut, prisma } = makeSUT();
    prisma.callSession.findUnique.mockResolvedValue(session());
    prisma.callParticipant.findMany.mockRejectedValue(new Error('mongo down'));

    await expect(sut.createCallSummaryMessage(CALL_ID)).rejects.toThrow('mongo down');
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it('à la DERNIÈRE tentative, la panne sert le résumé sans la ligne plutôt que de le perdre', async () => {
    const { sut, prisma } = makeSUT();
    prisma.callSession.findUnique.mockResolvedValue(session());
    prisma.callParticipant.findMany.mockRejectedValue(new Error('mongo down'));

    const result = await sut.createCallSummaryMessage(CALL_ID, { participantsBestEffort: true });

    expect(result?.kind).toBe('created');
    expect('participants' in writtenMetadata(prisma.message.create)).toBe(false);
  });

  it('la conversion GC d\'un message vivant d\'un appel décroché garde ses participants', async () => {
    const { sut, prisma } = makeSUT();
    prisma.callSession.findUnique.mockResolvedValue(session({ status: 'failed', endReason: 'garbageCollected' }));
    prisma.message.findFirst.mockResolvedValue(LIVE);
    prisma.callParticipant.findMany.mockImplementation(linesOf([line('u_awa')]));

    await sut.createCallSummaryMessage(CALL_ID);

    expect(writtenMetadata(prisma.message.update)).toMatchObject({ kind: 'call', outcome: 'failed', participants: [{ userId: 'u_awa' }] });
  });
});
