import { describe, it, expect, jest } from '@jest/globals';
import { POST_MEDIA_FILE_COLUMNS, reclaimMediaRowBytes } from '../reclaimPostMediaBytes';

type SoundRow = { fileUrl: string; coverUrl: string | null };

function buildPrisma(sounds: SoundRow[] = []) {
  return {
    sound: {
      findMany: jest.fn<(args: unknown) => Promise<SoundRow[]>>().mockResolvedValue(sounds),
    },
  };
}

function buildStorage() {
  return { delete: jest.fn<(fileUrl: string) => Promise<void>>().mockResolvedValue(undefined) };
}

const deleted = (storage: ReturnType<typeof buildStorage>) =>
  storage.delete.mock.calls.map(([url]) => url).sort();

describe('reclaimMediaRowBytes', () => {
  it('test_reclaim_deletesBothTheFileAndItsThumbnail', async () => {
    const prisma = buildPrisma();
    const storage = buildStorage();

    const count = await reclaimMediaRowBytes(prisma, storage, [
      { fileUrl: '/f/a.jpg', thumbnailUrl: '/f/a_thumb.jpg' },
    ]);

    expect(deleted(storage)).toEqual(['/f/a.jpg', '/f/a_thumb.jpg']);
    expect(count).toBe(2);
  });

  // La capture de son COPIE l'audio dans son propre dossier, mais dénormalise
  // la vignette du contenu source : `Sound.coverUrl` pointe le fichier du
  // PostMedia. Le son SURVIT au post ; effacer l'octet le laisserait sans
  // visuel pour toujours.
  it('test_reclaim_keepsAFileStillReferencedByASurvivingSoundCover', async () => {
    const prisma = buildPrisma([{ fileUrl: '/sounds/x.m4a', coverUrl: '/f/a_thumb.jpg' }]);
    const storage = buildStorage();

    const count = await reclaimMediaRowBytes(prisma, storage, [
      { fileUrl: '/f/a.jpg', thumbnailUrl: '/f/a_thumb.jpg' },
    ]);

    expect(deleted(storage)).toEqual(['/f/a.jpg']);
    expect(count).toBe(1);
  });

  it('test_reclaim_keepsAFileStillReferencedBySoundFileUrl', async () => {
    const prisma = buildPrisma([{ fileUrl: '/f/a.m4a', coverUrl: null }]);
    const storage = buildStorage();

    const count = await reclaimMediaRowBytes(prisma, storage, [
      { fileUrl: '/f/a.m4a', thumbnailUrl: null },
    ]);

    expect(storage.delete).not.toHaveBeenCalled();
    expect(count).toBe(0);
  });

  it('test_reclaim_deletesEachDistinctUrlOnce', async () => {
    const prisma = buildPrisma();
    const storage = buildStorage();

    const count = await reclaimMediaRowBytes(prisma, storage, [
      { fileUrl: '/f/a.jpg', thumbnailUrl: '/f/shared_thumb.jpg' },
      { fileUrl: '/f/b.jpg', thumbnailUrl: '/f/shared_thumb.jpg' },
    ]);

    expect(deleted(storage)).toEqual(['/f/a.jpg', '/f/b.jpg', '/f/shared_thumb.jpg']);
    expect(count).toBe(3);
  });

  it('test_reclaim_emptyList_queriesNothing', async () => {
    const prisma = buildPrisma();
    const storage = buildStorage();

    const count = await reclaimMediaRowBytes(prisma, storage, []);

    expect(prisma.sound.findMany).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
    expect(count).toBe(0);
  });

  it('test_reclaim_ignoresEmptyUrls', async () => {
    const prisma = buildPrisma();
    const storage = buildStorage();

    const count = await reclaimMediaRowBytes(prisma, storage, [
      { fileUrl: '', thumbnailUrl: null },
    ]);

    expect(prisma.sound.findMany).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
    expect(count).toBe(0);
  });

  // Un fichier récalcitrant ne doit pas bloquer la fournée : la ligne va être
  // détruite de toute façon, et un rejet ici ferait rejouer la MÊME fournée à
  // chaque passe, indéfiniment.
  it('test_reclaim_oneFileFails_theOthersAreStillReclaimed', async () => {
    const prisma = buildPrisma();
    const storage = buildStorage();
    storage.delete.mockImplementation(async (url: string) => {
      if (url === '/f/broken.jpg') throw new Error('EACCES');
    });

    const count = await reclaimMediaRowBytes(prisma, storage, [
      { fileUrl: '/f/broken.jpg', thumbnailUrl: null },
      { fileUrl: '/f/ok.jpg', thumbnailUrl: null },
    ]);

    expect(deleted(storage)).toEqual(['/f/broken.jpg', '/f/ok.jpg']);
    expect(count).toBe(1);
  });

  // À l'inverse : la requête de garde en échec REJETTE. Ne pas savoir si un son
  // vivant s'appuie sur ces octets n'autorise pas à les effacer.
  it('test_reclaim_soundQueryFails_rejectsWithoutDeletingAnyByte', async () => {
    const prisma = buildPrisma();
    prisma.sound.findMany.mockRejectedValue(new Error('mongo down'));
    const storage = buildStorage();

    await expect(
      reclaimMediaRowBytes(prisma, storage, [{ fileUrl: '/f/a.jpg', thumbnailUrl: null }]),
    ).rejects.toThrow('mongo down');
    expect(storage.delete).not.toHaveBeenCalled();
  });

  // #11260 — le chemin résumable écrit désormais les variantes WebP d'une photo
  // de post à côté de l'original, et ne les désigne que dans `imageVariants` :
  // sans ce nettoyage, chaque photo détruite laisserait des fichiers publics.
  it('test_reclaim_deletesTheResponsiveVariantsWrittenNextToTheOriginal', async () => {
    const prisma = buildPrisma();
    const storage = buildStorage();

    const count = await reclaimMediaRowBytes(prisma, storage, [
      {
        fileUrl: '2026/10/u/a.jpg',
        thumbnailUrl: '2026/10/u/a_thumb.webp',
        imageVariants: [
          { width: 640, height: 427, url: '2026/10/u/a_640w.webp', size: 9000, format: 'webp' },
          { width: 1280, height: 853, url: '2026/10/u/a_1280w.webp', size: 30000, format: 'webp' },
        ],
      },
    ]);

    expect(deleted(storage)).toEqual([
      '2026/10/u/a.jpg',
      '2026/10/u/a_1280w.webp',
      '2026/10/u/a_640w.webp',
      '2026/10/u/a_thumb.webp',
    ]);
    expect(count).toBe(4);
  });

  it('test_reclaim_deletesTheAvifVariantsToo (#11262)', async () => {
    const prisma = buildPrisma();
    const storage = buildStorage();

    await reclaimMediaRowBytes(prisma, storage, [
      {
        fileUrl: '2026/10/u/a.jpg',
        thumbnailUrl: null,
        imageVariants: [{ width: 640, height: 427, url: '2026/10/u/a_640w.webp', size: 9000, format: 'webp' }],
        avifVariants: [{ width: 640, height: 427, url: '2026/10/u/a_640w.avif', size: 6000, format: 'avif' }],
      },
    ]);

    expect(deleted(storage)).toEqual(['2026/10/u/a.jpg', '2026/10/u/a_640w.avif', '2026/10/u/a_640w.webp']);
  });

  it('test_reclaim_legacyRowsWithoutVariants_behaveAsBefore', async () => {
    const prisma = buildPrisma();
    const storage = buildStorage();

    const count = await reclaimMediaRowBytes(prisma, storage, [
      { fileUrl: '2026/10/u/old.jpg', thumbnailUrl: null },
      { fileUrl: '2026/10/u/old2.jpg', thumbnailUrl: null, imageVariants: null },
    ]);

    expect(deleted(storage)).toEqual(['2026/10/u/old.jpg', '2026/10/u/old2.jpg']);
    expect(count).toBe(2);
  });

  it('test_reclaim_ignoresMalformedVariantJson_neverGuessesAPath', async () => {
    const prisma = buildPrisma();
    const storage = buildStorage();

    await reclaimMediaRowBytes(prisma, storage, [
      { fileUrl: '2026/10/u/a.jpg', imageVariants: 'not-an-array' },
      { fileUrl: '2026/10/u/b.jpg', imageVariants: [{ width: 640 }, null, { url: 42 }, { url: '../../etc/passwd' }] },
    ]);

    expect(deleted(storage)).toEqual(['2026/10/u/a.jpg', '2026/10/u/b.jpg']);
  });
  // #19750 — les pistes TTS d'un média de post ne sont désignées que par
  // `translations.<langue>.url` : sans les lire, chaque story expirée laissait
  // ses vocaux traduits sur le disque, servis sans authentification.
  describe('les pistes traduites (#19750)', () => {
    const TRACK_FR = '/api/v1/attachments/file/translated/media-1_fr.mp3';
    const TRACK_EN = '/api/v1/attachments/file/translated/media-1_en.mp3';

    it('test_reclaim_deletesTheTranslatedAudioTracksOfTheRow', async () => {
      const prisma = buildPrisma();
      const storage = buildStorage();

      const count = await reclaimMediaRowBytes(prisma, storage, [
        {
          fileUrl: '2026/11/u/voice.m4a',
          translations: {
            fr: { type: 'audio', transcription: 'Bonjour', path: '/app/uploads/translated/media-1_fr.mp3', url: TRACK_FR },
            en: { type: 'audio', transcription: 'Hello', url: TRACK_EN },
          },
        },
      ]);

      expect(deleted(storage)).toEqual(['/api/v1/attachments/file/translated/media-1_en.mp3', '/api/v1/attachments/file/translated/media-1_fr.mp3', '2026/11/u/voice.m4a']);
      expect(count).toBe(3);
    });

    it('test_reclaim_keepsATranslatedTrackStillReferencedByASound', async () => {
      const prisma = buildPrisma([{ fileUrl: TRACK_FR, coverUrl: null }]);
      const storage = buildStorage();

      await reclaimMediaRowBytes(prisma, storage, [
        { fileUrl: '2026/11/u/voice.m4a', translations: { fr: { type: 'audio', url: TRACK_FR } } },
      ]);

      expect(deleted(storage)).toEqual(['2026/11/u/voice.m4a']);
    });

    it('test_reclaim_ignoresMalformedTranslationJson_neverGuessesAPath', async () => {
      const prisma = buildPrisma();
      const storage = buildStorage();

      await reclaimMediaRowBytes(prisma, storage, [
        { fileUrl: '2026/11/u/a.m4a', translations: 'not-a-map' },
        { fileUrl: '2026/11/u/b.m4a', translations: [{ url: TRACK_FR }] },
        {
          fileUrl: '2026/11/u/c.m4a',
          translations: {
            fr: null,
            en: { url: 42 },
            es: { type: 'text', transcription: 'Hola' },
            de: { path: '/app/uploads/translated/x_de.mp3' },
            it: { url: '/outputs/audio/translated/x_it.mp3' },
            pt: { url: '/api/v1/attachments/file/..%2F..%2Fetc%2Fpasswd' },
          },
        },
      ]);

      expect(deleted(storage)).toEqual(['2026/11/u/a.m4a', '2026/11/u/b.m4a', '2026/11/u/c.m4a']);
    });

    it('test_fileColumns_selectTheTranslationsEveryReaderSpreads', () => {
      expect(POST_MEDIA_FILE_COLUMNS).toMatchObject({ translations: true });
    });
  });
});
