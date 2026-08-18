/**
 * « No one can write » — la porte que le canal le plus intrusif n'avait pas.
 *
 * `Conversation.closedAt` est documenté par le schéma comme « Conversation
 * closed for all — no one can write, messages stay readable ». Le texte, les
 * éditions et les réactions respectent cette phrase ; l'APPEL ne la connaissait
 * pas. Or un appel n'est pas un canal à part : `postLiveCallMessage` puis le
 * résumé terminal écrivent des lignes `Message` DANS la conversation, et
 * l'éventail de sonnerie réveille tous les membres (socket + push VoIP
 * `bypassDnd`).
 *
 * `initiateCall` est le point de passage UNIQUE des deux transports d'ouverture
 * (`call:initiate` socket, `POST /calls` REST) : la garde s'y pose une fois.
 *
 * Périmètre assumé : seule l'OUVERTURE est refusée. Un appel déjà en cours au
 * moment de la clôture va à son terme — couper la parole à des gens qui se
 * parlent serait une régression, et ses messages sont déjà écrits.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

import { CallService } from '../../../services/CallService';
import { CALL_ERROR_CODES } from '@meeshy/shared/types/video-call';

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

jest.mock('../../../services/TURNCredentialService', () => ({
  TURNCredentialService: jest.fn().mockImplementation(() => ({
    generateCredentials: jest.fn().mockReturnValue([]),
    isConfigured: jest.fn().mockReturnValue(true),
    getStatus: jest.fn().mockReturnValue({})
  }))
}));

const INITIATE = {
  conversationId: 'conv-123',
  initiatorId: 'user-123',
  participantId: 'participant-123',
  type: 'video' as const
};

const createMockPrisma = () => ({
  conversation: {
    findUnique: jest.fn() as jest.Mock<any>,
    findFirst: jest.fn() as jest.Mock<any>,
    updateMany: (jest.fn() as jest.Mock<any>).mockResolvedValue({ count: 1 })
  },
  participant: {
    findFirst: (jest.fn() as jest.Mock<any>).mockResolvedValue({
      id: 'participant-123',
      conversationId: 'conv-123',
      userId: 'user-123',
      isActive: true
    })
  },
  callSession: {
    create: jest.fn() as jest.Mock<any>,
    findUnique: jest.fn() as jest.Mock<any>,
    findFirst: (jest.fn() as jest.Mock<any>).mockResolvedValue(null),
    update: jest.fn() as jest.Mock<any>,
    updateMany: (jest.fn() as jest.Mock<any>).mockResolvedValue({ count: 1 })
  },
  callParticipant: {
    create: jest.fn() as jest.Mock<any>,
    findFirst: jest.fn() as jest.Mock<any>,
    findMany: (jest.fn() as jest.Mock<any>).mockResolvedValue([]),
    update: jest.fn() as jest.Mock<any>,
    updateMany: jest.fn() as jest.Mock<any>
  },
  message: {
    create: jest.fn() as jest.Mock<any>,
    findFirst: (jest.fn() as jest.Mock<any>).mockResolvedValue(null),
    update: jest.fn() as jest.Mock<any>
  },
  $transaction: jest.fn() as jest.Mock<any>
});

const OPEN_CONVERSATION = {
  id: 'conv-123',
  identifier: 'test-conversation',
  type: 'direct',
  isActive: true,
  closedAt: null
};

describe('CallService.initiateCall — conversation close', () => {
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let callService: CallService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma = createMockPrisma();
    callService = new CallService(mockPrisma as any);
  });

  it('refuse une conversation fermée par closedAt', async () => {
    mockPrisma.conversation.findUnique.mockResolvedValue({
      ...OPEN_CONVERSATION,
      closedAt: new Date('2026-08-18T09:00:00.000Z')
    });

    await expect(callService.initiateCall(INITIATE)).rejects.toThrow(
      `${CALL_ERROR_CODES.CONVERSATION_CLOSED}: Conversation is closed`
    );
  });

  /**
   * La population héritée : les fils fermés par l'ancien `leave.ts` (avant le
   * cycle 67) portent `isActive: false` et AUCUN `closedAt`, et rien ne les
   * rétro-remplit. Lire une seule des deux colonnes les rend tous appelables.
   */
  it('refuse une conversation fermée par isActive: false, sans closedAt', async () => {
    mockPrisma.conversation.findUnique.mockResolvedValue({
      ...OPEN_CONVERSATION,
      isActive: false
    });

    await expect(callService.initiateCall(INITIATE)).rejects.toThrow(
      `${CALL_ERROR_CODES.CONVERSATION_CLOSED}: Conversation is closed`
    );
  });

  /**
   * Le refus doit tomber AVANT toute écriture : ni revendication d'appel actif
   * (`conversation.updateMany`), ni session, ni message dans le fil mort.
   */
  it('n\'écrit rien quand la conversation est fermée', async () => {
    mockPrisma.conversation.findUnique.mockResolvedValue({
      ...OPEN_CONVERSATION,
      isActive: false,
      closedAt: new Date('2026-08-18T09:00:00.000Z')
    });

    await expect(callService.initiateCall(INITIATE)).rejects.toThrow();

    expect(mockPrisma.conversation.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.callSession.create).not.toHaveBeenCalled();
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
  });

  /**
   * La garde de REQUÊTE (leçon du cycle 70-bis) : `isConversationClosed` accepte
   * une ligne partielle, donc un `select` amputé d'une colonne compile et rend
   * les témoins ci-dessus verts tout en rouvrant la porte en production. Seule
   * une assertion sur la requête peut voir cette régression.
   */
  it('demande les deux colonnes terminales dans son select', async () => {
    mockPrisma.conversation.findUnique.mockResolvedValue(OPEN_CONVERSATION);
    mockPrisma.$transaction.mockResolvedValue({ id: 'call-123' });
    mockPrisma.callSession.findUnique.mockResolvedValue({
      id: 'call-123',
      participants: [],
      initiator: { id: 'user-123', username: 'testuser', displayName: 'Test', avatar: null }
    });

    await callService.initiateCall(INITIATE).catch(() => undefined);

    const select = mockPrisma.conversation.findUnique.mock.calls[0][0]?.select;
    expect(select).toMatchObject({ isActive: true, closedAt: true });
  });

  it('laisse passer une conversation ouverte', async () => {
    mockPrisma.conversation.findUnique.mockResolvedValue(OPEN_CONVERSATION);
    mockPrisma.$transaction.mockResolvedValue({ id: 'call-123' });
    mockPrisma.callSession.findUnique.mockResolvedValue({
      id: 'call-123',
      participants: [],
      initiator: { id: 'user-123', username: 'testuser', displayName: 'Test', avatar: null }
    });

    await expect(callService.initiateCall(INITIATE)).resolves.toBeDefined();
    expect(mockPrisma.$transaction).toHaveBeenCalled();
  });
});
