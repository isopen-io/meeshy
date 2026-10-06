/**
 * « Publier aussi en réel » (#9476) — le porteur a publié une story (photo,
 * texte, son emprunté de 238 s) qu'il voulait aussi en réel : un seul
 * `POST /posts` `type: STORY` est parti, et un PostMedia rattaché ne se réclame
 * plus. Ces témoins tiennent le geste ENTIER : le réel qualifie ou rien ne
 * part ; il reçoit ses PROPRES médias (lignes ET octets) ; un échec ne laisse
 * ni story seule ni réel seul.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import {
  publishStoryAlsoAsReel,
  prepareReelCompanion,
  reelCompanionInput,
  ReelCompanionNotQualifiedError,
  REEL_NOT_QUALIFIED,
} from '../storyReelCompanion';
import { matchesWhere, type MongoDoc, type WhereShape } from './helpers/mongoWhereMatcher';

const AUTHOR = '64b000000000000000000001';
const STRANGER = '64b000000000000000000002';
const PHOTO = '64c000000000000000000001';
const CLIP = '64c000000000000000000002';
const THEIRS = '64c000000000000000000003';
const SOUND = '64d000000000000000000001';

type Row = MongoDoc & { id: string };

function pendingMedia(overrides: Partial<Row> & { id: string }): Row {
  return {
    fileName: `${overrides.id}.bin`,
    originalName: 'source',
    mimeType: 'image/jpeg',
    fileSize: 1000,
    filePath: `2026/10/${AUTHOR}/${overrides.id}.bin`,
    fileUrl: `/api/v1/attachments/file/2026/10/${AUTHOR}/${overrides.id}.bin`,
    width: 1080,
    height: 1920,
    thumbnailUrl: null,
    thumbHash: 'hash',
    duration: null,
    codec: null,
    uploaderId: AUTHOR,
    ...overrides,
  };
}

function fakeWorld(options: {
  readonly media?: readonly Row[];
  readonly sounds?: readonly MongoDoc[];
  readonly failCreateAfter?: number;
} = {}) {
  const rows: Row[] = [...(options.media ?? [])];
  let created = 0;
  const prisma = {
    postMedia: {
      findMany: jest.fn(async ({ where }: { where: WhereShape }) => rows.filter((r) => matchesWhere(r, where))),
      create: jest.fn(async ({ data }: { data: MongoDoc }) => {
        if (options.failCreateAfter !== undefined && created >= options.failCreateAfter) {
          throw new Error('mongo down');
        }
        created += 1;
        const row = { ...data, id: `64e00000000000000000000${created}` } as Row;
        rows.push(row);
        return { id: row.id };
      }),
      deleteMany: jest.fn(async ({ where }: { where: WhereShape }) => {
        const doomed = rows.filter((r) => matchesWhere(r, where));
        doomed.forEach((d) => rows.splice(rows.indexOf(d), 1));
        return { count: doomed.length };
      }),
    },
    sound: {
      findMany: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        (options.sounds ?? []).filter((s) => where.id.in.includes(s.id as string))),
    },
  };
  const deleted: string[] = [];
  let copies = 0;
  const storage = {
    duplicate: jest.fn(async (url: string) => {
      copies += 1;
      return {
        fileName: `copy-${copies}.bin`,
        filePath: `2026/10/${AUTHOR}/copy-${copies}.bin`,
        fileUrl: `${url}#copy-${copies}`,
        fileSize: 1000,
        mimeType: 'application/octet-stream',
      };
    }),
    delete: jest.fn(async (url: string) => { deleted.push(url); }),
  };
  return { prisma, storage, rows, deleted };
}

const borrowedSoundEffects = {
  audioPlayerObjects: [{ id: 'a1', soundId: SOUND, duration: 238 }],
  mediaObjects: [{ id: 'm1', postMediaId: PHOTO, kind: 'image' }],
};

const publicSound = { id: SOUND, durationMs: 238_000, isPublic: true, uploaderId: STRANGER, mutedAt: null };

function storyInput(overrides: Record<string, unknown> = {}) {
  return {
    type: 'STORY',
    visibility: 'FRIENDS',
    content: 'Le marché ce matin',
    mediaIds: [PHOTO],
    storyEffects: borrowedSoundEffects as Record<string, unknown>,
    ...overrides,
  };
}

describe('prepareReelCompanion — le réel est jugé AVANT toute écriture', () => {
  it('le cas du porteur (photo + son emprunté de 238 s) qualifie et reçoit une COPIE de la photo', async () => {
    const world = fakeWorld({ media: [pendingMedia({ id: PHOTO })], sounds: [publicSound] });

    const copies = await prepareReelCompanion({
      prisma: world.prisma, storage: world.storage, authorId: AUTHOR,
      mediaIds: [PHOTO], storyEffects: borrowedSoundEffects,
    });

    const copyId = copies.idMap[PHOTO];
    expect(copyId).toBeDefined();
    expect(copyId).not.toBe(PHOTO);
    const copy = world.rows.find((r) => r.id === copyId);
    expect(copy?.uploaderId).toBe(AUTHOR);
    expect(copy?.postId).toBeUndefined();
    expect(copy?.fileUrl).not.toBe(world.rows.find((r) => r.id === PHOTO)?.fileUrl);
    expect(copy?.mimeType).toBe('image/jpeg');
  });

  it('une photo SEULE, sans son, ne qualifie pas : refus nommé, rien d’écrit', async () => {
    const world = fakeWorld({ media: [pendingMedia({ id: PHOTO })] });

    const attempt = prepareReelCompanion({
      prisma: world.prisma, storage: world.storage, authorId: AUTHOR,
      mediaIds: [PHOTO], storyEffects: { mediaObjects: [{ id: 'm1', postMediaId: PHOTO }] },
    });

    await expect(attempt).rejects.toBeInstanceOf(ReelCompanionNotQualifiedError);
    await expect(attempt).rejects.toMatchObject({ code: REEL_NOT_QUALIFIED });
    expect(world.storage.duplicate).not.toHaveBeenCalled();
    expect(world.prisma.postMedia.create).not.toHaveBeenCalled();
  });

  it('un son coupé ne qualifie pas plus un réel qu’il ne se laisse emprunter', async () => {
    const world = fakeWorld({
      media: [pendingMedia({ id: PHOTO })],
      sounds: [{ ...publicSound, mutedAt: new Date('2026-10-01') }],
    });

    await expect(prepareReelCompanion({
      prisma: world.prisma, storage: world.storage, authorId: AUTHOR,
      mediaIds: [PHOTO], storyEffects: borrowedSoundEffects,
    })).rejects.toBeInstanceOf(ReelCompanionNotQualifiedError);
  });

  it('le média d’AUTRUI ne compte pas et n’est jamais copié', async () => {
    const world = fakeWorld({
      media: [
        pendingMedia({ id: CLIP, mimeType: 'video/mp4', duration: 12_000, uploaderId: STRANGER }),
        pendingMedia({ id: PHOTO }),
      ],
    });

    await expect(prepareReelCompanion({
      prisma: world.prisma, storage: world.storage, authorId: AUTHOR,
      mediaIds: [CLIP, PHOTO], storyEffects: undefined,
    })).rejects.toBeInstanceOf(ReelCompanionNotQualifiedError);
    expect(world.storage.duplicate).not.toHaveBeenCalled();
  });

  it('copie aussi la vignette d’une vidéo, sous ses propres octets', async () => {
    const world = fakeWorld({
      media: [pendingMedia({ id: CLIP, mimeType: 'video/mp4', duration: 12_000, thumbnailUrl: '/thumb.jpg' })],
    });

    const copies = await prepareReelCompanion({
      prisma: world.prisma, storage: world.storage, authorId: AUTHOR,
      mediaIds: [CLIP], storyEffects: undefined,
    });

    const copy = world.rows.find((r) => r.id === copies.idMap[CLIP]);
    expect(copy?.thumbnailUrl).toBe('/thumb.jpg#copy-2');
    expect(copy?.duration).toBe(12_000);
  });

  it('une copie qui échoue à mi-chemin défait ce qu’elle a écrit, octets compris', async () => {
    const world = fakeWorld({
      media: [
        pendingMedia({ id: CLIP, mimeType: 'video/mp4', duration: 12_000 }),
        pendingMedia({ id: PHOTO }),
      ],
      failCreateAfter: 1,
    });

    await expect(prepareReelCompanion({
      prisma: world.prisma, storage: world.storage, authorId: AUTHOR,
      mediaIds: [CLIP, PHOTO], storyEffects: undefined,
    })).rejects.toThrow('mongo down');

    expect(world.rows.map((r) => r.id).sort()).toEqual([CLIP, PHOTO].sort());
    expect(world.deleted).toHaveLength(2);
  });
});

describe('reelCompanionInput — le réel publie la story réécrite sur SES copies', () => {
  it('réécrit les ids, les cartes de texte et la scène ; ne garde rien que la carte ignore', () => {
    const idMap = { [PHOTO]: 'copy-photo' };
    const reel = reelCompanionInput({
      type: 'STORY',
      mediaIds: [PHOTO, THEIRS],
      mediaAlt: { [PHOTO]: 'Étals de mangues', [THEIRS]: 'volé' },
      mediaCaption: { [PHOTO]: 'Marché de Sandaga' },
      storyEffects: borrowedSoundEffects,
    }, idMap);

    expect(reel.type).toBe('REEL');
    expect(reel.mediaIds).toEqual(['copy-photo']);
    expect(reel.mediaAlt).toEqual({ 'copy-photo': 'Étals de mangues' });
    expect(reel.mediaCaption).toEqual({ 'copy-photo': 'Marché de Sandaga' });
    expect(JSON.stringify(reel.storyEffects)).toContain('copy-photo');
    expect(JSON.stringify(reel.storyEffects)).not.toContain(PHOTO);
    expect(JSON.stringify(reel.storyEffects)).toContain(SOUND);
  });
});

describe('publishStoryAlsoAsReel — deux publications, ou aucune', () => {
  function harness(world: ReturnType<typeof fakeWorld>, failOn?: 'STORY' | 'REEL', degrade = false) {
    const published: Array<{ id: string; type: string; mediaIds?: string[] }> = [];
    const retracted: string[] = [];
    const createPost = jest.fn(async (input: { type: string; mediaIds?: string[] }) => {
      if (input.type === failOn) throw new Error(`${failOn} failed`);
      const type = degrade && input.type === 'REEL' ? 'POST' : input.type;
      const post = { id: `post-${published.length + 1}`, type, mediaIds: input.mediaIds };
      published.push(post);
      return post;
    });
    const retractPost = jest.fn(async (id: string) => { retracted.push(id); });
    return {
      published, retracted, createPost,
      run: () => publishStoryAlsoAsReel(
        { prisma: world.prisma, storage: world.storage, createPost, retractPost },
        storyInput(),
        AUTHOR,
      ),
    };
  }

  it('publie la story avec SES médias puis le réel avec les COPIES — jamais le même PostMedia', async () => {
    const world = fakeWorld({ media: [pendingMedia({ id: PHOTO })], sounds: [publicSound] });
    const h = harness(world);

    const { story, reel } = await h.run();

    expect(story.type).toBe('STORY');
    expect(reel.type).toBe('REEL');
    expect(h.published[0].mediaIds).toEqual([PHOTO]);
    expect(h.published[1].mediaIds).toHaveLength(1);
    expect(h.published[1].mediaIds?.[0]).not.toBe(PHOTO);
    expect(h.retracted).toEqual([]);
  });

  it('un réel non qualifiant refuse le geste entier : ni story ni réel', async () => {
    const world = fakeWorld({ media: [pendingMedia({ id: PHOTO })] });
    const h = harness(world);

    await expect(h.run()).rejects.toBeInstanceOf(ReelCompanionNotQualifiedError);
    expect(h.createPost).not.toHaveBeenCalled();
  });

  it('une story qui échoue ne laisse aucune copie derrière elle', async () => {
    const world = fakeWorld({ media: [pendingMedia({ id: PHOTO })], sounds: [publicSound] });
    const h = harness(world, 'STORY');

    await expect(h.run()).rejects.toThrow('STORY failed');
    expect(world.rows.map((r) => r.id)).toEqual([PHOTO]);
  });

  it('un réel qui échoue RETIRE la story déjà publiée — l’auteur a demandé les deux', async () => {
    const world = fakeWorld({ media: [pendingMedia({ id: PHOTO })], sounds: [publicSound] });
    const h = harness(world, 'REEL');

    await expect(h.run()).rejects.toThrow('REEL failed');
    expect(h.retracted).toEqual(['post-1']);
    expect(world.rows.map((r) => r.id)).toEqual([PHOTO]);
  });

  it('un réel que le serveur aurait DÉGRADÉ en post est retiré avec la story, et le refus est nommé', async () => {
    const world = fakeWorld({ media: [pendingMedia({ id: PHOTO })], sounds: [publicSound] });
    const h = harness(world, undefined, true);

    await expect(h.run()).rejects.toBeInstanceOf(ReelCompanionNotQualifiedError);
    expect(h.retracted.sort()).toEqual(['post-1', 'post-2']);
  });
});
