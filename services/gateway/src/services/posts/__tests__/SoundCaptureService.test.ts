import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
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
    },
    $transaction: jest.fn(async (ops: unknown) =>
      Array.isArray(ops) ? Promise.all(ops as Promise<unknown>[]) : ops),
    ...overrides,
  } as unknown as import('@meeshy/shared/prisma/client').PrismaClient;
}

describe('SoundCaptureService', () => {
  let soundsDir: string;
  let uploadsRoot: string;

  beforeEach(async () => {
    process.env.SOUND_LIBRARY_ENABLED = 'true';
    soundsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sounds-'));
    uploadsRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'uploads-'));
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
    const prisma = buildPrisma();
    await new SoundCaptureService(prisma, soundsDir, uploadsRoot).captureSounds({
      postId: 'p1', authorId: 'u1', isPublic: true, tracks: [{ trackId: 't1', postMediaId: 'm1' }],
    });
    expect(prisma.soundUsage.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ postId: 'p1', trackId: { notIn: ['t1'] } }),
      }),
    );
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
