/**
 * Audit adversarial de b8356fbee0 (#14305) — une copie de média ne sert QUE le
 * geste qui publie Story, Post et Réel ensemble.
 *
 * Une publication sœur n'est pas « n'importe quelle publication vivante de
 * l'auteur » : c'est une publication ORIGINALE (jamais un repost, dont les
 * copies portent l'auteur du repost comme uploadeur), visible (ni retirée par
 * la modération, ni expirée), et créée il y a moins de `GESTURE_WINDOW_MS`.
 * Une copie coûte ce qu'un téléversement coûte (quota journalier), un id
 * répété ne se copie qu'une fois, une pièce en cours de rendu naît `pending`
 * pour que le balayage la rende, et ses variantes suivent ses octets.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { PostType } from '@meeshy/shared/prisma/client';
import { claimPublicationMedia, GESTURE_WINDOW_MS, publishableMedia } from '../siblingPublicationMedia';
import { createUploadQuota } from '../../attachments/upload-quota';
import { reservedCopy } from '../publicationCopyQuota';
import { matchesWhere, type MongoDoc, type WhereShape } from './helpers/mongoWhereMatcher';

const A = '64b000000000000000000001';
const B = '64b000000000000000000002';
const X = '64c000000000000000000001';
const SIBLING = '64f000000000000000000001';
const POST = '64f000000000000000000002';
const KEY = `2026/11/${A}/clip.mp4`;
const THUMB_KEY = `2026/11/${A}/clip_thumb.jpg`;

type Row = MongoDoc & { id: string };

const justNow = () => new Date(Date.now() - 1_000);

function media(overrides: Partial<Row> = {}): Row {
  return {
    id: X,
    fileName: 'clip.mp4',
    originalName: 'clip.mp4',
    mimeType: 'video/mp4',
    fileSize: 4_000,
    filePath: KEY,
    fileUrl: KEY,
    width: 1080,
    height: 1920,
    thumbnailUrl: THUMB_KEY,
    thumbHash: 'hash',
    duration: 6000,
    codec: 'h264',
    lensSlug: null,
    uploaderId: A,
    postId: SIBLING,
    createdAt: new Date(Date.now() - 3_600_000),
    ...overrides,
  };
}

function sibling(overrides: MongoDoc = {}): MongoDoc {
  return { id: SIBLING, authorId: A, createdAt: justNow(), ...overrides };
}

type Verdict = { allowed: true } | { allowed: false; usedBytes: number; quotaBytes: number; retryAfterSeconds: number };

const tick = () => new Promise((resolve) => setImmediate(resolve));

function world(options: { media?: readonly Row[]; posts?: readonly MongoDoc[]; quota?: Verdict; failDuplicateAt?: number } = {}) {
  const rows: Row[] = (options.media ?? [media()]).map((row) => ({ ...row }));
  const posts: MongoDoc[] = (options.posts ?? [sibling(), { id: POST, authorId: A, createdAt: new Date() }]).map((p) => ({ ...p }));
  let created = 0;
  const prisma = {
    postMedia: {
      updateMany: jest.fn(async ({ where, data }: { where: WhereShape; data: MongoDoc }) => {
        const hit = rows.filter((r) => matchesWhere(r, where));
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      }),
      findMany: jest.fn(async ({ where }: { where: WhereShape }) => rows.filter((r) => matchesWhere(r, where))),
      create: jest.fn(async ({ data }: { data: MongoDoc }) => {
        created += 1;
        await tick();
        const row = { ...data, id: `64e0000000000000000000${String(created).padStart(2, '0')}`, createdAt: new Date() } as Row;
        rows.push(row);
        return { id: row.id };
      }),
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
    post: {
      findMany: jest.fn(async ({ where }: { where: WhereShape }) => posts.filter((p) => matchesWhere(p, where))),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: MongoDoc }) => {
        const post = posts.find((p) => p.id === where.id);
        if (post) Object.assign(post, data);
        return post;
      }),
    },
  };
  let copies = 0;
  const storage = {
    duplicate: jest.fn(async (_url: string) => {
      await tick();
      if (options.failDuplicateAt === copies + 1) throw new Error('ENOSPC');
      copies += 1;
      return { fileName: `snapshot_${copies}`, filePath: `snapshots/snapshot_${copies}`, fileUrl: `snapshots/snapshot_${copies}`, fileSize: 1_000 + copies, mimeType: 'application/octet-stream' };
    }),
    delete: jest.fn(async () => undefined),
  };
  const quota = {
    reserve: jest.fn(async (_params: { userId: string; role: 'registered' | 'anonymous'; bytes: number; now?: number }) => options.quota ?? ({ allowed: true } as Verdict)),
    release: jest.fn(async (_params: { userId: string; bytes: number; now?: number }) => undefined),
    record: jest.fn(async (_params: { userId: string; bytes: number; now?: number }) => undefined),
  };
  return { prisma, storage, quota, rows, posts };
}

type World = ReturnType<typeof world>;

function claim(w: World, input: Record<string, unknown> & { mediaIds?: string[] }, authorId = A, post: { id: string; type?: PostType } = { id: POST }) {
  return claimPublicationMedia({
    prisma: w.prisma as never,
    storage: w.storage,
    quota: w.quota,
    authorId,
    post: { ...post, storyEffects: input.storyEffects },
    input,
  });
}

const copiesOf = (w: World) => w.rows.filter((r) => r.postId === POST && r.id !== X);

describe('une copie ne sert que le geste — témoins de l’auditeur', () => {
  it('AMPLIFICATION : le même id répété 200 fois ne produit qu’UNE copie', async () => {
    const w = world();

    const served = await claim(w, { mediaIds: Array(200).fill(X) });

    expect(copiesOf(w)).toHaveLength(1);
    expect(w.storage.duplicate).toHaveBeenCalledTimes(2);
    expect(served.mediaIds).toEqual([copiesOf(w)[0].id]);
  });

  it('MODÉRATION : le média d’une publication retirée par la modération ne se copie pas', async () => {
    const w = world({ posts: [sibling({ visibility: 'PRIVATE', moderationHiddenAt: new Date() }), { id: POST, authorId: A }] });

    await claim(w, { mediaIds: [X] });

    expect(w.storage.duplicate).not.toHaveBeenCalled();
  });

  it('REPOST : la copie qu’un repost a faite pour B ne devient pas un post ORIGINAL de B', async () => {
    const w = world({
      media: [media({ uploaderId: B })],
      posts: [sibling({ authorId: B, repostOfId: '64f0000000000000000000aa', snapshotAuthorId: A }), { id: POST, authorId: B }],
    });

    const served = await claim(w, { mediaIds: [X] }, B);

    expect(w.storage.duplicate).not.toHaveBeenCalled();
    expect(served.mediaIds).toEqual([X]);
  });
});

describe('une publication sœur est une publication ORIGINALE, visible, du même geste', () => {
  it('un repost DÉTACHÉ de sa source (repostOfId remis à null, instantané gardé) ne se copie pas', async () => {
    const w = world({
      media: [media({ uploaderId: B })],
      posts: [sibling({ authorId: B, repostOfId: null, originalRepostOfId: null, snapshotAuthorId: A })],
    });

    await claim(w, { mediaIds: [X] }, B);

    expect(w.storage.duplicate).not.toHaveBeenCalled();
  });

  it('une story EXPIRÉE, pas encore purgée, ne prête plus ses médias', async () => {
    const w = world({ posts: [sibling({ type: 'STORY', expiresAt: new Date(Date.now() - 60_000) })] });

    await claim(w, { mediaIds: [X] });

    expect(w.storage.duplicate).not.toHaveBeenCalled();
  });

  it('une story encore vivante prête ses médias', async () => {
    const w = world({ posts: [sibling({ type: 'STORY', expiresAt: new Date(Date.now() + 21 * 3_600_000) })] });

    await claim(w, { mediaIds: [X] });

    expect(copiesOf(w)).toHaveLength(1);
  });

  it('une publication créée hors de la fenêtre du geste ne prête plus ses médias', async () => {
    const w = world({ posts: [sibling({ createdAt: new Date(Date.now() - GESTURE_WINDOW_MS - 1_000) })] });

    const served = await claim(w, { mediaIds: [X] });

    expect(w.storage.duplicate).not.toHaveBeenCalled();
    expect(served.mediaIds).toEqual([X]);
  });

  it('la fenêtre couvre les nouvelles tentatives d’une file d’envoi (dix minutes après la sœur)', async () => {
    const w = world({ posts: [sibling({ createdAt: new Date(Date.now() - 10 * 60_000) })] });

    await claim(w, { mediaIds: [X] });

    expect(copiesOf(w)).toHaveLength(1);
  });

  it('un repost qui ne porte que sa RACINE (originalRepostOfId) ne se copie pas', async () => {
    const w = world({ media: [media({ uploaderId: B })], posts: [sibling({ authorId: B, originalRepostOfId: '64f0000000000000000000aa' })] });

    await claim(w, { mediaIds: [X] }, B);

    expect(w.storage.duplicate).not.toHaveBeenCalled();
  });

  it('une reprise de la MÊME publication (même type) n’est pas une sœur : elle ne reçoit pas de copie', async () => {
    const w = world({ posts: [sibling({ type: 'STORY', expiresAt: new Date(Date.now() + 3_600_000) })] });

    const served = await claim(w, { mediaIds: [X] }, A, { id: POST, type: PostType.STORY });

    expect(w.storage.duplicate).not.toHaveBeenCalled();
    expect(served.mediaIds).toEqual([X]);
  });

  it('une publication d’un AUTRE format du geste reçoit sa copie', async () => {
    const w = world({ posts: [sibling({ type: 'STORY', expiresAt: new Date(Date.now() + 3_600_000) })] });

    await claim(w, { mediaIds: [X] }, A, { id: POST, type: PostType.POST });

    expect(copiesOf(w)).toHaveLength(1);
  });

  it('une COPIE ne prête pas à son tour : la fenêtre du geste ne se prolonge pas de copie en copie', async () => {
    const later = '64f100000000000000000001';
    const last = '64f100000000000000000002';
    const w = world({ posts: [sibling(), { id: later, authorId: A, createdAt: new Date(Date.now() - 500) }, { id: last, authorId: A, createdAt: new Date() }] });

    const first = await claim(w, { mediaIds: [X] }, A, { id: later });
    const copyId = (first.mediaIds ?? [])[0];
    expect(copyId).not.toBe(X);

    const viaCopy = await claim(w, { mediaIds: [copyId] }, A, { id: last });

    expect(viaCopy.mediaIds).toEqual([copyId]);
    expect(w.rows.filter((r) => r.postId === last)).toHaveLength(0);
  });

  it('publishableMedia ne compte ni un repost ni un id répété', async () => {
    const repost = world({ media: [media({ uploaderId: B })], posts: [sibling({ authorId: B, repostOfId: '64f0000000000000000000aa' })] });
    expect(await publishableMedia(repost.prisma as never, [X], B)).toEqual([]);

    const repeated = world();
    expect(await publishableMedia(repeated.prisma as never, [X, X, X], A)).toEqual([{ id: X, mimeType: 'video/mp4', duration: 6000 }]);
  });
});

describe('une copie coûte ce qu’un téléversement coûte', () => {
  it('les octets attendus sont RÉSERVÉS avant la copie, et l’écart (la vignette) est débité ensuite', async () => {
    const w = world({ media: [media({ fileSize: 1_000 })] });

    await claim(w, { mediaIds: [X] });

    expect(w.quota.reserve).toHaveBeenCalledWith({ userId: A, role: 'registered', bytes: 1_000, now: expect.any(Number) });
    expect(w.quota.record).toHaveBeenCalledWith({ userId: A, bytes: 1_001 + 1_002 - 1_000, now: expect.any(Number) });
    expect(w.quota.release).not.toHaveBeenCalled();
  });

  it('une copie plus légère que réservé rend la différence', async () => {
    const w = world({ media: [media({ thumbnailUrl: null, fileSize: 9_000 })] });

    await claim(w, { mediaIds: [X] });

    expect(w.quota.release).toHaveBeenCalledWith({ userId: A, bytes: 9_000 - 1_001, now: expect.any(Number) });
  });

  it('les variantes déclarées comptent dans la réservation', async () => {
    const w = world({ media: [media({ imageVariants: [{ width: 1, height: 1, url: 'v.webp', size: 50, format: 'webp' }], renditions: [{ codec: 'h264', url: 'r.mp4', width: 1, height: 1, size: 700 }] })] });

    await claim(w, { mediaIds: [X] });

    expect(w.quota.reserve).toHaveBeenCalledWith(expect.objectContaining({ bytes: 4_000 + 50 + 700 }));
  });

  it('un quota épuisé ne copie rien : la publication part sans ce média, comme avant', async () => {
    const w = world({ quota: { allowed: false, usedBytes: 1, quotaBytes: 1, retryAfterSeconds: 60 } });

    const served = await claim(w, { mediaIds: [X] });

    expect(w.storage.duplicate).not.toHaveBeenCalled();
    expect(w.quota.record).not.toHaveBeenCalled();
    expect(served.mediaIds).toEqual([X]);
  });

  it('une copie qui échoue rend toute sa réservation', async () => {
    const w = world({ failDuplicateAt: 2 });

    await claim(w, { mediaIds: [X] });

    expect(w.quota.release).toHaveBeenCalledWith({ userId: A, bytes: 4_000, now: expect.any(Number) });
    expect(w.quota.record).not.toHaveBeenCalled();
  });

  it('dix requêtes CONCURRENTES ne copient pas plus que dix requêtes en série (quota réel, Redis asynchrone)', async () => {
    const store = new Map<string, number>();
    const redis = {
      get: async (key: string) => { await tick(); return store.has(key) ? String(store.get(key)) : null; },
      incrby: async (key: string, n: number) => { await tick(); const v = (store.get(key) ?? 0) + n; store.set(key, v); return v; },
      expire: async () => { await tick(); return 1; },
    };
    const posts = Array.from({ length: 10 }, (_, i) => ({ id: `64f1000000000000000000${String(i).padStart(2, '0')}`, authorId: A, createdAt: new Date() }));
    const quota = createUploadQuota({ redis, quotas: { registered: 2_500, anonymous: 1 } });
    const big = world({ media: [media({ thumbnailUrl: null, fileSize: 1_000 })], posts: [sibling(), ...posts] });
    big.storage.duplicate.mockImplementation(async () => ({ fileName: 's', filePath: 'snapshots/s', fileUrl: 'snapshots/s', fileSize: 1_000, mimeType: 'video/mp4' }));

    await Promise.all(posts.map((post) => claimPublicationMedia({
      prisma: big.prisma as never, storage: big.storage, quota, authorId: A, post: { id: post.id }, input: { mediaIds: [X] },
    })));

    expect(big.rows.filter((r) => r.id !== X)).toHaveLength(2);
    expect([...store.values()][0]).toBe(2_000);
  });
});

describe('les dérivés suivent les octets copiés', () => {
  it('une source en cours de rendu donne une copie `pending`, sans dérivé, que le balayage rendra', async () => {
    const w = world({ media: [media({ processingState: 'pending', thumbnailUrl: null, thumbHash: null })] });

    await claim(w, { mediaIds: [X] });

    const [copy] = copiesOf(w);
    expect(copy.processingState).toBe('pending');
    expect(copy.thumbnailUrl).toBeUndefined();
    expect(w.storage.duplicate).toHaveBeenCalledTimes(1);
  });

  it('une source en cours de rendu dont la vignette existe déjà ne la prête pas : le balayage la refera sur la copie', async () => {
    const w = world({ media: [media({ processingState: 'pending' })] });

    await claim(w, { mediaIds: [X] });

    const [copy] = copiesOf(w);
    expect(copy.processingState).toBe('pending');
    expect(copy.thumbnailUrl).toBeUndefined();
    expect(w.storage.duplicate).toHaveBeenCalledWith(KEY);
    expect(w.storage.duplicate).not.toHaveBeenCalledWith(THUMB_KEY);
  });

  it('une source rendue prête ses variantes, ses rendus et son codec — chacun sur ses propres octets', async () => {
    const w = world({
      media: [media({
        processingState: 'ready',
        videoCodec: 'hevc',
        imageVariants: [{ width: 320, height: 568, url: `2026/11/${A}/clip_320.webp`, size: 10, format: 'webp' }],
        avifVariants: [{ width: 320, height: 568, url: `2026/11/${A}/clip_320.avif`, size: 9, format: 'avif' }],
        renditions: [{ codec: 'h264', url: `2026/11/${A}/clip_h264.mp4`, width: 1080, height: 1920, size: 3_000 }],
      })],
    });

    await claim(w, { mediaIds: [X] });

    const [copy] = copiesOf(w);
    expect(copy.processingState).toBe('ready');
    expect(copy.videoCodec).toBe('hevc');
    const urls = (value: unknown) => (value as Array<{ url: string }>).map((entry) => entry.url);
    for (const column of ['imageVariants', 'avifVariants', 'renditions'] as const) {
      expect(urls(copy[column])).toHaveLength(1);
      expect(urls(copy[column])[0]).toMatch(/^snapshots\//);
    }
    expect(copy.renditions).toEqual([expect.objectContaining({ codec: 'h264', width: 1080, height: 1920 })]);
    expect(w.storage.duplicate).toHaveBeenCalledTimes(5);
  });
});

describe('la scène de la copie désigne la copie', () => {
  it('un fond désigné par son seul id reçoit l’adresse de sa copie', async () => {
    const effects = { mediaObjects: [{ id: 'bg', isBackground: true, postMediaId: X }] };
    const w = world();

    const served = await claim(w, { mediaIds: [X], storyEffects: effects });

    const [copy] = copiesOf(w);
    const stored = w.posts.find((p) => p.id === POST)?.storyEffects as typeof effects & { mediaObjects: Array<{ mediaURL?: string }> };
    expect(stored.mediaObjects[0]).toEqual({ id: 'bg', isBackground: true, postMediaId: copy.id, mediaURL: copy.fileUrl });
    expect((served.storyEffects as typeof stored).mediaObjects[0].mediaURL).toBe(copy.fileUrl);
  });

  it.each([
    ['la clé de stockage (forme que les clients envoient)', KEY],
    ['l’adresse d’API', `/api/v1/attachments/file/${KEY}`],
    ['l’adresse absolue', `https://gate.meeshy.me/api/v1/attachments/file/${KEY}`],
  ])('une scène qui désigne le média par %s est réécrite sur la copie', async (_label, mediaURL) => {
    const effects = { v: 3, scenes: [{ id: 's1', objects: [{ id: 'o1', kind: 'video', payload: { postMediaId: X, mediaURL } }] }] };
    const w = world();

    await claim(w, { mediaIds: [X], storyEffects: effects });

    const [copy] = copiesOf(w);
    const stored = w.posts.find((p) => p.id === POST)?.storyEffects as typeof effects;
    expect(stored.scenes[0].objects[0].payload).toEqual({ postMediaId: copy.id, mediaURL: copy.fileUrl });
  });
});

describe('la réservation se règle sur le jour où elle a été prise', () => {
  it('une copie qui franchit minuit UTC ne crédite pas le jour suivant', async () => {
    const store = new Map<string, number>();
    const redis = {
      get: async (k: string) => (store.has(k) ? String(store.get(k)) : null),
      incrby: async (k: string, n: number) => { const v = (store.get(k) ?? 0) + n; store.set(k, v); return v; },
      expire: async () => 1,
    };
    const quota = createUploadQuota({ redis, quotas: { registered: 1_000_000, anonymous: 1 } });
    const beforeMidnight = Date.UTC(2026, 10, 1, 23, 59, 59, 900);
    const spy = jest.spyOn(Date, 'now').mockReturnValue(beforeMidnight);

    await reservedCopy({ quota, userId: 'u', expectedBytes: 5_000, copy: async () => { spy.mockReturnValue(beforeMidnight + 1_000); return { bytes: 1_000 }; } });
    spy.mockRestore();

    expect(Object.fromEntries(store)).toEqual({ 'uploads:bytes:u:2026-11-01': 1_000 });
  });
});
