/**
 * @jest-environment node
 *
 * Cycle 35 — ce que la projection écrite à la main avait cessé d'emporter.
 *
 * `repostPost` duplique les OCTETS d'une source éphémère (STORY 21h, STATUS 1h)
 * pour que le repost survive au hard-delete de l'original. La duplication du
 * blob est correcte ; la ligne `PostMedia` qui le décrit, elle, était
 * réénumérée à la main sur 8 champs — alors que `mediaSelect` en avait chargé
 * dix-sept. Tout ce qui décrit ces pixels (dimensions, empreinte instantanée,
 * durée, texte alternatif, transcription) restait derrière.
 *
 * Les tests ci-dessous regardent la LIGNE ÉCRITE, jamais le nombre d'appels :
 * c'est précisément ce que la suite existante ne faisait pas (leçon 268).
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PostService } from '../../PostService';
import { MediaService } from '../../MediaService';
import type { PostReactionService } from '../../PostReactionService';
import { PostType } from '@meeshy/shared/prisma/client';

jest.mock('../PostAudioService', () => ({
  PostAudioService: {
    shared: { processPostAudio: jest.fn().mockReturnValue(Promise.resolve()) },
    init: jest.fn(),
  },
}));

function createMockPrisma() {
  const prisma: any = {
    post: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    postMedia: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  prisma.$transaction = jest.fn(async (arg: any) =>
    typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
  );
  return prisma;
}

/** Un média source tel que `mediaSelect` le rend : tous les faits chargés. */
function makeSourceMedia(overrides: Record<string, unknown> = {}) {
  return {
    id: 'media-src-1',
    fileName: 'clip.mp4',
    originalName: 'vacances.mp4',
    mimeType: 'video/mp4',
    fileSize: 4096,
    fileUrl: '/api/v1/attachments/file/clip.mp4',
    width: 1080,
    height: 1920,
    thumbnailUrl: '/api/v1/attachments/file/clip-thumb.jpg',
    thumbHash: 'YTQGLYYW6Kh/eIeHiIh4eIiAaAg3',
    duration: 12_500,
    order: 0,
    caption: 'Coucher de soleil à Dakar',
    alt: 'Le soleil disparaît derrière la mer, silhouettes de pirogues',
    language: 'fr',
    variantOf: null,
    transcription: { text: 'On rentre demain', language: 'fr', durationMs: 12_500 },
    translations: null,
    ...overrides,
  };
}

function makeStory(overrides: Record<string, unknown> = {}) {
  return {
    id: 'story-1',
    authorId: 'user-author',
    type: PostType.STORY,
    visibility: 'PUBLIC',
    content: null,
    deletedAt: null,
    expiresAt: null,
    media: [makeSourceMedia()],
    ...overrides,
  };
}

const DUP = {
  fileUrl: '/api/v1/attachments/file/snapshots/new-clip.mp4',
  filePath: 'snapshots/new-clip.mp4',
  fileName: 'snapshot_new-clip.mp4',
  fileSize: 4096,
  mimeType: 'video/mp4',
};

const DUP_THUMB = {
  fileUrl: '/api/v1/attachments/file/snapshots/new-thumb.jpg',
  filePath: 'snapshots/new-thumb.jpg',
  fileName: 'snapshot_new-thumb.jpg',
  fileSize: 512,
  mimeType: 'image/jpeg',
};

