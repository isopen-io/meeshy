/**
 * #13100 — témoin d'audit : une photo d'une conversation `server` ou `hybrid`
 * ne laisse AUCUN octet clair sur le disque une fois le message enregistré —
 * ni l'original, ni sa vignette — et le fichier scellé se rouvre à
 * l'identique pour qui a le droit de le lire.
 *
 * Il passe par `MessageProcessor.saveMessage` (convergence REST + socket) avec
 * le VRAI `AttachmentService`, le VRAI coffre de clés (clé maîtresse de test,
 * clé de conversation enveloppée comme en base) et un `UPLOAD_PATH`
 * temporaire, puis lit le dossier. Il ne prescrit pas OÙ sceller : il ne
 * regarde que les octets.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { PrismaClient, Message } from '@meeshy/shared/prisma/client';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), trace: jest.fn() })),
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

jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: () => ({ getNativeClient: () => null }),
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

jest.mock('../../../../services/message-translation/MessageTranslationService', () => ({
  MessageTranslationService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../../utils/transcription', () => ({
  shouldProcessAudioAttachment: () => true,
}));


import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import * as crypto from 'crypto';
import { MessageProcessor } from '../../../../services/messaging/MessageProcessor';
import { EncryptionService } from '../../../../services/EncryptionService';
import { openSealedStoredBytes, type AtRestFileRecord } from '../../../../services/attachments/atRest/atRestFiles';

const CONV_ID = '507f1f77bcf86cd799439011';
const SENDER_ID = '507f1f77bcf86cd799439022';
const MSG_ID = '507f1f77bcf86cd799439033';
const SENDER_USER_ID = '507f1f77bcf86cd799439055';
const SECRET = 'GPS-48.8566N-PASSEPORT-JEAN';
const PLAIN = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1]), Buffer.from(SECRET, 'ascii'), Buffer.alloc(256, 7)]);

const THUMB_SECRET = 'VIGNETTE-DU-PASSEPORT';
const THUMB = Buffer.concat([Buffer.from('RIFF', 'ascii'), Buffer.from(THUMB_SECRET, 'ascii'), Buffer.alloc(64, 1)]);
const MASTER = crypto.randomBytes(32);
const DATA_KEY = crypto.randomBytes(32);

const regime = (mode: 'server' | 'hybrid') => ({ encryptionMode: mode, encryptionEnabledAt: new Date('2026-01-01T00:00:00Z'), serverEncryptionKeyId: 'k1' });

/** La clé de données `k1` de la conversation, enveloppée sous la clé maîtresse comme `ServerKeyVault.generateKey` la range. */
function wrappedDataKey() {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', MASTER, iv);
  const encryptedKey = Buffer.concat([cipher.update(DATA_KEY), cipher.final()]);
  return { id: 'k1', encryptedKey: encryptedKey.toString('base64'), iv: iv.toString('base64'), authTag: cipher.getAuthTag().toString('base64'), conversationId: CONV_ID, purpose: 'conversation' };
}

