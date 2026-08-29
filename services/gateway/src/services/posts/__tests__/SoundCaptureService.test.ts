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
      // `create` avalait un doublon `(postId, trackId)` sans jamais mettre à
      // jour sa fenêtre — remplacé par `upsert` (republication = mise à jour).
      upsert: jest.fn<() => Promise<unknown>>().mockResolvedValue({}),
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

  afterEach(async () => {
    if (ORIGINAL_FLAG === undefined) delete process.env.SOUND_LIBRARY_ENABLED;
    else process.env.SOUND_LIBRARY_ENABLED = ORIGINAL_FLAG;
    // Deux répertoires par test, sinon abandonnés dans $TMPDIR à chaque
    // exécution — plusieurs centaines s'y étaient déjà accumulés.
    await fs.rm(soundsDir, { recursive: true, force: true });
    await fs.rm(uploadsRoot, { recursive: true, force: true });
  });

  /** `PostMedia.filePath` est RELATIF à UPLOAD_PATH (tus-handler.ts:129). */
  async function seedMedia(id: string, content = id) {
    const rel = path.join('2026', '07', 'user-1', `${id}.m4a`);
    await fs.mkdir(path.dirname(path.join(uploadsRoot, rel)), { recursive: true });
    await fs.writeFile(path.join(uploadsRoot, rel), content);
    return { id, fileUrl: `/u/${id}.m4a`, filePath: rel, mimeType: 'audio/x-m4a', duration: 1000 };
  }

  /**
   * Digest PINNÉ, pas une comparaison de deux hachages entre eux : hacher deux
   * fois les mêmes octets avec la même fonction est égal PAR CONSTRUCTION, donc
   * la v1 de ce test restait verte en passant l'algorithme à MD5. C'est la
   * valeur SHA-256 qui doit être gravée — l'index `@@unique([uploaderId,
   * contentHash])` et le dédoublonnage entre les deux chemins en dépendent.
   */
  it('test_hashFile_pinsTheSha256Digest', async () => {
    const file = path.join(soundsDir, 'a');
    await fs.writeFile(file, 'meeshy');
    expect(await SoundCaptureService.hashFile(file))
      .toBe('ecd1c495f1b3378b9beb8b6ebd7347e31baf8d08f48f15ebbad16cbee78a5d10');
  });

  it('test_captureSounds_restrictedPost_createsNothing', async () => {
    // Le média DOIT exister : avec le `postMedia.findMany` vide du mock par
    // défaut, `sound.create` n'aurait de toute façon jamais été appelé et le
    // test restait vert même en supprimant la garde `!ctx.isPublic`.
    const media = await seedMedia('m1');
    const prisma = buildPrisma({
      postMedia: { findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([media]) },
    });
    await new SoundCaptureService(prisma, soundsDir, uploadsRoot).captureSounds({
      postId: 'p1', authorId: 'u1', feedsLibrary: false,
      tracks: [{ trackId: 't1', postMediaId: 'm1' }],
    });
    expect(prisma.sound.create).not.toHaveBeenCalled();
  });

  // MARK: - Forme d'onde (Sound.waveform n'avait aucun écrivain)
  //
  // #4190 — ces deux témoins sont désormais la SEULE couverture de la forme
  // d'onde à l'écriture. Son jumeau de source, `routes/posts/__tests__/
  // audio.waveform.test.ts`, lisait `routes/posts/audio.ts` pour vérifier que
  // l'upload manuel lisait le champ multipart `waveform` et le posait sur son
  // `prisma.sound.create` ; `POST /stories/audio` a été retirée, et avec elle
  // ce second écrivain. Les deux témoins ci-dessous portent la même propriété
  // — un `Sound` naît AVEC sa forme d'onde, jamais avec un `[]` gravé en dur —
  // sur le seul écrivain restant, et ils la portent MIEUX : ils assertent sur
  // l'appel Prisma réel, là où le témoin retiré lisait du texte.

  it('test_captureWritesWaveformOnCreatedSound', async () => {
    const media = await seedMedia('m1');
    const prisma = buildPrisma({
      postMedia: { findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([media]) },
    });
    await new SoundCaptureService(prisma, soundsDir, uploadsRoot).captureSounds({
      postId: 'p1', authorId: 'u1', feedsLibrary: true,
      tracks: [{ trackId: 't1', postMediaId: 'm1', waveform: [0.1, 0.7, 0.3] }],
    });
    expect(prisma.sound.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ waveform: [0.1, 0.7, 0.3] }),
      }),
    );
  });

  it('test_captureWithoutWaveform_writesEmptyArray', async () => {
    // `Float[]` n'est pas nullable en Prisma : l'absence s'écrit `[]`, ce que
    // sert déjà toute la bibliothèque existante. Aucun changement de
    // comportement pour une piste sans échantillons — c'est la garde de
    // non-régression.
    const media = await seedMedia('m2');
    const prisma = buildPrisma({
      postMedia: { findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([media]) },
    });
    await new SoundCaptureService(prisma, soundsDir, uploadsRoot).captureSounds({
      postId: 'p1', authorId: 'u1', feedsLibrary: true,
      tracks: [{ trackId: 't1', postMediaId: 'm2' }],
    });
    expect(prisma.sound.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ waveform: [] }) }),
    );
  });

  // MARK: - Fenêtre choisie vs défaut accepté, et plafond sur la durée réelle

  /**
   * Chemin du son EMPRUNTÉ. `recordBorrowed` résout l'autorisation par
   * `sound.findMany` — PAS `findFirst`. Un mock qui ne peuple que `findFirst`
   * laisse l'ensemble autorisé vide : la piste meurt sur un `continue`,
   * `soundUsage` n'est jamais écrit, et l'assertion échoue sans dire pourquoi
   * (le service ne rejette JAMAIS).
   */
  const borrowedPrisma = (durationMs: number | null) => buildPrisma({
    sound: {
      findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([
        { id: 's1', isPublic: true, uploaderId: 'u1', mutedAt: null, durationMs },
      ]),
      findFirst: jest.fn<() => Promise<unknown>>().mockResolvedValue(null),
      create: jest.fn<() => Promise<unknown>>().mockResolvedValue({ id: 's1' }),
      update: jest.fn<() => Promise<unknown>>().mockResolvedValue({}),
    },
  });

  /** Évite `jest.Mock` comme type : le stub `PrismaClient` est `[key: string]: any`. */
  type UpsertArgs = {
    create: { startMs?: number; endMs?: number; windowAdjustedAt: Date | null };
    update: { startMs?: number; endMs?: number; windowAdjustedAt: Date | null };
  };
  const upsertCalls = (prisma: unknown): UpsertArgs[] =>
    (prisma as { soundUsage: { upsert: { mock: { calls: UpsertArgs[][] } } } })
      .soundUsage.upsert.mock.calls.map((c) => c[0]);

  it('test_recordUsage_stampsWindowAdjustedAtOnlyWhenAuthorMovedIt', async () => {
    const prisma = borrowedPrisma(90000);
    await new SoundCaptureService(prisma, soundsDir, uploadsRoot).captureSounds({
      postId: 'p1', authorId: 'u1', feedsLibrary: true,
      tracks: [{ trackId: 't1', soundId: 's1', windowAdjusted: true }],
    });
    expect(upsertCalls(prisma)[0].create.windowAdjustedAt).toBeInstanceOf(Date);
  });

  it('test_recordUsage_leavesWindowAdjustedAtNullOnAcceptedDefault', async () => {
    const prisma = borrowedPrisma(90000);
    await new SoundCaptureService(prisma, soundsDir, uploadsRoot).captureSounds({
      postId: 'p1', authorId: 'u1', feedsLibrary: true,
      tracks: [{ trackId: 't1', soundId: 's1' }],
    });
    expect(upsertCalls(prisma)[0].create.windowAdjustedAt).toBeNull();
  });

  it('test_recordUsage_clampsEndMsToRealSoundDuration', async () => {
    // Blob sans `intrinsicDuration` (client antérieur, fond legacy) : la
    // fenêtre timeline de 60 s a produit endMs = 60000, mais le son ne dure
    // que 12 s. Sans plafond on réécrit l'attribution fausse que ce lot
    // corrige — et ce plafond exige la base, donc il ne peut pas vivre dans
    // `extractCaptureTracks`, qui est pure.
    const prisma = borrowedPrisma(12000);
    await new SoundCaptureService(prisma, soundsDir, uploadsRoot).captureSounds({
      postId: 'p1', authorId: 'u1', feedsLibrary: true,
      tracks: [{ trackId: 't1', soundId: 's1', startMs: 0, endMs: 60000 }],
    });
    expect(upsertCalls(prisma)[0].create.endMs).toBe(12000);
  });

  it('test_recordUsage_unknownSoundDuration_leavesEndMsUntouched', async () => {
    const prisma = borrowedPrisma(null);
    await new SoundCaptureService(prisma, soundsDir, uploadsRoot).captureSounds({
      postId: 'p1', authorId: 'u1', feedsLibrary: true,
      tracks: [{ trackId: 't1', soundId: 's1', startMs: 0, endMs: 60000 }],
    });
    expect(upsertCalls(prisma)[0].create.endMs).toBe(60000);
  });

  it('test_republication_updatesTheWindow_ratherThanSwallowingIt', async () => {
    // Le `catch` de doublon rendait la republication INERTE : un auteur qui
    // déplace sa fenêtre et republie ne modifiait jamais la ligne, donc
    // `windowAdjustedAt` était inécrivable après la première publication.
    const prisma = borrowedPrisma(90000);
    const service = new SoundCaptureService(prisma, soundsDir, uploadsRoot);
    const base = { postId: 'p1', authorId: 'u1', feedsLibrary: true };
    await service.captureSounds({ ...base, tracks: [{ trackId: 't1', soundId: 's1', startMs: 0, endMs: 5000 }] });
    await service.captureSounds({
      ...base,
      tracks: [{ trackId: 't1', soundId: 's1', startMs: 12000, endMs: 20000, windowAdjusted: true }],
    });
    const second = upsertCalls(prisma)[1];
    expect(second.update.startMs).toBe(12000);
    expect(second.update.endMs).toBe(20000);
    expect(second.update.windowAdjustedAt).toBeInstanceOf(Date);
  });

  it('test_captureSounds_becomingPrivate_releasesItsUsages', async () => {
    // Publier puis restreindre doit LIBÉRER : sinon le compteur qui trie la
    // découverte reste gonflé pour toujours.
    const prisma = buildPrisma({
      soundUsage: {
        create: jest.fn(),
        deleteMany: jest.fn<() => Promise<unknown>>().mockResolvedValue({ count: 1 }),
        findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([{ soundId: 'sound-a' }]),
        count: jest.fn<() => Promise<number>>().mockResolvedValue(0),
      },
    });
    await new SoundCaptureService(prisma, soundsDir, uploadsRoot).captureSounds({
      postId: 'p1', authorId: 'u1', feedsLibrary: false, tracks: [],
    });
    expect(prisma.soundUsage.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { postId: 'p1' } }),
    );
    expect(prisma.sound.update).toHaveBeenCalledWith({
      where: { id: 'sound-a' }, data: { usageCount: 0 },
    });
  });

  it('test_captureSounds_relativeFilePath_isResolvedAgainstUploadsRoot', async () => {
    const media = await seedMedia('m1');
    const prisma = buildPrisma({
      postMedia: { findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([media]) },
    });
    await new SoundCaptureService(prisma, soundsDir, uploadsRoot).captureSounds({
      postId: 'p1', authorId: 'u1', feedsLibrary: true,
      tracks: [{ trackId: 't1', postMediaId: 'm1' }],
    });
    expect(prisma.sound.create).toHaveBeenCalledTimes(1);
  });

  it('test_captureSounds_scopesMediaLookupToThePost', async () => {
    const prisma = buildPrisma();
    await new SoundCaptureService(prisma, soundsDir, uploadsRoot).captureSounds({
      postId: 'p1', authorId: 'u1', feedsLibrary: true,
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
      postId: 'p1', authorId: 'u1', feedsLibrary: true,
      tracks: [{ trackId: 't1', soundId: '507f1f77bcf86cd799439012' }],
    });
    expect(prisma.soundUsage.upsert).not.toHaveBeenCalled();
  });

  it('test_captureSounds_threeTracks_capturesAll', async () => {
    const medias = await Promise.all(['m1', 'm2', 'm3'].map((id) => seedMedia(id)));
    const prisma = buildPrisma({
      postMedia: { findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue(medias) },
    });
    await new SoundCaptureService(prisma, soundsDir, uploadsRoot).captureSounds({
      postId: 'p1', authorId: 'u1', feedsLibrary: true,
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
      postId: 'p1', authorId: 'u1', feedsLibrary: true,
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
      postId: 'p1', authorId: 'u1', feedsLibrary: true,
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
      postId: 'p1', authorId: 'u1', feedsLibrary: true, tracks: [{ trackId: 't1', postMediaId: 'm1' }],
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
      postId: 'p1', authorId: 'u1', feedsLibrary: true,
      tracks: [{ trackId: 't1', soundId: '507f1f77bcf86cd799439012', startMs: 500, endMs: 3500 }],
    });
    expect(prisma.soundUsage.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
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
      postId: 'p1', authorId: 'u1', feedsLibrary: true,
      tracks: [{ trackId: 't1', soundId: '507f1f77bcf86cd799439012' }],
    });
    expect(prisma.soundUsage.upsert).not.toHaveBeenCalled();
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
      postId: 'p1', authorId: 'u1', feedsLibrary: true,
      tracks: [{ trackId: 't1', postMediaId: 'm1' }],
    });

    const hash = createHash('sha256').update('contenu-audio').digest('hex');
    expect(prisma.sound.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        uploaderId: 'u1',
        contentHash: hash,
        // Nom OPAQUE : `fileUrl` est dans le DTO public, le nommer par le hash
        // publiait le `contentHash` que `toDTO` retire et donnait un oracle de
        // possession de fichier.
        fileUrl: expect.stringMatching(/^\/api\/v1\/static\/[0-9a-f-]{36}\.m4a$/),
        // TITRE VIDE + `isAutoGenerated` : le client compose « Son original ·
        // @pseudo » dans SA langue. Écrire le libellé en base gravait du
        // français qui serait ressorti tel quel dans les sept langues.
        title: '',
        isAutoGenerated: true,
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

    const written = await fs.readdir(soundsDir);
    expect(written).toHaveLength(1);
    expect(written[0]).not.toContain(hash);
  });


  /**
   * Vignette du contenu source, dénormalisée pour le sélecteur de sons : la
   * résoudre à la lecture ferait un N+1 sur chaque page de liste. Le client
   * dégrade ensuite sur `coverThumbHash`, puis sur l'avatar de l'uploadeur.
   */
  it('test_captureSounds_storesTheCoverOfTheSourceContent', async () => {
    const media = await seedMedia('m1');
    const findMany = jest.fn<() => Promise<unknown[]>>().mockResolvedValue([media]);
    const findFirst = jest.fn<(a: unknown) => Promise<unknown>>().mockResolvedValue({
      thumbnailUrl: '/thumbs/v1.jpg', thumbHash: 'HASH', fileUrl: '/v1.mp4', mimeType: 'video/mp4',
    });
    const prisma = buildPrisma({ postMedia: { findMany, findFirst } });

    await new SoundCaptureService(prisma, soundsDir, uploadsRoot).captureSounds({
      postId: 'p1', authorId: 'u1', feedsLibrary: true,
      tracks: [{ trackId: 't1', postMediaId: 'm1' }],
    });

    expect(prisma.sound.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ coverUrl: '/thumbs/v1.jpg', coverThumbHash: 'HASH' }),
    }));
    // Cherchée dans le POST courant, et seulement sur du visuel.
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ postId: 'p1' }) }),
    );
  });

  it('test_captureSounds_imageWithoutThumbnail_usesTheImageItself', async () => {
    const media = await seedMedia('m1');
    const prisma = buildPrisma({
      postMedia: {
        findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([media]),
        findFirst: jest.fn<() => Promise<unknown>>().mockResolvedValue({
          thumbnailUrl: null, thumbHash: null, fileUrl: '/img.jpg', mimeType: 'image/jpeg',
        }),
      },
    });
    await new SoundCaptureService(prisma, soundsDir, uploadsRoot).captureSounds({
      postId: 'p1', authorId: 'u1', feedsLibrary: true,
      tracks: [{ trackId: 't1', postMediaId: 'm1' }],
    });
    expect(prisma.sound.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ coverUrl: '/img.jpg' }),
    }));
  });

  it('test_captureSounds_coverLookupFails_capturesAnyway', async () => {
    // Une vignette manquante ne doit JAMAIS empêcher la capture : le client
    // dégrade sur l'avatar.
    const media = await seedMedia('m1');
    const prisma = buildPrisma({
      postMedia: {
        findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([media]),
        findFirst: jest.fn<() => Promise<unknown>>().mockRejectedValue(new Error('DB down')),
      },
    });
    await new SoundCaptureService(prisma, soundsDir, uploadsRoot).captureSounds({
      postId: 'p1', authorId: 'u1', feedsLibrary: true,
      tracks: [{ trackId: 't1', postMediaId: 'm1' }],
    });
    expect(prisma.sound.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ coverUrl: null, coverThumbHash: null }),
    }));
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
      postId: 'p1', authorId: 'u1', feedsLibrary: true,
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
      postId: 'p1', authorId: 'u1', feedsLibrary: true,
      tracks: [{ trackId: 't1', postMediaId: 'm1' }],
    });
    expect(prisma.sound.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        fileUrl: expect.stringMatching(/^\/api\/v1\/static\/[0-9a-f-]{36}\.mp3$/),
      }),
    }));
  });

  /**
   * L'index unique `(uploaderId, contentHash)` ne dédoublonne que si TOUS les
   * écrivains de `contentHash` hachent identiquement. Ce témoin pinne la
   * propriété du hachage EN FLUX (durée illimitée, jamais chargé en mémoire) :
   * il rend le même condensat qu'un SHA-256 en un seul coup sur le contenu
   * intégral. La faire diverger dédoublonnerait à moitié, en silence.
   *
   * RENOMMÉ (#4190) — il s'appelait `…_equalsTheRouteBufferHash` et opposait le
   * flux au buffer que hachait `POST /stories/audio`. Cette route est RETIRÉE :
   * le nom nommait un site qui n'existe plus, alors que l'assertion, elle, est
   * intacte et toujours utile. Un nom qui ment sur son sujet est pire qu'un nom
   * générique — il envoie chercher là où il n'y a rien.
   */
  it('test_hashFile_streamed_equalsAOneShotSha256', async () => {
    const file = path.join(soundsDir, 'gros.m4a');
    // > 64 Kio : force plusieurs `data` sur le flux, là où un petit fichier
    // n'en émettrait qu'un seul et rendrait le test tautologique.
    const payload = Buffer.alloc(200_000, 'meeshy');
    await fs.writeFile(file, payload);

    const streamed = await SoundCaptureService.hashFile(file);
    const buffered = createHash('sha256').update(payload).digest('hex');
    expect(streamed).toBe(buffered);
  });

  /**
   * REPOINTÉ (#4190). Le témoin d'origine — `test_uploadRoute_hashesWithThe
   * SameAlgorithm` — lisait la SOURCE de `routes/posts/audio.ts` pour vérifier
   * que la route d'upload manuel hachait bien `createHash('sha256')
   * .update(buffer)`. `POST /stories/audio` a été retirée : son sujet n'existe
   * plus. La PROPRIÉTÉ qu'il gardait, elle, survit — et il ne se supprime donc
   * pas, il change d'objet.
   *
   * Ce qu'il gardait vraiment : « deux écrivains de `contentHash` ne peuvent
   * pas diverger ». Il en reste DEUX, et ils vivent tous les deux dans CE
   * service — la piste EXTRAITE d'une vidéo et le fichier audio DIRECT, deux
   * `prisma.sound.create` distincts. Ce qui les tient ensemble n'est plus une
   * égalité entre deux fichiers, c'est un SITE DE HACHAGE UNIQUE : les deux
   * passent par `SoundCaptureService.hashFile`.
   *
   * Un second `createHash` ici — même en SHA-256, même « juste pour ce
   * chemin-là », même sur un buffer plutôt qu'un flux — rouvrirait exactement
   * la divergence que l'ancien témoin interdisait entre la route et le service.
   * Le symptôme serait le même : dédoublonnage à moitié, sans erreur.
   */
  it('test_soundCaptureService_hasASingleHashingSite', () => {
    const source = fsSync.readFileSync(
      path.join(__dirname, '..', 'SoundCaptureService.ts'), 'utf-8');
    // Commentaires RETIRÉS avant la recherche : le fichier lu cite `createHash`
    // en prose (le doc-comment de `hashFile`), et sans ce filtre la garde
    // compterait des MENTIONS au lieu d'appels — elle rougirait sur une phrase
    // et resterait verte sur un second hachage commenté par-dessus.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code.match(/createHash\(/g) ?? []).toHaveLength(1);
    expect(code).toContain("crypto.createHash('sha256')");
  });

  /**
   * `reconcileUsageCounts` n'avait AUCUN test : 40 lignes, pagination par
   * curseur, et un invariant « n'écrit que si `apply` » que rien ne vérifiait.
   */
  it('test_reconcileUsageCounts_withoutApply_writesNothing', async () => {
    const prisma = buildPrisma({
      sound: {
        findMany: jest.fn<() => Promise<unknown[]>>()
          .mockResolvedValueOnce([{ id: 's1', usageCount: 7 }])
          .mockResolvedValue([]),
        findFirst: jest.fn(), create: jest.fn(),
        update: jest.fn<() => Promise<unknown>>().mockResolvedValue({}),
      },
      soundUsage: {
        create: jest.fn(), deleteMany: jest.fn(), findMany: jest.fn(),
        count: jest.fn<() => Promise<number>>().mockResolvedValue(2),
      },
    });
    const result = await new SoundCaptureService(prisma, soundsDir, uploadsRoot)
      .reconcileUsageCounts();

    expect(result).toEqual({ examined: 1, drifted: 1, fixed: 0 });
    expect(prisma.sound.update).not.toHaveBeenCalled();
  });

  it('test_reconcileUsageCounts_withApply_realignsTheCounter', async () => {
    const prisma = buildPrisma({
      sound: {
        findMany: jest.fn<() => Promise<unknown[]>>()
          .mockResolvedValueOnce([{ id: 's1', usageCount: 7 }, { id: 's2', usageCount: 2 }])
          .mockResolvedValue([]),
        findFirst: jest.fn(), create: jest.fn(),
        update: jest.fn<() => Promise<unknown>>().mockResolvedValue({}),
      },
      soundUsage: {
        create: jest.fn(), deleteMany: jest.fn(), findMany: jest.fn(),
        count: jest.fn<() => Promise<number>>().mockResolvedValue(2),
      },
    });
    const result = await new SoundCaptureService(prisma, soundsDir, uploadsRoot)
      .reconcileUsageCounts({ apply: true });

    // `s2` est déjà juste : on ne le réécrit pas.
    expect(result).toEqual({ examined: 2, drifted: 1, fixed: 1 });
    expect(prisma.sound.update).toHaveBeenCalledTimes(1);
    expect(prisma.sound.update).toHaveBeenCalledWith({
      where: { id: 's1' }, data: { usageCount: 2 },
    });
  });

  /**
   * Le balayage est le filet de `releasePost`, qui DOIT avaler ses erreurs.
   * Sans lui, un échec de libération laisse des lignes que `reconcileUsageCounts`
   * compterait comme légitimes — le compteur gonflé serait « confirmé ».
   */
  it('test_sweepOrphanUsages_deletesUsagesOfDeletedPosts', async () => {
    const prisma = buildPrisma({
      post: {
        findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([
          { id: 'vivant', deletedAt: null },
          { id: 'soft-supprime', deletedAt: new Date() },
        ]),
      },
      soundUsage: {
        create: jest.fn(),
        deleteMany: jest.fn<() => Promise<unknown>>().mockResolvedValue({ count: 2 }),
        findMany: jest.fn<() => Promise<unknown[]>>()
          .mockResolvedValueOnce([
            { id: 'u1', postId: 'vivant', soundId: 's1' },
            { id: 'u2', postId: 'soft-supprime', soundId: 's1' },
            { id: 'u3', postId: 'disparu', soundId: 's2' },
          ])
          .mockResolvedValue([]),
        count: jest.fn<() => Promise<number>>().mockResolvedValue(1),
      },
    });
    const result = await new SoundCaptureService(prisma, soundsDir, uploadsRoot)
      .sweepOrphanUsages({ apply: true });

    // `soft-supprime` compte comme orphelin : c'est précisément le cas où
    // `releasePost` avait échoué. `disparu` n'est pas revenu du tout.
    expect(result.orphans).toBe(2);
    expect(prisma.soundUsage.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['u2', 'u3'] } },
    });
  });

  it('test_sweepOrphanUsages_withoutApply_writesNothing', async () => {
    const prisma = buildPrisma({
      post: { findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]) },
      soundUsage: {
        create: jest.fn(), deleteMany: jest.fn(), count: jest.fn(),
        findMany: jest.fn<() => Promise<unknown[]>>()
          .mockResolvedValueOnce([{ id: 'u1', postId: 'disparu', soundId: 's1' }])
          .mockResolvedValue([]),
      },
    });
    const result = await new SoundCaptureService(prisma, soundsDir, uploadsRoot)
      .sweepOrphanUsages();

    expect(result.orphans).toBe(1);
    expect(result.deleted).toBe(0);
    expect(prisma.soundUsage.deleteMany).not.toHaveBeenCalled();
  });

  it('test_captureSounds_prismaThrows_neverRejects', async () => {
    const prisma = buildPrisma({
      postMedia: { findMany: jest.fn<() => Promise<unknown[]>>().mockRejectedValue(new Error('DB down')) },
    });
    await expect(new SoundCaptureService(prisma, soundsDir, uploadsRoot).captureSounds({
      postId: 'p1', authorId: 'u1', feedsLibrary: true, tracks: [{ trackId: 't1', postMediaId: 'm1' }],
    })).resolves.toBeUndefined();
  });

  it('test_captureSounds_flagDisabled_capturesNothing', async () => {
    process.env.SOUND_LIBRARY_ENABLED = 'false';
    const prisma = buildPrisma();
    await new SoundCaptureService(prisma, soundsDir, uploadsRoot).captureSounds({
      postId: 'p1', authorId: 'u1', feedsLibrary: true, tracks: [{ trackId: 't1', postMediaId: 'm1' }],
    });
    expect(prisma.postMedia.findMany).not.toHaveBeenCalled();
  });
});
