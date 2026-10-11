/**
 * QUI PEUT LANCER UN APPEL (#10207, directive porteur du 2026-10-11) :
 * « Il ne faut plus afficher la possibilité d'appeler pour les conversations
 * de type 'global' ! Et seul le créateur et les admin peuvent lancer les calls
 * pour les conversations de type 'public' ».
 *
 * `initiateCall` est le point de passage UNIQUE des deux transports
 * d'ouverture (`call:initiate`, `POST /calls`) : la loi partagée
 * `canStartCall` (`@meeshy/shared/utils/call-permission`) s'y applique une
 * fois, fail-closed, AVANT toute écriture. Rejoindre un appel en cours n'est
 * pas gouverné ici.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

import { CallService } from '../../../services/CallService';
import { CALL_ERROR_CODES } from '@meeshy/shared/types/video-call';

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
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

type Membership = { readonly type: string; readonly role: string; readonly userId: string | null };
type Fixture = {
  readonly conversationType: string;
  readonly membership?: Membership;
  readonly platformRole?: string;
};

const MEMBER: Membership = { type: 'user', role: 'member', userId: 'user-123' };

const createMockPrisma = ({ conversationType, membership = MEMBER, platformRole = 'USER' }: Fixture) => ({
  conversation: {
    findUnique: (jest.fn() as jest.Mock<any>).mockResolvedValue({
      id: 'conv-123',
      identifier: 'conv',
      type: conversationType,
      isActive: true,
      closedAt: null
    }),
    findFirst: jest.fn() as jest.Mock<any>,
    updateMany: (jest.fn() as jest.Mock<any>).mockResolvedValue({ count: 1 })
  },
  user: {
    findUnique: (jest.fn() as jest.Mock<any>).mockResolvedValue({ role: platformRole }),
    findMany: (jest.fn() as jest.Mock<any>).mockResolvedValue([])
  },
  participant: {
    findMany: (jest.fn() as jest.Mock<any>).mockResolvedValue([]),
    findFirst: (jest.fn() as jest.Mock<any>).mockResolvedValue({
      id: 'participant-123',
      conversationId: 'conv-123',
      isActive: true,
      ...membership
    })
  },
  friendRequest: { findFirst: (jest.fn() as jest.Mock<any>).mockResolvedValue(null) },
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
  $transaction: (jest.fn() as jest.Mock<any>).mockRejectedValue(new Error('STOP_AFTER_ADMISSION'))
});

const attempt = async (fixture: Fixture) => {
  const prisma = createMockPrisma(fixture);
  const service = new CallService(prisma as any);
  const error = await service.initiateCall(INITIATE).then(() => null, (e: unknown) => e as Error);
  return { prisma, message: error?.message ?? '' };
};

const refusedAs = (message: string, code: string) => message.startsWith(`${code}:`);

describe('CallService.initiateCall — qui peut lancer un appel (#10207)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('refuse un appel dans une conversation global, même au BIGBOSS créateur, sans rien écrire', async () => {
    const { prisma, message } = await attempt({
      conversationType: 'global',
      membership: { type: 'user', role: 'creator', userId: 'user-123' },
      platformRole: 'BIGBOSS'
    });

    expect(refusedAs(message, CALL_ERROR_CODES.VIDEO_CALLS_NOT_SUPPORTED)).toBe(true);
    expect(prisma.conversation.updateMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuse un membre ordinaire d’une conversation public avec CALL_NOT_ALLOWED, sans rien écrire', async () => {
    const { prisma, message } = await attempt({ conversationType: 'public' });

    expect(refusedAs(message, CALL_ERROR_CODES.CALL_NOT_ALLOWED)).toBe(true);
    expect(prisma.conversation.updateMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuse un modérateur de conversation public', async () => {
    const { message } = await attempt({
      conversationType: 'public',
      membership: { type: 'user', role: 'moderator', userId: 'user-123' },
      platformRole: 'MODERATOR'
    });

    expect(refusedAs(message, CALL_ERROR_CODES.CALL_NOT_ALLOWED)).toBe(true);
  });

  it('laisse passer le créateur d’une conversation public (casse historique comprise)', async () => {
    const { message } = await attempt({
      conversationType: 'public',
      membership: { type: 'user', role: 'CREATOR', userId: 'user-123' }
    });

    expect(message).toBe('STOP_AFTER_ADMISSION');
  });

  it('laisse passer un admin de la conversation public', async () => {
    const { message } = await attempt({
      conversationType: 'public',
      membership: { type: 'user', role: 'admin', userId: 'user-123' }
    });

    expect(message).toBe('STOP_AFTER_ADMISSION');
  });

  it('laisse passer un administrateur plateforme membre d’une conversation public, en lisant SON rôle', async () => {
    const { prisma, message } = await attempt({ conversationType: 'public', platformRole: 'ADMIN' });

    expect(message).toBe('STOP_AFTER_ADMISSION');
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user-123' } })
    );
  });

  it('refuse un invité (participant sans compte), même dans un group', async () => {
    const { message } = await attempt({
      conversationType: 'group',
      membership: { type: 'anonymous', role: 'admin', userId: null }
    });

    expect(refusedAs(message, CALL_ERROR_CODES.CALL_NOT_ALLOWED)).toBe(true);
  });

  it('laisse un membre ordinaire d’un group lancer l’appel comme avant', async () => {
    const { message } = await attempt({ conversationType: 'group' });

    expect(message).toBe('STOP_AFTER_ADMISSION');
  });

  it('refuse un broadcast avec le code historique VIDEO_CALLS_NOT_SUPPORTED', async () => {
    const { message } = await attempt({ conversationType: 'broadcast' });

    expect(refusedAs(message, CALL_ERROR_CODES.VIDEO_CALLS_NOT_SUPPORTED)).toBe(true);
  });
});
