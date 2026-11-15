/**
 * CE QUE `UploadProcessor` GRAVE EST LA CLÉ DE STOCKAGE, JAMAIS UNE ROUTE (#7022, étape 2).
 *
 * #4324 a tranché ce qui se persiste : « la clé de stockage, jamais une
 * adresse : ni hôte, ni préfixe d'API, ni version. Ce sont des décisions de
 * déploiement, et une donnée qui les porte devient fausse dès que l'une d'elles
 * change. » `tus-handler` l'applique depuis toujours (`const fileUrl = relPath`)
 * ; `UploadProcessor` écrivait, lui, `/api/v1/attachments/file/<clé
 * percent-encodée>` — 539 `MessageAttachment` et 35 `PostMedia` mesurés en
 * production le 2026-09-18, et la dernière ligne datait du 2026-09-16 : le
 * producteur était VIVANT.
 *
 * CE TÉMOIN N'INTERROGE PAS `getAttachmentPath`. Il interroge ce qui part dans
 * `prisma.messageAttachment.create` — la seule chose qui survive à la requête.
 * Un témoin qui compare la sortie d'une fonction à un appel de cette MÊME
 * fonction (le motif que portait `UploadProcessor.test.ts` pour les variantes
 * d'image) reste vert quelle que soit la forme rendue : il ne mesure rien.
 *
 * ET IL COMPARE LA COLONNE D'ADRESSE À LA COLONNE DE DISQUE. `filePath` est la
 * clé ; `fileUrl` doit lui être IDENTIQUE. Confondre les deux colonnes a
 * fabriqué 574 absences qui n'existaient pas au cadrage de ce lot ; les faire
 * COÏNCIDER est précisément ce que #4324 demande.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import { promises as fs } from 'fs';

const mockMetadataManager = {
  extractMetadata: jest.fn(),
  generateThumbnail: jest.fn(),
  generateImageVariants: jest.fn(),
  generateThumbnailFromBuffer: jest.fn(),
  generateVideoThumbnailFromBuffer: jest.fn(),
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
  },
}));

import { UploadProcessor, type FileToUpload } from '../../../services/attachments/UploadProcessor';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { SIGNATURE_BYTES_BY_MIME_TYPE } from '../../../services/attachments/__tests__/signature-fixtures';

const USER_ID = '507f1f77bcf86cd799439011';
const MESSAGE_ID = '507f1f77bcf86cd799439012';

/**
 * LES TROIS MARQUES D'UNE ADRESSE. Une clé de stockage n'en porte aucune : ni
 * schéma (`https://`), ni préfixe d'API (`/api/`), ni percent-encodage de ses
 * séparateurs (`%2F`) — ce dernier étant ce qui a fait lire 574 routes comme
 * des chemins de disque absents.
 */
const expectBareStorageKey = (value: string): void => {
  expect(value).not.toContain('://');
  expect(value).not.toContain('/api/');
  expect(value).not.toContain('attachments/file/');
  expect(value).not.toContain('%2F');
  expect(value.startsWith('/')).toBe(false);
};

const imageFile = (overrides?: Partial<FileToUpload>): FileToUpload => ({
  buffer: SIGNATURE_BYTES_BY_MIME_TYPE['image/jpeg'] ?? Buffer.from('test'),
  filename: 'photo.jpg',
  mimeType: 'image/jpeg',
  size: 1024 * 100,
  ...overrides,
});

const createdData = (): Record<string, any> => {
  const call = mockPrismaClient.messageAttachment.create.mock.calls[0] as [{ data: Record<string, any> }];
  return call[0].data;
};

