import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs/promises';
import fsSync from 'fs';
import os from 'os';
import path from 'path';
import { createHash } from 'crypto';
import { SoundCaptureService } from '../SoundCaptureService';

function buildPrisma(overrides: Record<string, unknown> = {}) {
  return {
    postMedia: { findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]) },
    // ⚠ v1 : `user` manquait — `captureOne` l'appelle, l'absence faisait
    // échouer silencieusement toute capture via le try/catch par piste.
    user: { findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue({ username: 'tester' }) },
    sound: {
      findFirst: jest.fn<() => Promise<unknown>>().mockResolvedValue(null),
      findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
      create: jest.fn<() => Promise<unknown>>().mockResolvedValue({ id: 'sound-1' }),
      update: jest.fn<() => Promise<unknown>>().mockResolvedValue({}),
    },
    soundUsage: {
      create: jest.fn<() => Promise<unknown>>().mockResolvedValue({}),
      deleteMany: jest.fn<() => Promise<unknown>>().mockResolvedValue({ count: 0 }),
      findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
      // Le recomptage remplace le décrément aveugle : sans ce mock, toute purge
      // lèverait « count is not a function » dans un `catch` silencieux.
      count: jest.fn<() => Promise<number>>().mockResolvedValue(0),
    },
    $transaction: jest.fn(async (ops: unknown) =>
      Array.isArray(ops) ? Promise.all(ops as Promise<unknown>[]) : ops),
    ...overrides,
  } as unknown as import('@meeshy/shared/prisma/client').PrismaClient;
}

