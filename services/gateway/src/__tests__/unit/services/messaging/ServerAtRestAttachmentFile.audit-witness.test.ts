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

jest.mock('../../../../utils/transcription', () => ({
  shouldProcessAudioAttachment: () => true,
}));


import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { MessageProcessor } from '../../../../services/messaging/MessageProcessor';

const CONV_ID = '507f1f77bcf86cd799439011';
const SENDER_ID = '507f1f77bcf86cd799439022';
const MSG_ID = '507f1f77bcf86cd799439033';
const SENDER_USER_ID = '507f1f77bcf86cd799439055';
const SECRET = 'GPS-48.8566N-PASSEPORT-JEAN';
const PLAIN = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1]), Buffer.from(SECRET, 'ascii'), Buffer.alloc(256, 7)]);

const regime = (mode: 'server' | 'hybrid') => ({ encryptionMode: mode, encryptionEnabledAt: new Date('2026-01-01T00:00:00Z'), serverEncryptionKeyId: 'k1' });

function harness(mode: 'server' | 'hybrid', relPath: string) {
  const piece = { id: 'photo', encryptionMode: null, isEncrypted: false, uploadedBy: SENDER_USER_ID, messageId: null, filePath: relPath, originalName: 'passeport-de-jean.jpg', mimeType: 'image/jpeg' };
  const updates: Array<Record<string, unknown>> = [];
  const prisma = {
    conversation: { findUnique: jest.fn<any>().mockResolvedValue(regime(mode)) },
    message: {
      create: jest.fn<any>().mockImplementation(async ({ data }: any) => ({ id: MSG_ID, conversationId: CONV_ID, senderId: SENDER_ID, messageType: 'image', attachments: [], createdAt: new Date(), ...data }) as unknown as Message),
      findFirst: jest.fn<any>().mockResolvedValue(null),
      findUnique: jest.fn<any>().mockResolvedValue(null),
      update: jest.fn<any>().mockResolvedValue({}),
      delete: jest.fn<any>().mockResolvedValue({}),
    },
    messageAttachment: {
      findMany: jest.fn<any>().mockResolvedValue([piece]),
      findUnique: jest.fn<any>().mockResolvedValue(piece),
      create: jest.fn<any>().mockResolvedValue({}),
      update: jest.fn<any>().mockImplementation(async (args: any) => { updates.push(args.data); return {}; }),
      updateMany: jest.fn<any>().mockImplementation(async (args: any) => { updates.push(args.data); return { count: 1 }; }),
    },
    participant: { findUnique: jest.fn<any>().mockResolvedValue({ userId: SENDER_USER_ID }), findFirst: jest.fn<any>().mockResolvedValue(null), findMany: jest.fn<any>().mockResolvedValue([]) },
    trackingLink: { updateMany: jest.fn<any>().mockResolvedValue({}) },
    user: { findUnique: jest.fn<any>().mockResolvedValue(null), findMany: jest.fn<any>().mockResolvedValue([]) },
    post: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    serverEncryptionKey: { findUnique: jest.fn<any>().mockResolvedValue(null) },
  };
  const processor = new MessageProcessor(prisma as unknown as PrismaClient, undefined, { processAudioAttachment: jest.fn<any>().mockResolvedValue(undefined) } as never);
  return { processor, updates };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe.each(['server', 'hybrid'] as const)('AUDIT — une photo d’une conversation %s est chiffrée au repos', (mode) => {
  let uploadDir: string;
  const relPath = '2026/10/u/photo.jpg';
  beforeEach(async () => {
    uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-at-rest-'));
    process.env.UPLOAD_PATH = uploadDir;
    await fs.mkdir(path.dirname(path.join(uploadDir, relPath)), { recursive: true });
    await fs.writeFile(path.join(uploadDir, relPath), PLAIN);
  });
  afterEach(async () => { await fs.rm(uploadDir, { recursive: true, force: true }); });

  it('aucun octet clair de la photo ne reste sur le disque une fois le message enregistré', async () => {
    const { processor } = harness(mode, relPath);
    await processor.saveMessage({ conversationId: CONV_ID, senderId: SENDER_ID, content: '', originalLanguage: 'fr', attachmentIds: ['photo'] } as never);
    await flush();
    const files = await fs.readdir(path.join(uploadDir, '2026/10/u'));
    const contents = await Promise.all(files.map((f) => fs.readFile(path.join(uploadDir, '2026/10/u', f))));
    expect(contents.some((bytes) => bytes.includes(Buffer.from(SECRET)))).toBe(false);
  });

});
