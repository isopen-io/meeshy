/**
 * Le résumé d'appel SERT ses participants (#17868, planche A1) : la ligne
 * « Awa, Karim, Lina et vous » sous le titre de la carte, sur les trois
 * plateformes. Un seul message pour tous ses lecteurs : la passerelle sert
 * TOUS ceux qui ont rejoint, le lecteur se retire par `userId`.
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

type MockFn = jest.Mock<any>;

const CALL_ID = '6650000000000000000000aa';
const CONVERSATION_ID = '6650000000000000000000bb';
const INITIATOR_USER_ID = '6650000000000000000000cc';
const INITIATOR_PARTICIPANT_ID = '6650000000000000000000dd';
const ANSWERED_AT = new Date('2026-11-14T10:00:05.000Z');

const makeSUT = () => {
  const prisma = {
    callSession: { findUnique: jest.fn() as MockFn, updateMany: (jest.fn() as MockFn).mockResolvedValue({ count: 1 }) },
    participant: { findFirst: (jest.fn() as MockFn).mockResolvedValue({ id: INITIATOR_PARTICIPANT_ID }) },
    callParticipant: { findMany: jest.fn() as MockFn },
    message: {
      create: (jest.fn() as MockFn).mockResolvedValue({ id: 'm1', conversationId: CONVERSATION_ID }),
      findFirst: (jest.fn() as MockFn).mockResolvedValue(null),
      update: (jest.fn() as MockFn).mockResolvedValue({ id: 'm-live', conversationId: CONVERSATION_ID })
    }
  };
  return { sut: new CallService(prisma as never), prisma };
};

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

const joined = (userId: string, displayName: string) => ({
  participant: { userId, displayName, user: { displayName: null, firstName: null, lastName: null, username: userId } }
});

const LIVE = { id: 'm-live', metadata: { kind: 'call-live', callId: CALL_ID, initiatorId: INITIATOR_USER_ID, callType: 'video', outcome: 'completed' } };

describe('CallService.createCallSummaryMessage — participants servis', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sert, à la création du résumé, tous ceux qui ont rejoint, dans l\'ordre d\'arrivée', async () => {
    const { sut, prisma } = makeSUT();
    prisma.callSession.findUnique.mockResolvedValue(session());
    prisma.callParticipant.findMany.mockResolvedValue([
      joined(INITIATOR_USER_ID, 'Moi'), joined('u_awa', 'Awa'), joined('u_karim', 'Karim')
    ]);

    await sut.createCallSummaryMessage(CALL_ID);

    const metadata = (prisma.message.create.mock.calls[0][0] as any).data.metadata;
    expect(metadata.participants).toEqual([
      { userId: INITIATOR_USER_ID, displayName: 'Moi' },
      { userId: 'u_awa', displayName: 'Awa' },
      { userId: 'u_karim', displayName: 'Karim' }
    ]);
  });

  it('l\'édition du message vivant (call-live → call) les pose aussi', async () => {
    const { sut, prisma } = makeSUT();
    prisma.callSession.findUnique.mockResolvedValue(session());
    prisma.message.findFirst.mockResolvedValue(LIVE);
    prisma.callParticipant.findMany.mockResolvedValue([joined('u_awa', 'Awa')]);

    await sut.createCallSummaryMessage(CALL_ID);

    const metadata = (prisma.message.update.mock.calls[0][0] as any).data.metadata;
    expect(metadata).toMatchObject({ kind: 'call', participants: [{ userId: 'u_awa', displayName: 'Awa' }] });
  });

  it('un appel jamais décroché n\'a eu aucun participant à nommer : clé absente, aucune lecture', async () => {
    const { sut, prisma } = makeSUT();
    prisma.callSession.findUnique.mockResolvedValue(
      session({ status: 'missed', endReason: 'missed', duration: 0, answeredAt: null })
    );
    prisma.callParticipant.findMany.mockResolvedValue([joined('u_awa', 'Awa')]);

    await sut.createCallSummaryMessage(CALL_ID);

    expect('participants' in (prisma.message.create.mock.calls[0][0] as any).data.metadata).toBe(false);
    expect(prisma.callParticipant.findMany).not.toHaveBeenCalled();
  });

  it('une panne de lecture des participants ne coûte pas le résumé : clé absente', async () => {
    const { sut, prisma } = makeSUT();
    prisma.callSession.findUnique.mockResolvedValue(session());
    prisma.callParticipant.findMany.mockRejectedValue(new Error('mongo down'));

    const result = await sut.createCallSummaryMessage(CALL_ID);

    expect(result?.kind).toBe('created');
    expect('participants' in (prisma.message.create.mock.calls[0][0] as any).data.metadata).toBe(false);
  });

  it('la conversion GC d\'un message vivant d\'un appel décroché garde ses participants', async () => {
    const { sut, prisma } = makeSUT();
    prisma.callSession.findUnique.mockResolvedValue(session({ status: 'failed', endReason: 'garbageCollected' }));
    prisma.message.findFirst.mockResolvedValue(LIVE);
    prisma.callParticipant.findMany.mockResolvedValue([joined('u_awa', 'Awa')]);

    await sut.createCallSummaryMessage(CALL_ID);

    const metadata = (prisma.message.update.mock.calls[0][0] as any).data.metadata;
    expect(metadata).toMatchObject({ kind: 'call', outcome: 'failed', participants: [{ userId: 'u_awa', displayName: 'Awa' }] });
  });
});
