/**
 * Supprimer une pièce jointe efface aussi ce qui a été DÉRIVÉ de ses octets (#9315).
 *
 * Les pistes TTS (`translated/<id>_<langue>.<ext>`, nommées par l'ObjectId de
 * la pièce jointe, donc énumérables) et les variantes WebP (`<base>_<w>w.webp`)
 * restaient sur le disque, servies par la route de fichiers, après que la ligne
 * et l'original étaient partis. Elles suivent désormais l'original : effacées
 * quand plus aucune ligne ne référence son `filePath` (les copies transférées
 * partagent octets ET carte de traductions), jamais hors de la racine des dépôts.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

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

import { AttachmentService } from '../../../services/attachments';
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
  return { messageAttachment: { findUnique, delete: del, count } } as unknown as PrismaClient;
}

function unlinkedPaths(): string[] {
  return mockFsUnlink.mock.calls.map((call) => String(call[0])).sort();
}

describe('AttachmentService.deleteAttachment — fichiers dérivés', () => {
  let previousUploadPath: string | undefined;

  beforeEach(() => {
    previousUploadPath = process.env.UPLOAD_PATH;
    process.env.UPLOAD_PATH = ROOT;
    mockFsUnlink.mockReset();
    mockFsUnlink.mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (previousUploadPath === undefined) {
      delete process.env.UPLOAD_PATH;
    } else {
      process.env.UPLOAD_PATH = previousUploadPath;
    }
  });

  it('efface les pistes traduites et les variantes avec le dernier exemplaire de l’original', async () => {
    const prisma = makeStore([
      makeRow({
        translations: { en: ttsTrack('en'), es: ttsTrack('es') },
        imageVariants: [
          { width: 640, height: 480, url: '2024/01/user/file_640w.webp', size: 1, format: 'webp' },
          { width: 1280, height: 960, url: '2024/01/user/file_1280w.webp', size: 2, format: 'webp' },
        ],
      }),
    ]);

    await new AttachmentService(prisma).deleteAttachment(ATTACH_ID);

    expect(unlinkedPaths()).toEqual(
      [
        `${ROOT}/2024/01/user/file.jpg`,
        `${ROOT}/2024/01/user/file_1280w.webp`,
        `${ROOT}/2024/01/user/file_640w.webp`,
        `${ROOT}/translated/${ATTACH_ID}_en.mp3`,
        `${ROOT}/translated/${ATTACH_ID}_es.mp3`,
      ].sort()
    );
  });

  it('ne touche à aucun dérivé tant qu’une copie référence encore l’original', async () => {
    const shared = {
      translations: { en: ttsTrack('en') },
      imageVariants: [{ width: 640, height: 480, url: '2024/01/user/file_640w.webp', size: 1, format: 'webp' }],
    };
    const prisma = makeStore([makeRow(shared), makeRow({ ...shared, id: COPY_ID })]);

    await new AttachmentService(prisma).deleteAttachment(ATTACH_ID);

    expect(mockFsUnlink).not.toHaveBeenCalled();
  });

  it('lit la clé d’une adresse absolue percent-encodée, et d’un chemin absolu sans adresse', async () => {
    const prisma = makeStore([
      makeRow({
        translations: {
          en: { type: 'audio', url: `https://gate.meeshy.me/api/v1/attachments/file/translated%2F${ATTACH_ID}_en.mp3` },
          de: { type: 'audio', path: `${ROOT}/translated/${ATTACH_ID}_de.mp3` },
        },
      }),
    ]);

    await new AttachmentService(prisma).deleteAttachment(ATTACH_ID);

    expect(unlinkedPaths()).toEqual(
      [
        `${ROOT}/2024/01/user/file.jpg`,
        `${ROOT}/translated/${ATTACH_ID}_de.mp3`,
        `${ROOT}/translated/${ATTACH_ID}_en.mp3`,
      ].sort()
    );
  });

  it('n’efface jamais un chemin qui sort de la racine des dépôts', async () => {
    const prisma = makeStore([
      makeRow({
        translations: {
          en: { type: 'audio', path: '/etc/passwd' },
          fr: { type: 'audio', url: '/api/v1/attachments/file/..%2F..%2Fetc%2Fshadow' },
          it: { type: 'audio', path: `${ROOT}-sibling/translated/x.mp3` },
        },
        imageVariants: [{ width: 1, height: 1, url: '../outside.webp', size: 1, format: 'webp' }],
      }),
    ]);

    await new AttachmentService(prisma).deleteAttachment(ATTACH_ID);

    expect(unlinkedPaths()).toEqual([`${ROOT}/2024/01/user/file.jpg`]);
  });

  it('un dérivé déjà absent n’empêche pas d’effacer les suivants', async () => {
    mockFsUnlink.mockImplementation(async (target: unknown) => {
      if (String(target).endsWith('_en.mp3')) {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      }
    });
    const prisma = makeStore([
      makeRow({ translations: { en: ttsTrack('en'), es: ttsTrack('es') } }),
    ]);

    await expect(new AttachmentService(prisma).deleteAttachment(ATTACH_ID)).resolves.toBeUndefined();

    expect(unlinkedPaths()).toContain(`${ROOT}/translated/${ATTACH_ID}_es.mp3`);
  });

  it('garde les dérivés quand le comptage des références échoue', async () => {
    const prisma = makeStore([makeRow({ translations: { en: ttsTrack('en') } })]);
    ((prisma as any).messageAttachment.count as jest.Mock<any>).mockRejectedValue(new Error('mongo down'));

    await new AttachmentService(prisma).deleteAttachment(ATTACH_ID);

    expect(mockFsUnlink).not.toHaveBeenCalled();
  });

  it('ignore une carte de traductions ou de variantes malformée', async () => {
    const prisma = makeStore([
      makeRow({ translations: 'pas-une-carte', imageVariants: { url: 'x' } }),
    ]);

    await new AttachmentService(prisma).deleteAttachment(ATTACH_ID);

    expect(unlinkedPaths()).toEqual([`${ROOT}/2024/01/user/file.jpg`]);
  });
});
