/**
 * #10789 — une pièce jointe chiffrée de bout en bout entre dans une
 * conversation `e2ee`, et nulle part ailleurs.
 *
 * Le blob (`encryptionMode: 'e2ee'`, rangé opaque par la porte TUS) est la
 * SEULE pièce admise en `e2ee`, à trois conditions : déposé par l'expéditeur,
 * pas encore rattaché, et porté par un envoi libsignal (le pointeur — clé,
 * condensat — voyage dans les enveloppes ; sans elles, personne ne le lirait).
 * Une pièce en clair garde le refus de #12518, lisible par les anciens clients.
 * Hors `e2ee`, un blob est refusé `E2EE_REGIME_CHANGED` : aucun appareil n'y a
 * de quoi l'ouvrir.
 *
 * Témoins par `saveMessage` (convergence de REST et du socket), sur ce qui est
 * ÉCRIT ou DISPATCHÉ.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { PrismaClient, Message } from '@meeshy/shared/prisma/client';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
    warn: jest.fn(),
  },
  performanceLogger: {
    withTiming: jest.fn().mockImplementation((_name: unknown, fn: () => unknown) => fn()),
  },
}));

const mockProcessExplicitLinksInContent = jest.fn(
  async ({ content }: { content: string }) => ({ processedContent: content, trackingLinks: [] })
) as jest.Mock<any>;
const mockCollectContentTrackingLinks = jest.fn(async () => []) as jest.Mock<any>;
jest.mock('../../../../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({
    findExistingTrackingLink: jest.fn(),
    createTrackingLink: jest.fn(),
    collectContentTrackingLinks: (...a: any[]) => mockCollectContentTrackingLinks(...a),
    processExplicitLinksInContent: (...a: any[]) => mockProcessExplicitLinksInContent(...a),
  })),
}));

jest.mock('../../../../services/MentionService', () => ({
  MentionService: jest.fn().mockImplementation(() => ({
    extractMentions: jest.fn().mockReturnValue([]),
    extractMentionsWithParticipants: jest.fn().mockReturnValue([]),
    resolveUsernames: jest.fn(async () => new Map()),
    validateMentionPermissions: jest.fn(async () => ({ validUserIds: [] })),
    createMentions: jest.fn(),
  })),
}));

jest.mock('../../../../services/EncryptionService', () => ({
  EncryptionService: jest.fn().mockImplementation(() => ({
    encryptMessage: jest.fn(),
    encryptHybridServerLayer: jest.fn(),
  })),
}));

jest.mock('../../../../services/message-translation/MessageTranslationService', () => ({
  MessageTranslationService: jest.fn().mockImplementation(() => ({})),
}));

const mockAssociateAttachmentsToMessage = jest.fn() as jest.Mock<any>;
jest.mock('../../../../services/attachments', () => ({
  AttachmentService: jest.fn().mockImplementation(() => ({
    associateAttachmentsToMessage: (...a: any[]) => mockAssociateAttachmentsToMessage(...a),
  })),
}));

jest.mock('../../../../utils/transcription', () => ({
  shouldProcessAudioAttachment: () => true,
}));

import { MessageProcessor } from '../../../../services/messaging/MessageProcessor';
import { E2EE_PLAINTEXT_REFUSED } from '../../../../services/messaging/e2eePlaintextAdmission';
import { createFakeE2EEStore } from '../../../../services/e2ee/__tests__/fake-e2ee-store';

const CONV_ID = '507f1f77bcf86cd799439011';
const SENDER_ID = '507f1f77bcf86cd799439022';
const MSG_ID = '507f1f77bcf86cd799439033';
const SOURCE_ID = '507f1f77bcf86cd799439044';
const SENDER_USER_ID = '507f1f77bcf86cd799439055';
const SENDER_SESSION = '507f1f77bcf86cd799439066';
const OTHER_USER_ID = '507f1f77bcf86cd799439077';

const E2EE = { encryptionMode: 'e2ee', encryptionEnabledAt: new Date('2026-01-01T00:00:00Z'), serverEncryptionKeyId: null };
const CLEAR = { encryptionMode: null, encryptionEnabledAt: null, serverEncryptionKeyId: null };

type Piece = { id: string; encryptionMode?: string | null; uploadedBy: string; messageId?: string | null };

const blob = (id: string, over: Partial<Piece> = {}): Piece =>
  ({ id, encryptionMode: 'e2ee', uploadedBy: SENDER_USER_ID, messageId: null, ...over });
const voiceNote = (id: string): Piece => ({ id, encryptionMode: null, uploadedBy: SENDER_USER_ID, messageId: null });

function harness(regime: typeof E2EE | typeof CLEAR, pieces: Piece[], sourcePieces: Piece[] = []) {
  const created = (data: Record<string, unknown>) => ({
    id: MSG_ID, conversationId: CONV_ID, senderId: SENDER_ID, messageType: 'text', attachments: [],
    createdAt: new Date(), ...data,
  }) as unknown as Message;
  const store = createFakeE2EEStore();
  store.collections.E2EEDevice.insert({ userId: SENDER_USER_ID, deviceId: 1, registrationId: 7, sessionId: SENDER_SESSION });
  const prisma = {
    e2EEDevice: store.prisma.e2EEDevice,
    messageEnvelope: store.prisma.messageEnvelope,
    conversation: { findUnique: jest.fn<any>().mockResolvedValue(regime) },
    message: {
      create: jest.fn<any>().mockImplementation(async ({ data }: any) => created(data)),
      findFirst: jest.fn<any>().mockResolvedValue(null),
      findUnique: jest.fn<any>().mockResolvedValue(null),
      update: jest.fn<any>().mockResolvedValue({}),
      delete: jest.fn<any>().mockResolvedValue({}),
    },
    messageAttachment: {
      findMany: jest.fn<any>().mockImplementation(async ({ where }: any) => {
        if (where?.messageId === SOURCE_ID) return sourcePieces;
        const ids: string[] = where?.id?.in ?? [];
        return pieces.filter((piece) => ids.includes(piece.id));
      }),
      create: jest.fn<any>().mockResolvedValue({}),
      updateMany: jest.fn<any>().mockResolvedValue({}),
    },
    participant: {
      findUnique: jest.fn<any>().mockResolvedValue({ userId: SENDER_USER_ID }),
      findFirst: jest.fn<any>().mockResolvedValue(null),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    trackingLink: { updateMany: jest.fn<any>().mockResolvedValue({}) },
    user: { findUnique: jest.fn<any>().mockResolvedValue(null), findMany: jest.fn<any>().mockResolvedValue([]) },
    post: { findUnique: jest.fn<any>().mockResolvedValue(null) },
  };
  const processAudioAttachment = jest.fn<any>().mockResolvedValue(undefined);
  const processor = new MessageProcessor(prisma as unknown as PrismaClient, undefined, { processAudioAttachment } as never);
  return { prisma, processor, processAudioAttachment };
}

const send = { conversationId: CONV_ID, senderId: SENDER_ID, content: '', originalLanguage: 'fr' } as const;
const sealed = {
  encryptedContent: 'libsignal-v1',
  encryptionMetadata: { mode: 'e2ee', ciphertext: 'libsignal-v1', protocol: 'libsignal-v1', senderDeviceId: 1 },
  e2eeRelay: { protocol: 'libsignal-v1', senderDeviceId: 1, sessionId: SENDER_SESSION, envelopes: [], unapprovedOwnDevices: [] },
} as const;
const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('conversation e2ee — le blob chiffré sur l’appareil est la seule pièce admise', () => {
  it('rattache les blobs de l’expéditeur à son envoi libsignal, sans aucun pipeline serveur', async () => {
    const { prisma, processor, processAudioAttachment } = harness(E2EE, [blob('photo'), blob('affiche')]);

    await processor.saveMessage({ ...send, ...sealed, attachmentIds: ['photo', 'affiche'] });
    await flush();

    expect(prisma.message.create).toHaveBeenCalledTimes(1);
    expect(mockAssociateAttachmentsToMessage).toHaveBeenCalledWith(['photo', 'affiche'], MSG_ID, expect.anything());
    expect(processAudioAttachment).not.toHaveBeenCalled();
    expect(prisma.message.create.mock.calls[0][0].data.encryptionMode).toBe('e2ee');
  });

  it('refuse un blob sans enveloppe : personne n’aurait sa clé', async () => {
    const { prisma, processor } = harness(E2EE, [blob('photo')]);

    await expect(processor.saveMessage({ ...send, attachmentIds: ['photo'] }))
      .rejects.toMatchObject({ code: 'E2EE_ATTACHMENT_INVALID' });
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it('refuse le blob d’un autre compte', async () => {
    const { prisma, processor } = harness(E2EE, [blob('photo', { uploadedBy: OTHER_USER_ID })]);

    await expect(processor.saveMessage({ ...send, ...sealed, attachmentIds: ['photo'] }))
      .rejects.toMatchObject({ code: 'E2EE_ATTACHMENT_INVALID' });
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it('refuse un blob déjà rattaché à un autre message', async () => {
    const { prisma, processor } = harness(E2EE, [blob('photo', { messageId: SOURCE_ID })]);

    await expect(processor.saveMessage({ ...send, ...sealed, attachmentIds: ['photo'] }))
      .rejects.toMatchObject({ code: 'E2EE_ATTACHMENT_INVALID' });
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it('refuse un lot qui glisse une pièce en clair à côté d’un blob, sous le refus que les anciens clients lisent', async () => {
    const { prisma, processor, processAudioAttachment } = harness(E2EE, [blob('photo'), voiceNote('vocal')]);

    await expect(processor.saveMessage({ ...send, ...sealed, attachmentIds: ['photo', 'vocal'] }))
      .rejects.toMatchObject({ code: E2EE_PLAINTEXT_REFUSED });
    await flush();
    expect(prisma.message.create).not.toHaveBeenCalled();
    expect(processAudioAttachment).not.toHaveBeenCalled();
  });

  it('refuse un identifiant inconnu comme une pièce en clair (fail-closed)', async () => {
    const { prisma, processor } = harness(E2EE, []);

    await expect(processor.saveMessage({ ...send, ...sealed, attachmentIds: ['fantome'] }))
      .rejects.toMatchObject({ code: E2EE_PLAINTEXT_REFUSED });
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it('un ancien client qui envoie une pièce en clair reçoit le refus lisible', async () => {
    const { processor } = harness(E2EE, [voiceNote('vocal')]);

    await expect(processor.saveMessage({ ...send, attachmentIds: ['vocal'] })).rejects.toThrow(/pièce jointe en clair/);
  });
});

describe('conversation en clair — un blob chiffré n’y entre pas', () => {
  it('refuse un blob rattaché : 409, le régime a changé', async () => {
    const { prisma, processor } = harness(CLEAR, [blob('photo')]);

    await expect(processor.saveMessage({ ...send, attachmentIds: ['photo'] }))
      .rejects.toMatchObject({ code: 'E2EE_REGIME_CHANGED' });
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it('une pièce ordinaire passe toujours (non-régression)', async () => {
    const { prisma, processor } = harness(CLEAR, [voiceNote('vocal')]);

    await processor.saveMessage({ ...send, attachmentIds: ['vocal'] });

    expect(prisma.message.create).toHaveBeenCalledTimes(1);
  });
});