describe('repostPost — la ligne média copiée dit-elle la vérité sur ses octets ?', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let mediaService: MediaService;
  let service: PostService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createMockPrisma();
    mediaService = new MediaService();
    service = new PostService(
      prisma,
      mediaService,
      undefined,
      { addReaction: jest.fn(), removeReaction: jest.fn() } as unknown as PostReactionService,
    );
    prisma.post.create.mockResolvedValue({ id: 'repost-1', media: [{ id: 'media-copy-1' }] });
    prisma.post.update.mockResolvedValue({ id: 'story-1' });
  });

  /** Récupère la seule ligne `PostMedia` que le repost a demandé d'écrire. */
  async function snapshotRow(original: Record<string, unknown>) {
    prisma.post.findFirst.mockResolvedValue(original);
    jest.spyOn(mediaService, 'duplicateMedia')
      .mockResolvedValueOnce(DUP)
      .mockResolvedValueOnce(DUP_THUMB);

    await service.repostPost(original.id as string, 'user-reposter', { targetType: PostType.STORY });

    const call = prisma.post.create.mock.calls[0]?.[0] as any;
    return call?.data?.media?.create?.[0] as Record<string, unknown> | undefined;
  }

  it('emporte les dimensions — sans elles le lecteur ne peut réserver le cadre', async () => {
    const row = await snapshotRow(makeStory());

    expect(row).toMatchObject({ width: 1080, height: 1920 });
  });

  it('emporte le thumbHash — le placeholder instantané est dérivé de CES pixels', async () => {
    const row = await snapshotRow(makeStory());

    expect(row?.thumbHash).toBe('YTQGLYYW6Kh/eIeHiIh4eIiAaAg3');
  });

  it('emporte la durée — un lecteur sans durée ne sait pas dessiner sa barre', async () => {
    const row = await snapshotRow(makeStory());

    expect(row?.duration).toBe(12_500);
  });

  it('emporte le texte alternatif et la légende — l\'accessibilité suit les pixels', async () => {
    const row = await snapshotRow(makeStory());

    expect(row).toMatchObject({
      alt: 'Le soleil disparaît derrière la mer, silhouettes de pirogues',
      caption: 'Coucher de soleil à Dakar',
    });
  });

  it('emporte langue et transcription — le Prisme Linguistique survit au repost', async () => {
    const row = await snapshotRow(makeStory());

    expect(row?.language).toBe('fr');
    expect(row?.transcription).toEqual({ text: 'On rentre demain', language: 'fr', durationMs: 12_500 });
  });

  it('attribue la copie au reposteur — toute création nouvelle pose son uploadeur', async () => {
    const row = await snapshotRow(makeStory());

    expect(row?.uploaderId).toBe('user-reposter');
  });

  it('emporte audioDuration à côté de l\'audioUrl dupliqué', async () => {
    prisma.post.findFirst.mockResolvedValue(
      makeStory({
        type: PostType.STATUS,
        media: [],
        audioUrl: '/api/v1/attachments/file/mood.mp3',
        audioDuration: 4_200,
      }),
    );
    jest.spyOn(mediaService, 'duplicateMedia').mockResolvedValueOnce({
      fileUrl: '/api/v1/attachments/file/snapshots/new-mood.mp3',
      filePath: 'snapshots/new-mood.mp3',
      fileName: 'snapshot_new-mood.mp3',
      fileSize: 2048,
      mimeType: 'audio/mpeg',
    });

    await service.repostPost('story-1', 'user-reposter', { targetType: PostType.STATUS });

    expect(prisma.post.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          audioUrl: '/api/v1/attachments/file/snapshots/new-mood.mp3',
          audioDuration: 4_200,
        }),
      }),
    );
  });

  // ── Discriminants anti-sur-correction ────────────────────────────────────
  //
  // Copier un FAIT sur les octets, ce n'est pas copier tout le champ voisin :
  // un pointeur vers une AUTRE ligne, et une carte d'URL vers des blobs qu'on
  // n'a pas dupliqués, ne doivent surtout pas voyager avec la référence.

  it('ne recopie jamais variantOf — un pointeur vers une ligne étrangère n\'est pas un fait sur ces octets', async () => {
    const row = await snapshotRow(
      makeStory({ media: [makeSourceMedia({ variantOf: 'media-src-0' })] }),
    );

    expect(row).not.toHaveProperty('variantOf', 'media-src-0');
  });

  it('ne recopie jamais translations — ses URL TTS désignent des blobs non dupliqués', async () => {
    const row = await snapshotRow(
      makeStory({
        media: [makeSourceMedia({
          translations: { en: { type: 'audio', transcription: 'We come back tomorrow', url: '/api/v1/attachments/file/tts-en.mp3' } },
        })],
      }),
    );

    expect(row?.translations).toBeUndefined();
  });

  it('copie l\'ABSENCE aussi fidèlement que la présence — rien ne s\'invente', async () => {
    const row = await snapshotRow(
      makeStory({
        media: [makeSourceMedia({
          width: null, height: null, thumbHash: null, duration: null,
          alt: null, caption: null, language: null, transcription: null,
        })],
      }),
    );

    expect(row?.width).toBeUndefined();
    expect(row?.height).toBeUndefined();
    expect(row?.thumbHash).toBeUndefined();
    expect(row?.duration).toBeUndefined();
    expect(row?.alt).toBeUndefined();
    expect(row?.caption).toBeUndefined();
    expect(row?.language).toBeUndefined();
    expect(row?.transcription).toBeUndefined();
  });

  // ── Non-régressions : ce que la copie faisait déjà bien ──────────────────

  it('garde les octets DUPLIQUÉS, jamais ceux de la source', async () => {
    const row = await snapshotRow(makeStory());

    expect(row).toMatchObject({
      fileUrl: DUP.fileUrl,
      filePath: DUP.filePath,
      fileName: DUP.fileName,
      fileSize: DUP.fileSize,
      mimeType: DUP.mimeType,
      thumbnailUrl: DUP_THUMB.fileUrl,
      order: 0,
    });
  });
});
