/**
 * #12518 — dans une conversation chiffrée de bout en bout, le serveur ne reçoit
 * AUCUN contenu en clair et ne fait tourner AUCUN pipeline sur ce qu'il relaie.
 *
 * Avant ce lot, `plaintextRefusedIn` n'examinait que le TEXTE : un message sans
 * texte passait, donc un vocal arrivait en clair, partait à Whisper, à la
 * traduction, au TTS et au clonage de voix. Aucun chemin de la passerelle ne
 * reçoit aujourd'hui un fichier chiffré par l'appareil (#10789) — le seul
 * chemin « chiffré » (`uploadEncryptedFile`) reçoit le CLAIR puis le chiffre
 * lui-même. Toute pièce portée dans une conversation e2ee est donc une pièce
 * que le serveur a lue : elle est refusée, qu'elle soit rattachée, transférée
 * ou recopiée par une diffusion.
 *
 * Les témoins passent par `saveMessage`, point de convergence de REST et du
 * socket `message:send-with-attachments`, et observent ce qui est ÉCRIT ou
 * DISPATCHÉ — jamais un calcul intermédiaire.
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

const E2EE = { encryptionMode: 'e2ee', encryptionEnabledAt: new Date('2026-01-01T00:00:00Z'), serverEncryptionKeyId: null };
const CLEAR = { encryptionMode: null, encryptionEnabledAt: null, serverEncryptionKeyId: null };

const VOICE_NOTE = {
  id: 'audio-att', mimeType: 'audio/mp4', fileUrl: 'https://cdn/a.m4a',
  filePath: '/uploads/a.m4a', duration: 10, metadata: null, transcription: null,
};

function harness(regime: typeof E2EE | typeof CLEAR, sourceAttachments: unknown[] = []) {
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
      findMany: jest.fn<any>().mockImplementation(async ({ where }: any) =>
        where?.messageId === SOURCE_ID || where?.messageId?.in?.includes?.(SOURCE_ID) ? sourceAttachments : [VOICE_NOTE]),
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
// #3706 — le seul chiffré admis en e2ee est un envoi libsignal par appareil. Ici
// aucun autre appareil n'existe dans la conversation : l'envoi n'adresse personne
// et Sesame l'admet tel quel.
const sealed = {
  encryptedContent: 'libsignal-v1',
  encryptionMetadata: { mode: 'e2ee', ciphertext: 'libsignal-v1', protocol: 'libsignal-v1', senderDeviceId: 1 },
  e2eeRelay: { protocol: 'libsignal-v1', senderDeviceId: 1, sessionId: SENDER_SESSION, envelopes: [], unapprovedOwnDevices: [] },
} as const;
const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('conversation e2ee — aucune pièce en clair n’est admise', () => {
  it('refuse un vocal rattaché, sans rien écrire ni dispatcher', async () => {
    const { prisma, processor, processAudioAttachment } = harness(E2EE);

    await expect(processor.saveMessage({ ...send, attachmentIds: ['audio-att'] }))
      .rejects.toMatchObject({ code: E2EE_PLAINTEXT_REFUSED });
    await flush();

    expect(prisma.message.create).not.toHaveBeenCalled();
    expect(mockAssociateAttachmentsToMessage).not.toHaveBeenCalled();
    expect(processAudioAttachment).not.toHaveBeenCalled();
  });

  it('dit pourquoi : une pièce jointe, pas un texte', async () => {
    const { processor } = harness(E2EE);

    await expect(processor.saveMessage({ ...send, ...sealed, attachmentIds: ['audio-att'] }))
      .rejects.toThrow(/pièce jointe/);
  });

  it('refuse la recopie d’une diffusion (copyAttachmentsFromMessageId)', async () => {
    const { prisma, processor } = harness(E2EE, [VOICE_NOTE]);

    await expect(processor.saveMessage({ ...send, ...sealed, copyAttachmentsFromMessageId: SOURCE_ID }))
      .rejects.toMatchObject({ code: E2EE_PLAINTEXT_REFUSED });
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it('refuse un transfert qui recopierait les pièces de sa source', async () => {
    const { prisma, processor } = harness(E2EE, [{ id: 'src-att' }]);

    await expect(processor.saveMessage({ ...send, ...sealed, forwardedFromId: SOURCE_ID, forwardImposes: null }))
      .rejects.toMatchObject({ code: E2EE_PLAINTEXT_REFUSED });
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it('admet un transfert chiffré dont la source ne porte aucune pièce', async () => {
    const { prisma, processor } = harness(E2EE, []);

    await processor.saveMessage({ ...send, ...sealed, forwardedFromId: SOURCE_ID, forwardImposes: null });

    expect(prisma.message.create).toHaveBeenCalledTimes(1);
  });

  it('admet un transfert dont l’admission ne recopie rien (sélection vide)', async () => {
    const { prisma, processor } = harness(E2EE, [{ id: 'src-att' }]);

    await processor.saveMessage({ ...send, ...sealed, forwardedFromId: SOURCE_ID, forwardImposes: null, forwardCopySelection: [] });

    expect(prisma.message.create).toHaveBeenCalledTimes(1);
  });
});

describe('conversation e2ee — rien du texte ne quitte la garde', () => {
  it('refuse un clair glissé À CÔTÉ d’un chiffré, sans fabriquer de lien suivi', async () => {
    const { prisma, processor } = harness(E2EE);

    await expect(processor.saveMessage({ ...send, ...sealed, content: 'voir https://exemple.org/secret' }))
      .rejects.toMatchObject({ code: E2EE_PLAINTEXT_REFUSED });

    expect(mockProcessExplicitLinksInContent).not.toHaveBeenCalled();
    expect(mockCollectContentTrackingLinks).not.toHaveBeenCalled();
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it('admet le littéral « [Encrypted] » que les clients posent à côté du chiffré, et ne persiste que lui', async () => {
    const { prisma, processor } = harness(E2EE);

    await processor.saveMessage({ ...send, ...sealed, content: '[Encrypted]' });

    const written = prisma.message.create.mock.calls[0][0].data;
    expect(written.content).toBe('[Encrypted]');
    expect(written.encryptedContent).toBe('libsignal-v1');
    expect(mockProcessExplicitLinksInContent).not.toHaveBeenCalled();
  });

  it('le mode écrit est celui de la CONVERSATION, jamais celui que le client déclare', async () => {
    const { prisma, processor } = harness(E2EE);

    await processor.saveMessage({
      ...send,
      ...sealed,
      encryptionMetadata: { ...sealed.encryptionMetadata, mode: 'server' },
    });

    expect(prisma.message.create.mock.calls[0][0].data.encryptionMode).toBe('e2ee');
  });

  it('un type « system » déclaré par le client ne retire pas le mode e2ee du message', async () => {
    const { prisma, processor } = harness(E2EE);

    await processor.saveMessage({ ...send, messageType: 'system' });

    expect(prisma.message.create.mock.calls[0][0].data.encryptionMode).toBe('e2ee');
  });
});

describe('conversation en clair — les pipelines serveur restent intacts (non-régression)', () => {
  it('un vocal part toujours à la transcription', async () => {
    const { processor, processAudioAttachment } = harness(CLEAR);

    await processor.saveMessage({ ...send, attachmentIds: ['audio-att'] });
    await flush();

    expect(mockAssociateAttachmentsToMessage).toHaveBeenCalledTimes(1);
    expect(processAudioAttachment).toHaveBeenCalledWith(expect.objectContaining({ attachmentId: 'audio-att' }));
  });

  it('les liens du texte sont toujours suivis', async () => {
    const { prisma, processor } = harness(CLEAR);
    prisma.participant.findUnique.mockResolvedValue({ userId: 'u1', type: 'user' });

    await processor.saveMessage({ ...send, content: 'voir https://exemple.org/page' });

    expect(mockCollectContentTrackingLinks).toHaveBeenCalled();
  });
});
