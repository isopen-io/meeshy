/**
 * Un geste, plusieurs publications (#14305) — Story et Post cochés ensemble
 * partent en DEUX `POST /posts` portant les MÊMES `mediaIds` (Android #13919,
 * iOS #13920). Un `PostMedia` n'a qu'un propriétaire : la publication arrivée
 * la seconde trouvait le média déjà pris, sa liste `media` restait vide, et sa
 * scène désignait le fichier de l'autre — détruit à l'expiration de la story.
 *
 * Ces témoins tiennent la règle : la seconde publication reçoit sa PROPRE
 * copie (ligne ET octets), sa scène est réécrite sur elle, et la première
 * garde la sienne. Rien ne se copie hors des publications vivantes de
 * l'auteur lui-même.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { claimPublicationMedia, publishableMedia } from '../siblingPublicationMedia';
import { matchesWhere, type MongoDoc, type WhereShape } from './helpers/mongoWhereMatcher';

const AUTHOR = '64b000000000000000000001';
const STRANGER = '64b000000000000000000002';
const VIDEO = '64c000000000000000000001';
const PHOTO = '64c000000000000000000002';
const STORY = '64f000000000000000000001';
const POST = '64f000000000000000000002';
const THEIR_POST = '64f000000000000000000003';
const COMMENT = '64f000000000000000000009';

type Row = MongoDoc & { id: string };

function media(overrides: Partial<Row> & { id: string }): Row {
  return {
    fileName: `${overrides.id}.mp4`,
    originalName: 'clip.mp4',
    mimeType: 'video/mp4',
    fileSize: 4000,
    filePath: `2026/11/${AUTHOR}/${overrides.id}.mp4`,
    fileUrl: `/api/v1/attachments/file/2026/11/${AUTHOR}/${overrides.id}.mp4`,
    width: 1080,
    height: 1920,
    thumbnailUrl: `/api/v1/attachments/file/2026/11/${AUTHOR}/${overrides.id}_thumb.jpg`,
    thumbHash: 'hash',
    duration: 6000,
    codec: 'h264',
    uploaderId: AUTHOR,
    postId: null,
    ...overrides,
  };
}

function world(options: {
  readonly media: readonly Row[];
  readonly posts?: readonly MongoDoc[];
  readonly failDuplicate?: boolean;
}) {
  const rows: Row[] = options.media.map((row) => ({ ...row }));
  const posts: MongoDoc[] = (options.posts ?? [
    { id: STORY, authorId: AUTHOR },
    { id: POST, authorId: AUTHOR },
  ]).map((post) => ({ ...post }));
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
    post: {
      findMany: jest.fn(async ({ where }: { where: WhereShape }) => posts.filter((p) => matchesWhere(p, where))),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: MongoDoc }) => {
        const post = posts.find((p) => p.id === where.id);
        if (post) Object.assign(post, data);
        return post;
      }),
    },
  };
  const deleted: string[] = [];
  let copies = 0;
  const storage = {
    duplicate: jest.fn(async (url: string) => {
      if (options.failDuplicate && copies === 1) throw new Error('disk full');
      copies += 1;
      return {
        fileName: `copy-${copies}.bin`,
        filePath: `2026/11/${AUTHOR}/copy-${copies}.bin`,
        fileUrl: `${url}#copy-${copies}`,
        fileSize: 4000,
        mimeType: 'application/octet-stream',
      };
    }),
    delete: jest.fn(async (url: string) => { deleted.push(url); }),
  };
  return { prisma, storage, rows, posts, deleted };
}

function sceneOn(mediaId: string, mediaURL: string) {
  return {
    v: 3,
    scenes: [{
      id: 's1',
      objects: [
        { id: 'o1', kind: 'video', payload: { postMediaId: mediaId, mediaURL } },
        { id: 'o2', kind: 'sticker', payload: { emoji: '🔥' } },
      ],
    }],
  };
}

const videoUrl = media({ id: VIDEO }).fileUrl as string;

function postInput(overrides: Record<string, unknown> = {}) {
  return {
    mediaIds: [VIDEO],
    mediaAlt: { [VIDEO]: 'Le marché ce matin' },
    mediaCaption: { [VIDEO]: 'Marché' },
    storyEffects: sceneOn(VIDEO, videoUrl) as Record<string, unknown>,
    ...overrides,
  };
}

async function publishPost(w: ReturnType<typeof world>, input = postInput()) {
  return claimPublicationMedia({
    prisma: w.prisma,
    storage: w.storage,
    authorId: AUTHOR,
    post: { id: POST, storyEffects: input.storyEffects },
    input,
  });
}

describe('claimPublicationMedia — la publication arrivée la seconde possède ses médias', () => {
  it('Story puis Post du même geste : le post reçoit sa propre copie, la story garde la sienne', async () => {
    const w = world({ media: [media({ id: VIDEO, postId: STORY })] });

    const served = await publishPost(w);

    const own = w.rows.filter((r) => r.postId === POST);
    expect(own).toHaveLength(1);
    expect(own[0].id).not.toBe(VIDEO);
    expect(own[0].uploaderId).toBe(AUTHOR);
    expect(own[0].mimeType).toBe('video/mp4');
    expect(own[0].duration).toBe(6000);
    expect(own[0].fileUrl).not.toBe(videoUrl);
    expect(w.rows.find((r) => r.id === VIDEO)?.postId).toBe(STORY);
    expect(served.mediaIds).toEqual([own[0].id]);
    expect(served.mediaAlt).toEqual({ [own[0].id]: 'Le marché ce matin' });
    expect(served.mediaCaption).toEqual({ [own[0].id]: 'Marché' });
  });

  it('la scène ENREGISTRÉE du post désigne sa copie — id et adresse — et plus le fichier de la story', async () => {
    const w = world({ media: [media({ id: VIDEO, postId: STORY })] });

    const served = await publishPost(w);

    const copy = w.rows.find((r) => r.postId === POST)!;
    const stored = w.posts.find((p) => p.id === POST)?.storyEffects as ReturnType<typeof sceneOn>;
    expect(stored.scenes[0].objects[0].payload).toEqual({ postMediaId: copy.id, mediaURL: copy.fileUrl });
    expect(stored.scenes[0].objects[1].payload).toEqual({ emoji: '🔥' });
    expect((served.storyEffects as ReturnType<typeof sceneOn>).scenes[0].objects[0].payload.postMediaId).toBe(copy.id);
  });

  it('la vignette est copiée aussi : expirer la story ne laisse rien au post qui pointe ses octets', async () => {
    const w = world({ media: [media({ id: VIDEO, postId: STORY })] });

    await publishPost(w);

    const source = w.rows.find((r) => r.id === VIDEO)!;
    const copy = w.rows.find((r) => r.postId === POST)!;
    expect(copy.thumbnailUrl).toBeDefined();
    expect(copy.thumbnailUrl).not.toBe(source.thumbnailUrl);
    expect(w.storage.duplicate).toHaveBeenCalledWith(source.fileUrl);
    expect(w.storage.duplicate).toHaveBeenCalledWith(source.thumbnailUrl);
  });

  it('un média encore libre se réclame comme avant : aucune copie, aucune réécriture', async () => {
    const w = world({ media: [media({ id: VIDEO })] });

    const served = await publishPost(w);

    expect(w.rows.find((r) => r.id === VIDEO)?.postId).toBe(POST);
    expect(w.rows).toHaveLength(1);
    expect(w.storage.duplicate).not.toHaveBeenCalled();
    expect(w.prisma.post.update).not.toHaveBeenCalled();
    expect(served.mediaIds).toEqual([VIDEO]);
  });

  it('un geste mixte : le libre est réclamé, le pris est copié, l’ordre de sélection est gardé', async () => {
    const w = world({ media: [media({ id: VIDEO, postId: STORY }), media({ id: PHOTO, mimeType: 'image/jpeg' })] });

    const served = await publishPost(w, postInput({ mediaIds: [VIDEO, PHOTO] }));

    const copy = w.rows.find((r) => r.postId === POST && r.id !== PHOTO)!;
    expect(served.mediaIds).toEqual([copy.id, PHOTO]);
    expect(w.rows.find((r) => r.id === PHOTO)?.postId).toBe(POST);
    expect(w.storage.duplicate).toHaveBeenCalledTimes(2);
  });
});

describe('claimPublicationMedia — rien ne se copie hors des publications vivantes de l’auteur', () => {
  it('le média d’autrui, rattaché à SON post, ne se copie pas', async () => {
    const w = world({
      media: [media({ id: VIDEO, postId: THEIR_POST, uploaderId: STRANGER })],
      posts: [{ id: THEIR_POST, authorId: STRANGER }, { id: POST, authorId: AUTHOR }],
    });

    const served = await publishPost(w);

    expect(w.rows.filter((r) => r.postId === POST)).toHaveLength(0);
    expect(w.storage.duplicate).not.toHaveBeenCalled();
    expect(served.mediaIds).toEqual([VIDEO]);
  });

  it('un média que j’ai téléversé mais rattaché au post d’un autre ne se copie pas', async () => {
    const w = world({
      media: [media({ id: VIDEO, postId: THEIR_POST })],
      posts: [{ id: THEIR_POST, authorId: STRANGER }, { id: POST, authorId: AUTHOR }],
    });

    await publishPost(w);

    expect(w.storage.duplicate).not.toHaveBeenCalled();
  });

  it('le média d’une publication SUPPRIMÉE (modération, retrait, expiration purgée) ne se copie pas', async () => {
    const w = world({
      media: [media({ id: VIDEO, postId: STORY })],
      posts: [{ id: STORY, authorId: AUTHOR, deletedAt: new Date('2026-11-01T10:00:00Z') }, { id: POST, authorId: AUTHOR }],
    });

    await publishPost(w);

    expect(w.storage.duplicate).not.toHaveBeenCalled();
    expect(w.rows.filter((r) => r.postId === POST)).toHaveLength(0);
  });

  it('le média d’un COMMENTAIRE ne se copie pas', async () => {
    const w = world({ media: [media({ id: VIDEO, commentId: COMMENT })] });

    await publishPost(w);

    expect(w.storage.duplicate).not.toHaveBeenCalled();
  });

  it('une copie qui échoue ne fait pas échouer la publication et ne laisse aucun octet derrière elle', async () => {
    const w = world({ media: [media({ id: VIDEO, postId: STORY })], failDuplicate: true });

    const served = await publishPost(w);

    expect(served.mediaIds).toEqual([VIDEO]);
    expect(w.rows.filter((r) => r.postId === POST)).toHaveLength(0);
    expect(w.deleted).toEqual([`${videoUrl}#copy-1`]);
    expect(w.prisma.post.update).not.toHaveBeenCalled();
  });
});

describe('publishableMedia — la règle du réel juge ce que la publication POSSÉDERA', () => {
  it('Post puis Réel : la vidéo prise par le post qualifie le réel, qui la recevra en copie', async () => {
    const w = world({ media: [media({ id: VIDEO, postId: POST })] });

    const found = await publishableMedia(w.prisma, [VIDEO], AUTHOR);

    expect(found).toEqual([{ id: VIDEO, mimeType: 'video/mp4', duration: 6000 }]);
  });

  it('le média d’autrui ne qualifie rien', async () => {
    const w = world({
      media: [media({ id: VIDEO, postId: THEIR_POST, uploaderId: STRANGER })],
      posts: [{ id: THEIR_POST, authorId: STRANGER }],
    });

    expect(await publishableMedia(w.prisma, [VIDEO], AUTHOR)).toEqual([]);
  });

  it('un média libre se lit sous la garde de propriété ordinaire', async () => {
    const w = world({ media: [media({ id: VIDEO }), media({ id: PHOTO, uploaderId: STRANGER })] });

    expect(await publishableMedia(w.prisma, [VIDEO, PHOTO], AUTHOR)).toEqual([
      { id: VIDEO, mimeType: 'video/mp4', duration: 6000 },
    ]);
  });
});
