/**
 * @jest-environment node
 *
 * #14305 — Story et Post publiés d'un même geste, vus depuis `createPost` :
 * deux appels avec les MÊMES `mediaIds`, dans l'un ou l'autre ordre. Chaque
 * publication sort avec SA liste `media` non vide, sur des lignes distinctes,
 * et un réel coché avec un post reste un réel.
 */

import { describe, it, expect, jest } from '@jest/globals';
import { PostService } from '../../services/PostService';
import type { MediaStorage } from '../../services/storage/MediaStorage';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { PostType, PostVisibility } from '@meeshy/shared/prisma/client';
import { matchesWhere, type MongoDoc, type WhereShape } from '../../services/posts/__tests__/helpers/mongoWhereMatcher';
import { PostAudioService } from '../../services/posts/PostAudioService';

jest.mock('../../services/posts/PostAudioService', () => ({
  PostAudioService: { shared: { processPostAudio: jest.fn().mockReturnValue(Promise.resolve()) }, init: jest.fn() },
}));

const AUTHOR = '64b000000000000000000001';
const STRANGER = '64b000000000000000000002';
const THEIR_AUDIO = '64c000000000000000000009';
const THEIR_POST = '64f0000000000000000000ff';
const VIDEO = '64c000000000000000000001';
const VIDEO_URL = `/api/v1/attachments/file/2026/11/${AUTHOR}/clip.mp4`;

function world(extraMedia: readonly MongoDoc[] = []) {
  const media: MongoDoc[] = [...extraMedia.map((row) => ({ ...row })), {
    id: VIDEO, fileName: 'clip.mp4', originalName: 'clip.mp4', mimeType: 'video/mp4', fileSize: 4000,
    filePath: `2026/11/${AUTHOR}/clip.mp4`, fileUrl: VIDEO_URL, width: 1080, height: 1920,
    thumbnailUrl: null, thumbHash: null, duration: 6000, codec: 'h264', lensSlug: null,
    uploaderId: AUTHOR, postId: null, createdAt: new Date(Date.now() - 60_000),
  }];
  const posts: MongoDoc[] = [];
  let ids = 0;
  const nextId = (prefix: string) => `${prefix}${String(++ids).padStart(24 - prefix.length, '0')}`;
  const withMedia = (post: MongoDoc | undefined) =>
    post ? { ...post, media: media.filter((m) => m.postId === post.id) } : null;
  const prisma = {
    post: {
      create: jest.fn(async ({ data }: { data: MongoDoc }) => {
        const written = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
        const post = { ...written, createdAt: new Date(), id: nextId('64f') };
        posts.push(post);
        return withMedia(post);
      }),
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => withMedia(posts.find((p) => p.id === where.id))),
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async ({ where }: { where: WhereShape }) => posts.filter((p) => matchesWhere(p, where))),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: MongoDoc }) => {
        const post = posts.find((p) => p.id === where.id);
        if (post) Object.assign(post, data);
        return withMedia(post);
      }),
    },
    postMedia: {
      updateMany: jest.fn(async ({ where, data }: { where: WhereShape; data: MongoDoc }) => {
        const hit = media.filter((m) => matchesWhere(m, where));
        hit.forEach((m) => Object.assign(m, data));
        return { count: hit.length };
      }),
      findMany: jest.fn(async ({ where }: { where: WhereShape }) => media.filter((m) => matchesWhere(m, where))),
      findFirst: jest.fn(async ({ where }: { where: WhereShape }) => media.find((m) => matchesWhere(m, where)) ?? null),
      create: jest.fn(async ({ data }: { data: MongoDoc }) => {
        const row = { ...data, id: nextId('64e') };
        media.push(row);
        return { id: row.id };
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: MongoDoc }) => {
        const row = media.find((m) => m.id === where.id);
        if (row) Object.assign(row, data);
        return row ?? {};
      }),
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
    sound: { findMany: jest.fn(async () => []) },
    $transaction: jest.fn(async (arg: unknown) =>
      typeof arg === 'function' ? (arg as (tx: unknown) => Promise<unknown>)(prisma) : Promise.all(arg as Promise<unknown>[])),
  };
  let copies = 0;
  const storage = {
    duplicate: jest.fn(async (url: string) => {
      copies += 1;
      return { fileName: `copy-${copies}.mp4`, filePath: `2026/11/${AUTHOR}/copy-${copies}.mp4`, fileUrl: `${url}#copy-${copies}`, fileSize: 4000, mimeType: 'video/mp4' };
    }),
    delete: jest.fn(async () => undefined),
  };
  const service = new PostService(prisma as unknown as PrismaClient, storage as unknown as MediaStorage);
  return { service, media, posts, prisma, storage };
}

const scene = {
  v: 3,
  scenes: [{ id: 's1', objects: [{ id: 'o1', kind: 'video', payload: { postMediaId: VIDEO, mediaURL: VIDEO_URL } }] }],
};

function gesture(type: PostType) {
  return {
    type,
    visibility: type === PostType.STORY ? PostVisibility.FRIENDS : PostVisibility.PUBLIC,
    mediaIds: [VIDEO],
    storyEffects: scene as Record<string, unknown>,
  };
}

type Served = { id: string; type?: string; media: Array<{ id: string; fileUrl: string }>; storyEffects?: typeof scene };

