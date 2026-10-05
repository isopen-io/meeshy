/**
 * `createCallSummaryMessage` déclenche le crédit d'appel (#8959) à la PREMIÈRE
 * écriture du résumé terminal — création, ou conversion du message « en
 * cours » — et jamais quand un autre chemin terminal l'a déjà écrit.
 *
 * @jest-environment node
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

const mockCredit = jest.fn();
jest.mock('../../../services/calls/callEngagementCredits', () => ({
  callEngagementCrediter: () => mockCredit
}));

import { CallService } from '../../../services/CallService';

const CALL_ID = '6650000000000000000000aa';
const CONVERSATION_ID = '6650000000000000000000bb';
const INITIATOR_USER_ID = '6650000000000000000000cc';

function build(existing: { id: string; metadata: unknown } | null) {
  const prisma = {
    callSession: {
      findUnique: jest.fn<any>().mockResolvedValue({
        id: CALL_ID,
        conversationId: CONVERSATION_ID,
        initiatorId: INITIATOR_USER_ID,
        status: 'ended',
        endReason: 'completed',
        duration: 272,
        answeredAt: new Date('2026-09-30T10:00:00Z'),
        metadata: { type: 'audio' }
      }),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 1 })
    },
    participant: { findFirst: jest.fn<any>().mockResolvedValue({ id: 'p-init' }) },
    message: {
      findFirst: jest.fn<any>().mockResolvedValue(existing),
      create: jest.fn<any>().mockResolvedValue({ id: 'm1', conversationId: CONVERSATION_ID }),
      update: jest.fn<any>().mockResolvedValue({ id: 'm1', conversationId: CONVERSATION_ID })
    }
  };
  return { sut: new CallService(prisma as never), prisma };
}

describe('CallService.createCallSummaryMessage — crédit d\'appel', () => {
  beforeEach(() => mockCredit.mockReset());

  it('crédite à la création du résumé terminal', async () => {
    const { sut } = build(null);
    const result = await sut.createCallSummaryMessage(CALL_ID);

    expect(result?.kind).toBe('created');
    expect(mockCredit).toHaveBeenCalledWith(CALL_ID);
  });

  it('crédite à la conversion du message « en cours »', async () => {
    const { sut } = build({ id: 'm1', metadata: { kind: 'call-live' } });
    const result = await sut.createCallSummaryMessage(CALL_ID);

    expect(result?.kind).toBe('updated');
    expect(mockCredit).toHaveBeenCalledWith(CALL_ID);
  });

  it('ne crédite pas quand le résumé terminal existe déjà', async () => {
    const { sut } = build({ id: 'm1', metadata: { kind: 'call' } });
    const result = await sut.createCallSummaryMessage(CALL_ID);

    expect(result).toBeNull();
    expect(mockCredit).not.toHaveBeenCalled();
  });

  it('ne crédite pas un appel non terminé', async () => {
    const { sut, prisma } = build(null);
    prisma.callSession.findUnique.mockResolvedValue({
      id: CALL_ID,
      conversationId: CONVERSATION_ID,
      initiatorId: INITIATOR_USER_ID,
      status: 'active',
      endReason: null,
      duration: null,
      answeredAt: new Date(),
      metadata: { type: 'audio' }
    });
    await sut.createCallSummaryMessage(CALL_ID);

    expect(mockCredit).not.toHaveBeenCalled();
  });
});