describe('SoundCaptureService', () => {
  let soundsDir: string;
  let uploadsRoot: string;
  // Capturé AVANT le premier `beforeEach` : sans restauration, le drapeau forcé
  // ici fuit vers les fichiers suivants du même worker Jest, et un test censé
  // vérifier le comportement « bibliothèque fermée » passerait sur un service
  // resté ouvert.
  const ORIGINAL_FLAG = process.env.SOUND_LIBRARY_ENABLED;

  beforeEach(async () => {
    process.env.SOUND_LIBRARY_ENABLED = 'true';
    soundsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sounds-'));
    uploadsRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'uploads-'));
  });

  afterEach(() => {
    if (ORIGINAL_FLAG === undefined) delete process.env.SOUND_LIBRARY_ENABLED;
    else process.env.SOUND_LIBRARY_ENABLED = ORIGINAL_FLAG;
  });

  /** `PostMedia.filePath` est RELATIF à UPLOAD_PATH (tus-handler.ts:129). */
  async function seedMedia(id: string, content = id) {
    const rel = path.join('2026', '07', 'user-1', `${id}.m4a`);
    await fs.mkdir(path.dirname(path.join(uploadsRoot, rel)), { recursive: true });
    await fs.writeFile(path.join(uploadsRoot, rel), content);
    return { id, fileUrl: `/u/${id}.m4a`, filePath: rel, mimeType: 'audio/x-m4a', duration: 1000 };
  }

  it('test_hashFile_sameContent_producesSameDigest', async () => {
    const a = path.join(soundsDir, 'a'); const b = path.join(soundsDir, 'b');
    await fs.writeFile(a, 'meeshy'); await fs.writeFile(b, 'meeshy');
    expect(await SoundCaptureService.hashFile(a)).toBe(await SoundCaptureService.hashFile(b));
  });

  it('test_captureSounds_restrictedPost_createsNothing', async () => {
    const prisma = buildPrisma();
    await new SoundCaptureService(prisma, soundsDir, uploadsRoot).captureSounds({
      postId: 'p1', authorId: 'u1', isPublic: false,
      tracks: [{ trackId: 't1', postMediaId: 'm1' }],
    });
    expect(prisma.sound.create).not.toHaveBeenCalled();
  });

  it('test_captureSounds_relativeFilePath_isResolvedAgainstUploadsRoot', async () => {
    const media = await seedMedia('m1');
    const prisma = buildPrisma({
      postMedia: { findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([media]) },
    });
    await new SoundCaptureService(prisma, soundsDir, uploadsRoot).captureSounds({
      postId: 'p1', authorId: 'u1', isPublic: true,
      tracks: [{ trackId: 't1', postMediaId: 'm1' }],
    });
    expect(prisma.sound.create).toHaveBeenCalledTimes(1);
  });

  it('test_captureSounds_scopesMediaLookupToThePost', async () => {
    const prisma = buildPrisma();
    await new SoundCaptureService(prisma, soundsDir, uploadsRoot).captureSounds({
      postId: 'p1', authorId: 'u1', isPublic: true,
      tracks: [{ trackId: 't1', postMediaId: 'media-d-autrui' }],
    });
    expect(prisma.postMedia.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ postId: 'p1' }) }),
    );
  });

  it('test_captureSounds_privateSoundOfOtherUser_writesNoUsage', async () => {
    const prisma = buildPrisma({
      sound: {
        findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([
          { id: '507f1f77bcf86cd799439012', isPublic: false, uploaderId: 'autrui', mutedAt: null },
        ]),
        findFirst: jest.fn(), create: jest.fn(), update: jest.fn(),
      },
    });
    await new SoundCaptureService(prisma, soundsDir, uploadsRoot).captureSounds({
      postId: 'p1', authorId: 'u1', isPublic: true,
      tracks: [{ trackId: 't1', soundId: '507f1f77bcf86cd799439012' }],
    });
    expect(prisma.soundUsage.create).not.toHaveBeenCalled();
  });

  it('test_captureSounds_threeTracks_capturesAll', async () => {
    const medias = await Promise.all(['m1', 'm2', 'm3'].map((id) => seedMedia(id)));
    const prisma = buildPrisma({
      postMedia: { findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue(medias) },
    });
    await new SoundCaptureService(prisma, soundsDir, uploadsRoot).captureSounds({
      postId: 'p1', authorId: 'u1', isPublic: true,
      tracks: medias.map((m, i) => ({ trackId: `t${i}`, postMediaId: m.id })),
    });
    expect(prisma.sound.create).toHaveBeenCalledTimes(3);
  });

  it('test_captureSounds_sameHashTwice_reusesSound', async () => {
    const media = await seedMedia('m1', 'identique');
    const prisma = buildPrisma({
      postMedia: { findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([media]) },
      sound: {
        findFirst: jest.fn<() => Promise<unknown>>().mockResolvedValue({ id: 'sound-existant' }),
        findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
        create: jest.fn(), update: jest.fn<() => Promise<unknown>>().mockResolvedValue({}),
      },
    });
    await new SoundCaptureService(prisma, soundsDir, uploadsRoot).captureSounds({
      postId: 'p1', authorId: 'u1', isPublic: true,
      tracks: [{ trackId: 't1', postMediaId: 'm1' }],
    });
    expect(prisma.sound.create).not.toHaveBeenCalled();
  });

  it('test_captureSounds_nonAudioMime_capturesNothing', async () => {
    const media = { ...(await seedMedia('m1')), mimeType: 'image/png' };
    const prisma = buildPrisma({
      postMedia: { findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([media]) },
    });
    await new SoundCaptureService(prisma, soundsDir, uploadsRoot).captureSounds({
      postId: 'p1', authorId: 'u1', isPublic: true,
      tracks: [{ trackId: 't1', postMediaId: 'm1' }],
    });
    expect(prisma.sound.create).not.toHaveBeenCalled();
  });

  it('test_captureSounds_removedTrack_dropsItsUsage', async () => {
    // v1 asseyait l'assertion sur un `findMany` vide : `deleteMany` était appelé
    // à vide et le test aurait survécu à une purge qui ne purge rien. Ici la
    // piste retirée EXISTE.
    const prisma = buildPrisma({
      soundUsage: {
        create: jest.fn<() => Promise<unknown>>().mockResolvedValue({}),
        deleteMany: jest.fn<() => Promise<unknown>>().mockResolvedValue({ count: 1 }),
        findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([{ soundId: 'sound-orphelin' }]),
        count: jest.fn<() => Promise<number>>().mockResolvedValue(0),
      },
    });
    await new SoundCaptureService(prisma, soundsDir, uploadsRoot).captureSounds({
      postId: 'p1', authorId: 'u1', isPublic: true, tracks: [{ trackId: 't1', postMediaId: 'm1' }],
    });
    expect(prisma.soundUsage.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ postId: 'p1', trackId: { notIn: ['t1'] } }),
      }),
    );
  });

  it('test_release_recountsInsteadOfDecrementing', async () => {
    // Le décrément aveugle dérivait DÉFINITIVEMENT : deux usages restants après
    // la purge doivent donner 2, quelle que soit la valeur précédente.
    const prisma = buildPrisma({
      soundUsage: {
        create: jest.fn(),
        deleteMany: jest.fn<() => Promise<unknown>>().mockResolvedValue({ count: 3 }),
        findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([
          { soundId: 'sound-a' }, { soundId: 'sound-a' }, { soundId: 'sound-b' },
        ]),
        count: jest.fn<() => Promise<number>>().mockResolvedValue(2),
      },
    });
    await new SoundCaptureService(prisma, soundsDir, uploadsRoot).releasePost('p1');

    expect(prisma.sound.update).toHaveBeenCalledWith({
      where: { id: 'sound-a' }, data: { usageCount: 2 },
    });
    // Dédoublonné : `sound-a` apparaît deux fois dans les usages, une seule
    // fois dans les recomptages.
    expect(prisma.sound.update).toHaveBeenCalledTimes(2);
  });

  it('test_releasePost_prismaThrows_neverRejects', async () => {
    const prisma = buildPrisma({
      soundUsage: {
        create: jest.fn(), deleteMany: jest.fn(), count: jest.fn(),
        findMany: jest.fn<() => Promise<unknown[]>>().mockRejectedValue(new Error('DB down')),
      },
    });
    await expect(new SoundCaptureService(prisma, soundsDir, uploadsRoot).releasePost('p1'))
      .resolves.toBeUndefined();
  });

  it('test_releasePosts_emptyList_touchesNothing', async () => {
    const prisma = buildPrisma();
    await new SoundCaptureService(prisma, soundsDir, uploadsRoot).releasePosts([]);
    expect(prisma.soundUsage.findMany).not.toHaveBeenCalled();
    expect(prisma.soundUsage.deleteMany).not.toHaveBeenCalled();
  });

  /**
   * Seul le REFUS d'un emprunt était couvert : un `recordBorrowed` qui aurait
   * rejeté 100 % des `soundId` — donc la boucle de réutilisation entière —
   * laissait la suite verte.
   */
  it('test_captureSounds_publicSoundOfOtherUser_writesItsUsage', async () => {
    const prisma = buildPrisma({
      sound: {
        findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([
          { id: '507f1f77bcf86cd799439012', isPublic: true, uploaderId: 'autrui', mutedAt: null },
        ]),
        findFirst: jest.fn(), create: jest.fn(),
        update: jest.fn<() => Promise<unknown>>().mockResolvedValue({}),
      },
    });
    await new SoundCaptureService(prisma, soundsDir, uploadsRoot).captureSounds({
      postId: 'p1', authorId: 'u1', isPublic: true,
      tracks: [{ trackId: 't1', soundId: '507f1f77bcf86cd799439012', startMs: 500, endMs: 3500 }],
    });
    expect(prisma.soundUsage.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        soundId: '507f1f77bcf86cd799439012', postId: 'p1', trackId: 't1',
        startMs: 500, endMs: 3500,
      }),
    }));
    // Aucun fichier n'est copié : emprunter ne duplique pas le son.
    expect(prisma.sound.create).not.toHaveBeenCalled();
  });

  it('test_captureSounds_mutedSoundOfOtherUser_writesNoUsage', async () => {
    const prisma = buildPrisma({
      sound: {
        findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([
          { id: '507f1f77bcf86cd799439012', isPublic: true, uploaderId: 'autrui', mutedAt: new Date() },
        ]),
        findFirst: jest.fn(), create: jest.fn(), update: jest.fn(),
      },
    });
    await new SoundCaptureService(prisma, soundsDir, uploadsRoot).captureSounds({
      postId: 'p1', authorId: 'u1', isPublic: true,
      tracks: [{ trackId: 't1', soundId: '507f1f77bcf86cd799439012' }],
    });
    expect(prisma.soundUsage.create).not.toHaveBeenCalled();
  });

  /**
   * Le contenu du payload n'était JAMAIS inspecté : `isPublic: false` en dur,
   * `durationMs` en secondes ou `contentHash` absent seraient tous passés — le
   * dernier faisant tomber le second upload de chaque utilisateur en 500 sous
   * `@@unique([uploaderId, contentHash])`.
   */
  it('test_captureSounds_createPayload_isExactlyWhatTheSchemaExpects', async () => {
    const media = await seedMedia('m1', 'contenu-audio');
    const prisma = buildPrisma({
      postMedia: { findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([media]) },
    });
    await new SoundCaptureService(prisma, soundsDir, uploadsRoot).captureSounds({
      postId: 'p1', authorId: 'u1', isPublic: true,
      tracks: [{ trackId: 't1', postMediaId: 'm1' }],
    });

    const hash = createHash('sha256').update('contenu-audio').digest('hex');
    expect(prisma.sound.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        uploaderId: 'u1',
        contentHash: hash,
        fileUrl: `/api/v1/static/${hash}.m4a`,
        // `PostMedia.duration` est en MILLISECONDES (schema.prisma).
        durationMs: 1000,
        // Champ hérité, en secondes.
        duration: 1,
        isPublic: true,
        sourcePostId: 'p1',
        canonicalPostMediaId: 'm1',
        mimeType: 'audio/x-m4a',
      }),
    }));
    // Le fichier est bien nommé par son hash dans le volume dédié.
    await expect(fs.access(path.join(soundsDir, `${hash}.m4a`))).resolves.toBeUndefined();
  });

  it('test_captureSounds_unservableFormat_capturesNothing', async () => {
    // `.webm` n'est ni dans les extensions servies ni dans la table MIME : le
    // capturer créerait un `Sound` dont le `fileUrl` renverrait 400 à vie.
    const rel = path.join('2026', '07', 'user-1', 'm1.webm');
    await fs.mkdir(path.dirname(path.join(uploadsRoot, rel)), { recursive: true });
    await fs.writeFile(path.join(uploadsRoot, rel), 'opus');
    const prisma = buildPrisma({
      postMedia: {
        findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([
          { id: 'm1', fileUrl: '/u/m1.webm', filePath: rel, mimeType: 'audio/webm', duration: 1000 },
        ]),
      },
    });
    await new SoundCaptureService(prisma, soundsDir, uploadsRoot).captureSounds({
      postId: 'p1', authorId: 'u1', isPublic: true,
      tracks: [{ trackId: 't1', postMediaId: 'm1' }],
    });
    expect(prisma.sound.create).not.toHaveBeenCalled();
  });

  it('test_captureSounds_unknownExtensionButServableMime_usesTheMimeExtension', async () => {
    const rel = path.join('2026', '07', 'user-1', 'enregistrement');
    await fs.mkdir(path.dirname(path.join(uploadsRoot, rel)), { recursive: true });
    await fs.writeFile(path.join(uploadsRoot, rel), 'sans-extension');
    const prisma = buildPrisma({
      postMedia: {
        findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([
          { id: 'm1', fileUrl: '/u/x', filePath: rel, mimeType: 'audio/mpeg', duration: 1000 },
        ]),
      },
    });
    await new SoundCaptureService(prisma, soundsDir, uploadsRoot).captureSounds({
      postId: 'p1', authorId: 'u1', isPublic: true,
      tracks: [{ trackId: 't1', postMediaId: 'm1' }],
    });
    const hash = createHash('sha256').update('sans-extension').digest('hex');
    expect(prisma.sound.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ fileUrl: `/api/v1/static/${hash}.mp3` }),
    }));
  });

  /**
   * L'index unique `(uploaderId, contentHash)` ne tient que si les DEUX chemins
   * de création hachent identiquement : la capture lit le fichier EN FLUX
   * (durée illimitée), l'upload manuel hache le buffer déjà en mémoire. Rien ne
   * pinnait cette égalité — la faire diverger dédoublonnerait à moitié, en
   * silence.
   */
  it('test_hashFile_streamed_equalsTheRouteBufferHash', async () => {
    const file = path.join(soundsDir, 'gros.m4a');
    // > 64 Kio : force plusieurs `data` sur le flux, là où un petit fichier
    // n'en émettrait qu'un seul et rendrait le test tautologique.
    const payload = Buffer.alloc(200_000, 'meeshy');
    await fs.writeFile(file, payload);

    const streamed = await SoundCaptureService.hashFile(file);
    const buffered = createHash('sha256').update(payload).digest('hex');
    expect(streamed).toBe(buffered);
  });

  it('test_uploadRoute_hashesWithTheSameAlgorithm', () => {
    // Garde de source : l'égalité ci-dessus ne vaut que tant que la route
    // utilise bien SHA-256 sur le buffer intégral.
    const source = fsSync.readFileSync(
      path.join(__dirname, '..', '..', '..', 'routes', 'posts', 'audio.ts'), 'utf-8');
    expect(source).toContain("createHash('sha256').update(buffer).digest('hex')");
  });

  it('test_captureSounds_prismaThrows_neverRejects', async () => {
    const prisma = buildPrisma({
      postMedia: { findMany: jest.fn<() => Promise<unknown[]>>().mockRejectedValue(new Error('DB down')) },
    });
    await expect(new SoundCaptureService(prisma, soundsDir, uploadsRoot).captureSounds({
      postId: 'p1', authorId: 'u1', isPublic: true, tracks: [{ trackId: 't1', postMediaId: 'm1' }],
    })).resolves.toBeUndefined();
  });

  it('test_captureSounds_flagDisabled_capturesNothing', async () => {
    process.env.SOUND_LIBRARY_ENABLED = 'false';
    const prisma = buildPrisma();
    await new SoundCaptureService(prisma, soundsDir, uploadsRoot).captureSounds({
      postId: 'p1', authorId: 'u1', isPublic: true, tracks: [{ trackId: 't1', postMediaId: 'm1' }],
    });
    expect(prisma.postMedia.findMany).not.toHaveBeenCalled();
  });
});
