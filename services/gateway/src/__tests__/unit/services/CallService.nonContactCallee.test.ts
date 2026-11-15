/**
 * « Appels hors contacts » (#8073) — la porte d'OUVERTURE d'un appel direct.
 *
 * `initiateCall` est le point de passage unique de `call:initiate` (socket) et
 * de `POST /calls` (REST). Un interlocuteur qui a coupé le réglage refuse
 * l'appel d'un non-contact AVANT toute écriture : aucune session, donc aucune
 * sonnerie, aucun push, aucun appel manqué. Un ami passe.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

import { CallService } from '../../../services/CallService';
import { CALL_ERROR_CODES } from '@meeshy/shared/types/video-call';
import { clearPrivacyPreferencesCache } from '../../../services/preferences/privacy-cache';
import { closedCallRingTables, openCallRingTables } from '../../helpers/call-ring-policy-tables';

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../services/TURNCredentialService', () => ({
  TURNCredentialService: jest.fn().mockImplementation(() => ({
    generateCredentials: jest.fn().mockReturnValue([]),
    isConfigured: jest.fn().mockReturnValue(true),
    getStatus: jest.fn().mockReturnValue({}),
  })),
}));

const CALLER = '507f1f77bcf86cd799439201';
const CALLEE = '507f1f77bcf86cd799439202';

const INITIATE = {
  conversationId: 'conv-direct',
  initiatorId: CALLER,
  participantId: 'participant-caller',
  type: 'audio' as const,
};

const makePrisma = (ringTables: ReturnType<typeof openCallRingTables>, conversationType: 'direct' | 'group' = 'direct') => ({
  ...ringTables,
  conversation: {
    findUnique: jest.fn<any>().mockResolvedValue({
      id: 'conv-direct',
      identifier: 'conv-direct',
      type: conversationType,
      isActive: true,
      closedAt: null,
    }),
    findFirst: jest.fn<any>(),
    updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
  },
  participant: {
    findFirst: jest.fn<any>().mockResolvedValue({ id: 'participant-caller', userId: CALLER, isActive: true }),
    findMany: jest.fn<any>().mockResolvedValue([{ userId: CALLER }, { userId: CALLEE }]),
  },
  callSession: {
    create: jest.fn<any>(),
    findUnique: jest.fn<any>().mockResolvedValue({
      id: 'call-1',
      participants: [],
      initiator: { id: CALLER, username: 'caller', displayName: 'Caller', avatar: null },
    }),
    findFirst: jest.fn<any>().mockResolvedValue(null),
    update: jest.fn<any>(),
    updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
  },
  callParticipant: {
    create: jest.fn<any>(),
    findFirst: jest.fn<any>(),
    findMany: jest.fn<any>().mockResolvedValue([]),
    update: jest.fn<any>(),
    updateMany: jest.fn<any>(),
  },
  message: {
    create: jest.fn<any>(),
    findFirst: jest.fn<any>().mockResolvedValue(null),
    update: jest.fn<any>(),
  },
  $transaction: jest.fn<any>().mockResolvedValue({ id: 'call-1' }),
});

describe('CallService.initiateCall — « Appels hors contacts » (#8073)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearPrivacyPreferencesCache();
  });

  it("refuse l'appel direct d'un non-contact avec CALLEE_REFUSES_NON_CONTACTS, sans rien écrire", async () => {
    const prisma = makePrisma(closedCallRingTables());
    const service = new CallService(prisma as never);

    await expect(service.initiateCall(INITIATE)).rejects.toThrow(`${CALL_ERROR_CODES.CALLEE_REFUSES_NON_CONTACTS}:`);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.conversation.updateMany).not.toHaveBeenCalled();
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it("laisse un ami accepté faire sonner malgré le réglage coupé", async () => {
    const prisma = makePrisma(closedCallRingTables([{ senderId: CALLEE, receiverId: CALLER }]));
    const service = new CallService(prisma as never);

    await expect(service.initiateCall(INITIATE)).resolves.toBeDefined();
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('laisse passer tout le monde quand le réglage est ouvert', async () => {
    const prisma = makePrisma(openCallRingTables());
    const service = new CallService(prisma as never);

    await expect(service.initiateCall(INITIATE)).resolves.toBeDefined();
  });

  it("n'arrête pas un appel de GROUPE : le non-contact n'y est simplement pas sonné", async () => {
    const prisma = makePrisma(closedCallRingTables(), 'group');
    const service = new CallService(prisma as never);

    await expect(service.initiateCall(INITIATE)).resolves.toBeDefined();
  });
});