function harness(mode: 'server' | 'hybrid', relPath: string, thumbPath: string) {
  const piece = { id: 'photo', encryptionMode: null, isEncrypted: false, uploadedBy: SENDER_USER_ID, messageId: null, filePath: relPath, fileUrl: relPath, thumbnailPath: thumbPath, thumbnailUrl: thumbPath, originalName: 'passeport-de-jean.jpg', mimeType: 'image/jpeg', processingState: null };
  const updates: Array<Record<string, unknown>> = [];
  const sealings = new Map<string, AtRestFileRecord>();
  const key = wrappedDataKey();
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
      findMany: jest.fn<any>().mockImplementation(async ({ where }: any) => (where?.filePath === undefined || where.filePath === piece.filePath ? [{ ...piece }] : [])),
      findUnique: jest.fn<any>().mockImplementation(async () => ({ ...piece })),
      create: jest.fn<any>().mockResolvedValue({}),
      update: jest.fn<any>().mockImplementation(async (args: any) => { updates.push(args.data); return {}; }),
      updateMany: jest.fn<any>().mockImplementation(async (args: any) => {
        updates.push(args.data);
        const hit = args.where?.filePath === undefined || args.where.filePath === piece.filePath;
        if (hit && args.data?.filePath) Object.assign(piece, args.data);
        return { count: hit ? 1 : 0 };
      }),
    },
    participant: { findUnique: jest.fn<any>().mockResolvedValue({ userId: SENDER_USER_ID }), findFirst: jest.fn<any>().mockResolvedValue(null), findMany: jest.fn<any>().mockResolvedValue([]) },
    trackingLink: { updateMany: jest.fn<any>().mockResolvedValue({}) },
    user: { findUnique: jest.fn<any>().mockResolvedValue(null), findMany: jest.fn<any>().mockResolvedValue([]) },
    post: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    serverEncryptionKey: {
      findUnique: jest.fn<any>().mockImplementation(async ({ where }: any) => (where.id === key.id ? key : null)),
      update: jest.fn<any>().mockResolvedValue({}),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    attachmentFileAtRest: {
      findUnique: jest.fn<any>().mockImplementation(async ({ where }: any) => sealings.get(where.storageKey) ?? null),
      upsert: jest.fn<any>().mockImplementation(async ({ create }: any) => { sealings.set(create.storageKey, create); return create; }),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
      findMany: jest.fn<any>().mockImplementation(async ({ where }: any) => [...sealings.values()].filter((r) => r.attachmentId === where.attachmentId)),
      findFirst: jest.fn<any>().mockImplementation(async ({ where }: any) => [...sealings.values()].find((r) => r.replacedKey === where.replacedKey && r.role === where.role) ?? null),
    },
  };
  const processor = new MessageProcessor(prisma as unknown as PrismaClient, undefined, { processAudioAttachment: jest.fn<any>().mockResolvedValue(undefined) } as never);
  const keyring = new EncryptionService(prisma as unknown as PrismaClient);
  return { processor, updates, sealings, keyring };
}

