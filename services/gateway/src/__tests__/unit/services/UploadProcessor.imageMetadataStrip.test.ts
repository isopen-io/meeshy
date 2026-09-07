/**
 * #3627 — `UploadProcessor.saveFile`/`uploadFile` retirent l'EXIF/GPS d'une
 * photo JPEG/PNG avant qu'elle ne touche le disque, et persistent la taille
 * RÉELLEMENT écrite (pas celle de l'upload d'origine).
 *
 * Fichier DÉDIÉ plutôt qu'ajouté à `UploadProcessor.test.ts` : ce dernier est
 * gelé au cliquet de budget de taille (`gateway-test-file-size-budget.test.ts`,
 * `DETTE_HERITEE`) à 1231 lignes exactement — y ajouter ne serait-ce qu'une
 * ligne le fait rougir. Buffers JPEG RÉELS (sharp, pas de double) : c'est la
 * seule façon de prouver que le contenu ÉCRIT diffère de l'upload d'origine.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { promises as fs } from 'fs';
import sharp from 'sharp';

const mockMetadataManager = {
  extractMetadata: jest.fn(),
  generateThumbnail: jest.fn(),
  generateImageVariants: jest.fn(),
  generateThumbnailFromBuffer: jest.fn(),
  extractImageMetadataFromBuffer: jest.fn(),
} as any;

const mockEncryptionService = {
  encryptAttachment: jest.fn(),
  decryptAttachment: jest.fn(),
} as any;

const mockPrismaClient = {
  messageAttachment: {
    create: jest.fn(),
  },
} as any;

jest.mock('../../../services/attachments/MetadataManager', () => ({
  MetadataManager: jest.fn().mockImplementation(() => mockMetadataManager),
}));

jest.mock('../../../services/AttachmentEncryptionService', () => ({
  getAttachmentEncryptionService: jest.fn(() => mockEncryptionService),
}));

jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    writeFile: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    chmod: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    unlink: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    readFile: jest.fn<() => Promise<Buffer>>().mockResolvedValue(Buffer.from('amplified')),
    stat: jest.fn<() => Promise<{ size: number }>>(),
  },
}));

import { UploadProcessor } from '../../../services/attachments/UploadProcessor';
import type { FileToUpload } from '../../../services/attachments/UploadProcessor';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const jpegWithExif = (copyrightLength = 20) =>
  sharp({ create: { width: 30, height: 20, channels: 3, background: { r: 5, g: 6, b: 7 } } })
    .jpeg()
    .withExif({ IFD0: { Copyright: 'gps-coordinates-marker'.repeat(copyrightLength) } })
    .toBuffer();

describe('UploadProcessor — retrait EXIF/GPS (#3627)', () => {
  let processor: UploadProcessor;
  const testUserId = '507f1f77bcf86cd799439011';
  const testMessageId = '507f1f77bcf86cd799439012';
  const testAttachmentId = '507f1f77bcf86cd799439013';

  const createTestFile = (overrides?: Partial<FileToUpload>): FileToUpload => ({
    buffer: Buffer.from('test file content'),
    filename: 'test_image.jpg',
    mimeType: 'image/jpeg',
    size: 1024 * 100,
    ...overrides,
  });

  const createMockAttachment = (overrides?: any) => ({
    id: testAttachmentId,
    messageId: testMessageId,
    fileName: 'test_image_uuid.jpg',
    originalName: 'test_image.jpg',
    mimeType: 'image/jpeg',
    fileSize: 1024 * 100,
    filePath: '2024/01/test/test_image_uuid.jpg',
    fileUrl: '/api/v1/attachments/file/2024%2F01%2Ftest%2Ftest_image_uuid.jpg',
    thumbnailPath: null,
    thumbnailUrl: undefined,
    width: 1920,
    height: 1080,
    uploadedBy: testUserId,
    isAnonymous: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.UPLOAD_PATH = '/test/uploads';
    process.env.PUBLIC_URL = 'https://test.meeshy.me';
    process.env.NODE_ENV = 'test';

    mockMetadataManager.extractMetadata.mockResolvedValue({ width: 30, height: 20 });
    mockMetadataManager.generateThumbnail.mockResolvedValue(null);
    mockMetadataManager.generateImageVariants.mockResolvedValue([]);
    mockPrismaClient.messageAttachment.create.mockResolvedValue(createMockAttachment());

    // Par défaut : le "fichier sauvegardé" fait la taille du dernier buffer
    // écrit — le comportement RÉEL de `fs.stat` sur le disque une fois
    // `saveFile` passé, sans dupliquer sa logique ici.
    (fs.stat as jest.MockedFunction<typeof fs.stat>).mockImplementation(async () => {
      const calls = (fs.writeFile as jest.MockedFunction<typeof fs.writeFile>).mock.calls;
      const written = calls[calls.length - 1]?.[1] as Buffer;
      return { size: written.length } as any;
    });

    processor = new UploadProcessor(mockPrismaClient as unknown as PrismaClient);
  });

  it('écrit un buffer JPEG sans EXIF quand la source en porte', async () => {
    const withExif = await jpegWithExif();
    const before = await sharp(withExif).metadata();
    expect(before.exif).toBeDefined();

    await (processor as any).saveFile(withExif, '2024/01/user/photo.jpg', 'image/jpeg');

    const written = (fs.writeFile as jest.MockedFunction<typeof fs.writeFile>).mock.calls[0][1] as Buffer;
    expect(written).not.toEqual(withExif);
    const after = await sharp(written).metadata();
    expect(after.exif).toBeUndefined();
  });

  it("ne touche pas un buffer WEBP — sharp() n'est jamais appelé sur ce type", async () => {
    const buffer = Buffer.from('not-a-real-webp-but-irrelevant-here');

    await (processor as any).saveFile(buffer, '2024/01/user/photo.webp', 'image/webp');

    const written = (fs.writeFile as jest.MockedFunction<typeof fs.writeFile>).mock.calls[0][1] as Buffer;
    expect(written).toBe(buffer);
  });

  it('persiste la taille RE-MESURÉE, pas celle de l’upload d’origine, pour une image dont l’EXIF a été retiré', async () => {
    const withExif = await jpegWithExif();
    const file = createTestFile({ buffer: withExif, mimeType: 'image/jpeg', size: withExif.length });

    await processor.uploadFile(file, testUserId, false, testMessageId);

    const createCall = mockPrismaClient.messageAttachment.create.mock.calls[0][0] as any;
    expect(createCall.data.fileSize).toBeLessThan(withExif.length);
  });

  it('persiste la taille RÉELLE (inchangée) pour un type non concerné par le retrait', async () => {
    const buffer = Buffer.from('fake-webp-bytes');
    const file = createTestFile({ buffer, mimeType: 'image/webp', filename: 'test.webp', size: buffer.length });

    await processor.uploadFile(file, testUserId, false, testMessageId);

    const createCall = mockPrismaClient.messageAttachment.create.mock.calls[0][0] as any;
    expect(createCall.data.fileSize).toBe(buffer.length);
  });
});
