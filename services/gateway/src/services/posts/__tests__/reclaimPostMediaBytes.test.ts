import { describe, it, expect, jest } from '@jest/globals';
import { reclaimMediaRowBytes } from '../reclaimPostMediaBytes';

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
});