async function reopened(uploadDir: string, record: AtRestFileRecord, keyring: EncryptionService): Promise<Buffer> {
  const absolute = path.join(uploadDir, record.storageKey);
  const size = (await fs.stat(absolute)).size;
  const opened = await openSealedStoredBytes(
    { size, etag: '', open: async (range) => (await import('fs')).createReadStream(absolute, range ? { start: range.start, end: range.end } : {}) },
    record,
    keyring
  ).open();
  const parts: Buffer[] = [];
  for await (const part of opened!) parts.push(part as Buffer);
  return Buffer.concat(parts);
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe.each(['server', 'hybrid'] as const)('AUDIT — une photo d’une conversation %s est chiffrée au repos', (mode) => {
  let uploadDir: string;
  const relPath = '2026/10/u/passeport_de_jean_0f8fad5b-d9cb-469f-a165-70867728950e.jpg';
  const thumbPath = '2026/10/u/passeport_de_jean_0f8fad5b-d9cb-469f-a165-70867728950e_thumb.webp';
  const savedMaster = process.env.ENCRYPTION_MASTER_KEY;
  beforeEach(async () => {
    uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-at-rest-'));
    process.env.UPLOAD_PATH = uploadDir;
    process.env.ENCRYPTION_MASTER_KEY = MASTER.toString('base64');
    process.env.ATTACHMENT_URL_SIGNING_KEY = Buffer.alloc(32, 7).toString('base64');
    await fs.mkdir(path.dirname(path.join(uploadDir, relPath)), { recursive: true });
    await fs.writeFile(path.join(uploadDir, relPath), PLAIN);
    await fs.writeFile(path.join(uploadDir, thumbPath), THUMB);
  });
  afterEach(async () => {
    await fs.rm(uploadDir, { recursive: true, force: true });
    delete process.env.ATTACHMENT_URL_SIGNING_KEY;
    if (savedMaster === undefined) delete process.env.ENCRYPTION_MASTER_KEY;
    else process.env.ENCRYPTION_MASTER_KEY = savedMaster;
  });

  it('aucun octet clair de la photo ne reste sur le disque une fois le message enregistré', async () => {
    const { processor } = harness(mode, relPath, thumbPath);
    await processor.saveMessage({ conversationId: CONV_ID, senderId: SENDER_ID, content: '', originalLanguage: 'fr', attachmentIds: ['photo'] } as never);
    await flush();
    const files = await fs.readdir(path.join(uploadDir, '2026/10/u'));
    const contents = await Promise.all(files.map((f) => fs.readFile(path.join(uploadDir, '2026/10/u', f))));
    expect(contents.some((bytes) => bytes.includes(Buffer.from(SECRET)))).toBe(false);
  });

  it('ni la vignette, ni le nom d’origine, et le fichier scellé se rouvre à l’identique', async () => {
    const { processor, sealings, keyring, updates } = harness(mode, relPath, thumbPath);
    await processor.saveMessage({ conversationId: CONV_ID, senderId: SENDER_ID, content: '', originalLanguage: 'fr', attachmentIds: ['photo'] } as never);
    await flush();
    const files = await fs.readdir(path.join(uploadDir, '2026/10/u'));
    const contents = await Promise.all(files.map((f) => fs.readFile(path.join(uploadDir, '2026/10/u', f))));
    expect(contents.some((bytes) => bytes.includes(Buffer.from(THUMB_SECRET)))).toBe(false);
    expect(files.some((name) => name.includes('passeport'))).toBe(false);
    expect(contents.some((bytes) => bytes.subarray(0, 4).equals(PLAIN.subarray(0, 4)))).toBe(false);

    const records = [...sealings.values()];
    expect(records.map((r) => r.role).sort()).toEqual(['original', 'thumbnail']);
    expect(records.every((r) => r.conversationId === CONV_ID && r.attachmentId === 'photo' && r.keyId === 'k1')).toBe(true);
    const original = records.find((r) => r.role === 'original')!;
    const thumbnail = records.find((r) => r.role === 'thumbnail')!;
    expect((await reopened(uploadDir, original, keyring)).equals(PLAIN)).toBe(true);
    expect((await reopened(uploadDir, thumbnail, keyring)).equals(THUMB)).toBe(true);
    expect(updates.some((data) => data.filePath === original.storageKey && data.fileUrl === original.storageKey && data.thumbnailPath === thumbnail.storageKey)).toBe(true);
  });

});


describe('AUDIT — sans clé de signature des adresses, une pièce scellée ne serait lisible par personne', () => {
  const relPath = '2026/10/u/photo_0f8fad5b-d9cb-469f-a165-70867728950e.jpg';
  const savedMaster = process.env.ENCRYPTION_MASTER_KEY;
  afterEach(() => {
    if (savedMaster === undefined) delete process.env.ENCRYPTION_MASTER_KEY;
    else process.env.ENCRYPTION_MASTER_KEY = savedMaster;
  });

  it('l’envoi est refusé avant d’écrire le message (SERVER_AT_REST_UNAVAILABLE)', async () => {
    process.env.ENCRYPTION_MASTER_KEY = MASTER.toString('base64');
    delete process.env.ATTACHMENT_URL_SIGNING_KEY;
    const { processor } = harness('server', relPath, relPath.replace('.jpg', '_thumb.webp'));
    await expect(
      processor.saveMessage({ conversationId: CONV_ID, senderId: SENDER_ID, content: '', originalLanguage: 'fr', attachmentIds: ['photo'] } as never)
    ).rejects.toMatchObject({ code: 'SERVER_AT_REST_UNAVAILABLE', reason: 'reader-signing-unavailable' });
  });
});