describe('UploadProcessor grave la clé de stockage', () => {
  let processor: UploadProcessor;

  beforeEach(() => {
    jest.clearAllMocks();

    process.env['UPLOAD_PATH'] = '/test/uploads';
    process.env['PUBLIC_URL'] = 'https://test.meeshy.me';
    process.env['NODE_ENV'] = 'test';

    mockMetadataManager.extractMetadata.mockResolvedValue({ width: 1920, height: 1080, thumbnailGenerated: false });
    mockMetadataManager.generateThumbnail.mockResolvedValue('2026/09/user/photo_uuid_thumb.webp');
    mockMetadataManager.generateImageVariants.mockResolvedValue([]);
    mockMetadataManager.generateThumbnailFromBuffer.mockResolvedValue(Buffer.from('thumbnail'));
    mockMetadataManager.extractImageMetadataFromBuffer.mockResolvedValue({ width: 1920, height: 1080 });

    mockEncryptionService.encryptAttachment.mockResolvedValue({
      encryptedBuffer: Buffer.from('encrypted'),
      encryptedThumbnail: { buffer: Buffer.from('encrypted-thumb'), iv: 'thumb-iv', authTag: 'thumb-tag' },
      metadata: {
        iv: 'iv',
        authTag: 'tag',
        hmac: 'hmac',
        originalSize: 1024 * 100,
        originalHash: 'hash',
        encryptedSize: 1024 * 110,
        encryptedHash: 'encrypted-hash',
        mode: 'e2ee',
      },
    });

    mockPrismaClient.messageAttachment.create.mockResolvedValue({
      id: '507f1f77bcf86cd799439013',
      messageId: MESSAGE_ID,
      fileName: 'photo_uuid.jpg',
      originalName: 'photo.jpg',
      mimeType: 'image/jpeg',
      fileSize: 1024 * 100,
      uploadedBy: USER_ID,
      isAnonymous: false,
      createdAt: new Date(),
    });

    (fs.mkdir as jest.MockedFunction<typeof fs.mkdir>).mockResolvedValue(undefined as any);
    (fs.writeFile as jest.MockedFunction<typeof fs.writeFile>).mockResolvedValue(undefined);
    (fs.chmod as jest.MockedFunction<typeof fs.chmod>).mockResolvedValue(undefined);

    processor = new UploadProcessor(mockPrismaClient as unknown as PrismaClient);
  });

  afterEach(() => {
    delete process.env['UPLOAD_PATH'];
    delete process.env['PUBLIC_URL'];
    delete process.env['NODE_ENV'];
  });

  it("l'adresse gravée d'un upload simple EST la clé de disque, pas une route", async () => {
    await processor.uploadFile(imageFile(), USER_ID, false, MESSAGE_ID);

    const data = createdData();
    expect(data['fileUrl']).toBe(data['filePath']);
    expectBareStorageKey(data['fileUrl'] as string);
  });

  it("la vignette gravée EST sa propre clé de disque", async () => {
    await processor.uploadFile(imageFile(), USER_ID, false, MESSAGE_ID);

    const data = createdData();
    expect(data['thumbnailUrl']).toBe(data['thumbnailPath']);
    expectBareStorageKey(data['thumbnailUrl'] as string);
  });

  it("chaque variante responsive grave la clé de la variante, littéralement", async () => {
    mockMetadataManager.generateImageVariants.mockResolvedValueOnce([
      { path: '2026/09/user/photo_uuid_640w.webp', width: 640, height: 360, size: 4096 },
      { path: '2026/09/user/photo_uuid_1080w.webp', width: 1080, height: 608, size: 9216 },
    ]);

    await processor.uploadFile(imageFile(), USER_ID, false, MESSAGE_ID);

    const variants = createdData()['imageVariants'] as ReadonlyArray<{ url: string }>;
    expect(variants.map((variant) => variant.url)).toEqual([
      '2026/09/user/photo_uuid_640w.webp',
      '2026/09/user/photo_uuid_1080w.webp',
    ]);
  });

  it("un upload CHIFFRÉ grave lui aussi la clé — fichier et vignette", async () => {
    await processor.uploadEncryptedFile(imageFile(), USER_ID, 'e2ee' as any, false, MESSAGE_ID);

    const data = createdData();
    expect(data['fileUrl']).toBe(data['filePath']);
    expect(data['thumbnailUrl']).toBe(data['thumbnailPath']);
    expectBareStorageKey(data['fileUrl'] as string);
    expectBareStorageKey(data['thumbnailUrl'] as string);
  });

  it("aucun réglage d'hôte ne se retrouve dans ce qui se persiste", async () => {
    process.env['PUBLIC_URL'] = 'https://gate.meeshy.me';
    const autre = new UploadProcessor(mockPrismaClient as unknown as PrismaClient);

    await autre.uploadFile(imageFile(), USER_ID, false, MESSAGE_ID);

    const data = createdData();
    expect(data['fileUrl']).not.toContain('gate.meeshy.me');
    expect(data['fileUrl']).toBe(data['filePath']);
  });
});
