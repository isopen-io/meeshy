import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { SoundCaptureService } from '../SoundCaptureService';

/**
 * #9848 — un son RETIRÉ de la bibliothèque par son auteur :
 *   - ne s'emprunte plus dans un NOUVEAU post ;
 *   - reste lié aux posts qui l'utilisaient déjà (une republication ne casse
 *     rien sous les pieds d'un lecteur) ;
 *   - ne RÉAPPARAÎT pas à l'extraction suivante du même contenu : la ligne
 *     survivante occupe `@@unique([uploaderId, contentHash])`, et la capture
 *     ne doit ni la recréer ni la ressusciter.
 */

const SOUND_ID = '507f1f77bcf86cd799439012';
const noopWaveform = async () => [];

type UsageWhere = { postId?: unknown; soundId?: unknown; trackId?: unknown };

function buildPrisma(options: {
  readonly borrowable?: ReadonlyArray<Record<string, unknown>>;
  readonly existingUsages?: ReadonlyArray<{ soundId: string; postId: string; trackId: string }>;
  readonly existingByHash?: Record<string, unknown> | null;
  readonly medias?: ReadonlyArray<Record<string, unknown>>;
}) {
  const usages = options.existingUsages ?? [];
  return {
    postMedia: {
      findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([...(options.medias ?? [])]),
      findFirst: jest.fn<() => Promise<unknown>>().mockResolvedValue(null),
    },
    user: { findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue({ username: 'tester' }) },
    sound: {
      findFirst: jest.fn<() => Promise<unknown>>().mockResolvedValue(options.existingByHash ?? null),
      findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([...(options.borrowable ?? [])]),
      create: jest.fn<() => Promise<unknown>>().mockResolvedValue({ id: 'sound-neuf' }),
      update: jest.fn<() => Promise<unknown>>().mockResolvedValue({}),
    },
    soundUsage: {
      upsert: jest.fn<() => Promise<unknown>>().mockResolvedValue({}),
      deleteMany: jest.fn<() => Promise<unknown>>().mockResolvedValue({ count: 0 }),
      findMany: jest.fn<(args: { where: UsageWhere }) => Promise<unknown[]>>().mockImplementation(async (args) => {
        const where = args.where;
        // `dropRemovedUsages` cherche les pistes DISPARUES (`trackId: { notIn }`) :
        // aucune ici, l'édition garde ses pistes.
        if (where.trackId) return [];
        return usages.filter((u) => {
          if (typeof where.postId === 'string' && u.postId !== where.postId) return false;
          const soundIn = (where.soundId as { in?: string[] } | undefined)?.in;
          if (soundIn && !soundIn.includes(u.soundId)) return false;
          return true;
        });
      }),
      count: jest.fn<() => Promise<number>>().mockResolvedValue(1),
    },
  } as unknown as import('@meeshy/shared/prisma/client').PrismaClient & {
    sound: { create: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
    soundUsage: { upsert: jest.Mock };
  };
}

const deletedSound = {
  id: SOUND_ID, isPublic: true, uploaderId: 'autrui', mutedAt: null,
  deletedAt: new Date('2026-10-09T10:00:00.000Z'), durationMs: 4000,
};

describe('SoundCaptureService — son retiré de la bibliothèque (#9848)', () => {
  let soundsDir: string;
  let uploadsRoot: string;
  const ORIGINAL_FLAG = process.env.SOUND_LIBRARY_ENABLED;

  beforeEach(async () => {
    process.env.SOUND_LIBRARY_ENABLED = 'true';
    soundsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sounds-del-'));
    uploadsRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'uploads-del-'));
  });

  afterEach(async () => {
    if (ORIGINAL_FLAG === undefined) delete process.env.SOUND_LIBRARY_ENABLED;
    else process.env.SOUND_LIBRARY_ENABLED = ORIGINAL_FLAG;
    await fs.rm(soundsDir, { recursive: true, force: true });
    await fs.rm(uploadsRoot, { recursive: true, force: true });
  });

  async function seedAudio(id: string, content: string) {
    const rel = path.join('2026', '10', 'user-1', `${id}.m4a`);
    await fs.mkdir(path.dirname(path.join(uploadsRoot, rel)), { recursive: true });
    await fs.writeFile(path.join(uploadsRoot, rel), content);
    return { id, fileUrl: `/u/${id}.m4a`, filePath: rel, mimeType: 'audio/x-m4a', duration: 4000, language: null };
  }

  it('test_borrow_deletedSoundInANewPost_writesNoUsage', async () => {
    const prisma = buildPrisma({ borrowable: [deletedSound] });
    await new SoundCaptureService(prisma, soundsDir, uploadsRoot, undefined, noopWaveform).captureSounds({
      postId: 'nouveau-post', authorId: 'u1', feedsLibrary: true,
      tracks: [{ trackId: 't1', soundId: SOUND_ID }],
    });
    expect(prisma.soundUsage.upsert).not.toHaveBeenCalled();
  });

  it('test_borrow_deletedSoundOfOwnLibrary_inANewPost_writesNoUsage', async () => {
    const prisma = buildPrisma({ borrowable: [{ ...deletedSound, uploaderId: 'u1' }] });
    await new SoundCaptureService(prisma, soundsDir, uploadsRoot, undefined, noopWaveform).captureSounds({
      postId: 'nouveau-post', authorId: 'u1', feedsLibrary: true,
      tracks: [{ trackId: 't1', soundId: SOUND_ID }],
    });
    expect(prisma.soundUsage.upsert).not.toHaveBeenCalled();
  });

  it('test_borrow_deletedSound_alreadyUsedByThisPost_keepsItsUsageOnRepublication', async () => {
    const prisma = buildPrisma({
      borrowable: [deletedSound],
      existingUsages: [{ soundId: SOUND_ID, postId: 'post-publie', trackId: 't1' }],
    });
    await new SoundCaptureService(prisma, soundsDir, uploadsRoot, undefined, noopWaveform).captureSounds({
      postId: 'post-publie', authorId: 'u1', feedsLibrary: true,
      tracks: [{ trackId: 't1', soundId: SOUND_ID, startMs: 0, endMs: 2000 }],
    });
    expect(prisma.soundUsage.upsert).toHaveBeenCalledTimes(1);
  });

  it('test_borrow_liveSound_stillWritesItsUsage', async () => {
    const prisma = buildPrisma({ borrowable: [{ ...deletedSound, deletedAt: null }] });
    await new SoundCaptureService(prisma, soundsDir, uploadsRoot, undefined, noopWaveform).captureSounds({
      postId: 'nouveau-post', authorId: 'u1', feedsLibrary: true,
      tracks: [{ trackId: 't1', soundId: SOUND_ID }],
    });
    expect(prisma.soundUsage.upsert).toHaveBeenCalledTimes(1);
  });

  it('test_capture_sameContentAsADeletedSound_neitherRecreatesNorRevivesIt', async () => {
    const media = await seedAudio('m1', 'meme-contenu');
    const prisma = buildPrisma({
      medias: [media],
      existingByHash: { id: SOUND_ID, deletedAt: new Date('2026-10-09T10:00:00.000Z') },
    });
    await new SoundCaptureService(prisma, soundsDir, uploadsRoot, undefined, noopWaveform).captureSounds({
      postId: 'post-source', authorId: 'u1', feedsLibrary: true,
      tracks: [{ trackId: 't1', postMediaId: 'm1' }],
    });
    expect(prisma.sound.create).not.toHaveBeenCalled();
    expect(prisma.soundUsage.upsert).not.toHaveBeenCalled();
    const revived = (prisma.sound.update.mock.calls as unknown[][])
      .some(([args]) => (args as { data?: Record<string, unknown> }).data && 'deletedAt' in ((args as { data: Record<string, unknown> }).data));
    expect(revived).toBe(false);
    expect(await fs.readdir(soundsDir).catch(() => [])).toEqual([]);
  });

  it('test_captureFromVideo_sameSoundtrackAsADeletedSound_neitherRecreatesNorRevivesIt', async () => {
    const rel = path.join('2026', '10', 'user-1', 'v1.mp4');
    await fs.mkdir(path.dirname(path.join(uploadsRoot, rel)), { recursive: true });
    await fs.writeFile(path.join(uploadsRoot, rel), 'video');
    const prisma = buildPrisma({
      medias: [{ id: 'v1', fileUrl: '/u/v1.mp4', filePath: rel, mimeType: 'video/mp4', duration: 4000, language: null }],
      existingByHash: { id: SOUND_ID, deletedAt: new Date('2026-10-09T10:00:00.000Z') },
    });
    const extractor = async (_input: string, output: string) => { await fs.writeFile(output, 'bande-son'); };
    await new SoundCaptureService(prisma, soundsDir, uploadsRoot, extractor, noopWaveform).captureSounds({
      postId: 'reel-source', authorId: 'u1', feedsLibrary: true,
      tracks: [{ trackId: 't1', postMediaId: 'v1', extractFromVideo: true }],
    });
    expect(prisma.sound.create).not.toHaveBeenCalled();
    expect(prisma.soundUsage.upsert).not.toHaveBeenCalled();
  });

  it('test_capture_sameContentAsALiveSound_stillReusesIt', async () => {
    const media = await seedAudio('m1', 'meme-contenu');
    const prisma = buildPrisma({ medias: [media], existingByHash: { id: SOUND_ID, deletedAt: null } });
    await new SoundCaptureService(prisma, soundsDir, uploadsRoot, undefined, noopWaveform).captureSounds({
      postId: 'post-source', authorId: 'u1', feedsLibrary: true,
      tracks: [{ trackId: 't1', postMediaId: 'm1' }],
    });
    expect(prisma.sound.create).not.toHaveBeenCalled();
    expect(prisma.soundUsage.upsert).toHaveBeenCalledTimes(1);
  });
});