describe('createPost — chaque publication d’un même geste possède ses médias (#14305)', () => {
  it.each([
    ['Story puis Post', PostType.STORY, PostType.POST],
    ['Post puis Story', PostType.POST, PostType.STORY],
  ])('%s : les deux listes `media` portent la vidéo, sur deux lignes distinctes', async (_label, first, second) => {
    const w = world();

    const a = (await w.service.createPost(gesture(first), AUTHOR)) as unknown as Served;
    const b = (await w.service.createPost(gesture(second), AUTHOR)) as unknown as Served;

    expect(a.media.map((m) => m.id)).toEqual([VIDEO]);
    expect(b.media).toHaveLength(1);
    expect(b.media[0].id).not.toBe(VIDEO);
    expect(b.media[0].fileUrl).not.toBe(VIDEO_URL);
    expect(b.storyEffects?.scenes[0].objects[0].payload).toEqual({ postMediaId: b.media[0].id, mediaURL: b.media[0].fileUrl });
  });

  it('Post puis Réel : le réel garde son type, qualifié par la vidéo qu’il reçoit en copie', async () => {
    const w = world();

    await w.service.createPost(gesture(PostType.POST), AUTHOR);
    const reel = (await w.service.createPost(gesture(PostType.REEL), AUTHOR)) as unknown as Served;

    expect(reel.type).toBe(PostType.REEL);
    expect(reel.media).toHaveLength(1);
  });
});

describe('createPost — la transcription d’un audio ne s’écrit que sur un média de CE post (#14308)', () => {
  const theirAudio: MongoDoc = {
    id: THEIR_AUDIO, fileName: 'voix.m4a', originalName: 'voix.m4a', mimeType: 'audio/mp4', fileSize: 900,
    filePath: `2026/11/${STRANGER}/voix.m4a`, fileUrl: `2026/11/${STRANGER}/voix.m4a`, duration: 4000,
    uploaderId: STRANGER, postId: THEIR_POST, transcription: { text: 'leur texte' },
  };
  const mobileTranscription = { text: 'texte injecté', language: 'fr', confidence: 0.9, duration_ms: 4000, segments: [] };

  it('l’id de l’audio d’autrui avec une transcription mobile n’écrase pas la sienne', async () => {
    const w = world([theirAudio]);

    await w.service.createPost({ type: PostType.POST, visibility: PostVisibility.PUBLIC, originalLanguage: 'fr', mediaIds: [THEIR_AUDIO], mobileTranscription }, AUTHOR);

    expect(w.media.find((m) => m.id === THEIR_AUDIO)?.transcription).toEqual({ text: 'leur texte' });
    expect(w.prisma.postMedia.update).not.toHaveBeenCalledWith(expect.objectContaining({ where: { id: THEIR_AUDIO } }));
  });

  it('l’id de l’audio d’autrui sans transcription ne relance pas sa transcription serveur', async () => {
    const w = world([theirAudio]);
    const processPostAudio = PostAudioService.shared.processPostAudio as jest.Mock;
    processPostAudio.mockClear();

    await w.service.createPost({ type: PostType.POST, visibility: PostVisibility.PUBLIC, originalLanguage: 'fr', mediaIds: [THEIR_AUDIO] }, AUTHOR);

    expect(processPostAudio).not.toHaveBeenCalled();
  });
});

describe('createPost — ce que le geste ne copie pas (audit #14305, second passage)', () => {
  it('Post puis Réel, la copie échoue : le réel ne reste pas un REEL sans aucun média', async () => {
    const w = world();
    await w.service.createPost(gesture(PostType.POST), AUTHOR);
    w.storage.duplicate.mockImplementation(async () => { throw new Error('ENOSPC'); });

    const reel = (await w.service.createPost(gesture(PostType.REEL), AUTHOR)) as unknown as Served;

    expect(reel.media).toHaveLength(0);
    expect(reel.type).toBe(PostType.POST);
  });

  it('la même story renvoyée (réponse perdue, file qui réessaie) ne devient pas une seconde story complète', async () => {
    const w = world();

    await w.service.createPost(gesture(PostType.STORY), AUTHOR);
    const retry = (await w.service.createPost(gesture(PostType.STORY), AUTHOR)) as unknown as Served;

    expect(retry.media).toHaveLength(0);
  });
});

const IMG = '64c000000000000000000077';
const image: MongoDoc = {
  id: IMG, fileName: 'p.jpg', originalName: 'p.jpg', mimeType: 'image/jpeg', fileSize: 900,
  filePath: `2026/11/${AUTHOR}/p.jpg`, fileUrl: `2026/11/${AUTHOR}/p.jpg`, width: 10, height: 10,
  thumbnailUrl: null, thumbHash: null, duration: null, codec: null, lensSlug: null,
  uploaderId: AUTHOR, postId: null, createdAt: new Date(Date.now() - 60_000),
};


describe('createPost — un réel DÉGRADÉ en post reste une sœur du post (audit #14305, troisième passage)', () => {
  it('Réel (une image, dégradé en POST) puis Post : le post garde son image', async () => {
    const w = world([image]);

    const reel = (await w.service.createPost({ type: PostType.REEL, visibility: PostVisibility.PUBLIC, mediaIds: [IMG] }, AUTHOR)) as unknown as Served;
    const post = (await w.service.createPost({ type: PostType.POST, visibility: PostVisibility.PUBLIC, mediaIds: [IMG] }, AUTHOR)) as unknown as Served;

    expect(reel.type).toBe(PostType.POST);
    expect(reel.media).toHaveLength(1);
    expect(post.media).toHaveLength(1);
  });
});
