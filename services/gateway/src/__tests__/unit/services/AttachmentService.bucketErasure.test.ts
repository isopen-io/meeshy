/**
 * #11267, audit D2 — UN EFFACEMENT DISQUE ATTEINT LE SEAU, dans le même geste.
 * Le balayage horaire n'était le seul effaceur que par défaut : une vue unique
 * brûlée gardait sa copie environ 25 h. `deleteAttachment` (et ses dérivés) et
 * `MediaService.deleteMedia` effacent désormais aussi la copie, sous la même
 * règle que le disque (un octet encore référencé reste), et une panne du seau
 * ne fait jamais échouer l'effacement : le balayage reste le filet.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockFsUnlink = jest.fn() as jest.Mock<any>;

jest.mock('../../../services/attachments/UploadProcessor', () => ({
  UploadProcessor: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../services/attachments/MetadataManager', () => ({
  MetadataManager: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../services/AttachmentEncryptionService', () => ({
  getAttachmentEncryptionService: jest.fn(() => ({})),
}));

jest.mock('fs', () => ({
  promises: {
    unlink: (...args: unknown[]) => mockFsUnlink(...args),
  },
  constants: {},
}));

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: {
    child: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
  },
}));

const removed: string[] = [];
let failingKeys: ReadonlySet<string> = new Set();
let bucketConfigured = true;

jest.mock('../../../services/storage/objects/mediaObjectStoreFactory', () => ({
  processMediaObjectStores: () => ({
    mirror: bucketConfigured
      ? {
          remove: async (key: string) => {
            if (failingKeys.has(key)) throw new Error('seau indisponible');
            removed.push(key);
          },
        }
      : null,
  }),
}));

import { AttachmentService } from '../../../services/attachments';
import { MediaService } from '../../../services/MediaService';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const ROOT = '/srv/uploads';
const ATTACH_ID = '507f1f77bcf86cd799439001';
const COPY_ID = '507f1f77bcf86cd799439009';

function ttsTrack(lang: string) {
  const filename = `${ATTACH_ID}_${lang}.mp3`;
  return {
    type: 'audio',
    transcription: 'bonjour',
    path: `${ROOT}/translated/${filename}`,
    url: `/api/v1/attachments/file/translated/${filename}`,
  };
}

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ATTACH_ID,
    messageId: '507f1f77bcf86cd799439002',
    filePath: '2024/01/user/file.jpg',
    thumbnailPath: null,
    translations: null,
    imageVariants: null,
    ...overrides,
  };
}

function makeStore(rows: Array<Record<string, any>>) {
  const store = [...rows];
  const findUnique = jest.fn() as jest.Mock<any>;
  findUnique.mockImplementation(async ({ where }: any) => store.find((row) => row.id === where.id) ?? null);
  const del = jest.fn() as jest.Mock<any>;
  del.mockImplementation(async ({ where }: any) => {
    const index = store.findIndex((row) => row.id === where.id);
    return store.splice(index, 1)[0];
  });
  const count = jest.fn() as jest.Mock<any>;
  count.mockImplementation(async ({ where }: any) =>
    store.filter((row) =>
      where.filePath !== undefined ? row.filePath === where.filePath : row.thumbnailPath === where.thumbnailPath
    ).length
  );
  const findMany = jest.fn() as jest.Mock<any>;
  findMany.mockImplementation(async ({ where }: any) => store.filter((row) => row.filePath === where.filePath));
  return { messageAttachment: { findUnique, delete: del, count, findMany } } as unknown as PrismaClient;
}

beforeEach(() => {
  removed.length = 0;
  failingKeys = new Set();
  bucketConfigured = true;
  process.env.UPLOAD_PATH = ROOT;
  mockFsUnlink.mockReset();
  mockFsUnlink.mockResolvedValue(undefined);
});

describe('deleteAttachment efface aussi la copie du seau', () => {
  it('l’original, la vignette et les pistes TTS quittent le seau avec le disque', async () => {
    const prisma = makeStore([makeRow({ thumbnailPath: '2024/01/user/file_thumb.webp', translations: { en: ttsTrack('en') } })]);

    await new AttachmentService(prisma).deleteAttachment(ATTACH_ID);

    expect([...removed].sort()).toEqual(['2024/01/user/file.jpg', '2024/01/user/file_thumb.webp', `translated/${ATTACH_ID}_en.mp3`].sort());
  });

  it('un fichier encore référencé par une autre ligne garde sa copie ; ce qui n’est qu’à elle part', async () => {
    const prisma = makeStore([makeRow({ thumbnailPath: '2024/01/user/own_thumb.webp' }), makeRow({ id: COPY_ID })]);

    await new AttachmentService(prisma).deleteAttachment(ATTACH_ID);

    expect(removed).toEqual(['2024/01/user/own_thumb.webp']);
  });

  it('une copie que le seau refuse n’empêche ni l’effacement du disque ni celui des autres copies', async () => {
    failingKeys = new Set(['2024/01/user/file.jpg']);
    const prisma = makeStore([makeRow({ thumbnailPath: '2024/01/user/file_thumb.webp' })]);

    await expect(new AttachmentService(prisma).deleteAttachment(ATTACH_ID)).resolves.toBeUndefined();
    expect(mockFsUnlink).toHaveBeenCalledWith(`${ROOT}/2024/01/user/file.jpg`);
    expect(removed).toEqual(['2024/01/user/file_thumb.webp']);
  });

  it('sans seau configuré, seul le disque est touché', async () => {
    bucketConfigured = false;
    const prisma = makeStore([makeRow()]);

    await new AttachmentService(prisma).deleteAttachment(ATTACH_ID);

    expect(removed).toEqual([]);
    expect(mockFsUnlink).toHaveBeenCalledWith(`${ROOT}/2024/01/user/file.jpg`);
  });
});

describe('MediaService.deleteMedia efface aussi la copie du seau', () => {
  it('la clé du média quitte le seau, même quand le disque ne l’a plus', async () => {
    mockFsUnlink.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

    await new MediaService(ROOT).deleteMedia('/api/v1/attachments/file/2026%2F10%2Fu1%2Fpost.jpg');

    expect(removed).toEqual(['2026/10/u1/post.jpg']);
  });
});
