/**
 * @jest-environment node
 *
 * #13422 — un média pré-téléversé que rien n'a réclamé est balayé après 24 h.
 * Une publication qui le demande encore (par `mediaIds` ou par sa scène) est
 * REFUSÉE avant toute écriture, en nommant le média : l'appareil le renvoie
 * puis republie. Avant, elle partait sans lui — une story à la scène vide.
 */

import { describe, it, expect, jest } from '@jest/globals';
import { PostService } from '../../services/PostService';
import type { MediaStorage } from '../../services/storage/MediaStorage';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { PostType, PostVisibility } from '@meeshy/shared/prisma/client';
import { matchesWhere, type MongoDoc, type WhereShape } from '../../services/posts/__tests__/helpers/mongoWhereMatcher';
import { MediaNotClaimedError } from '../../services/posts/unpublishableMedia';

jest.mock('../../services/posts/PostAudioService', () => ({
  PostAudioService: { shared: { processPostAudio: jest.fn().mockReturnValue(Promise.resolve()) }, init: jest.fn() },
}));

const AUTHOR = '64b000000000000000000001';
const KEPT = '64c000000000000000000001';
const SWEPT = '64c000000000000000000002';

function world() {
  const media: MongoDoc[] = [{
    id: KEPT, fileName: 'a.jpg', originalName: 'a.jpg', mimeType: 'image/jpeg', fileSize: 10,
    filePath: `2026/11/${AUTHOR}/a.jpg`, fileUrl: `/api/v1/attachments/file/2026/11/${AUTHOR}/a.jpg`,
    uploaderId: AUTHOR, postId: null, createdAt: new Date(Date.now() - 60_000),
  }];
  const create = jest.fn(async ({ data }: { data: MongoDoc }) => ({ ...data, id: '64f000000000000000000001', media: [] }));
  const prisma = {
    post: { create, findUnique: jest.fn(async () => null), findFirst: jest.fn(async () => null), findMany: jest.fn(async () => []), update: jest.fn(async () => ({})) },
    postMedia: {
      updateMany: jest.fn(async () => ({ count: 0 })),
      findMany: jest.fn(async ({ where }: { where: WhereShape }) => media.filter((m) => matchesWhere(m, where))),
      findFirst: jest.fn(async () => null),
      update: jest.fn(async () => ({})),
    },
    sound: { findMany: jest.fn(async () => []) },
  };
  const service = new PostService(prisma as unknown as PrismaClient, {} as unknown as MediaStorage);
  return { service, create };
}

const refusedIds = async (promise: Promise<unknown>): Promise<readonly string[] | null> =>
  promise.then(() => null, (error: unknown) => (error instanceof MediaNotClaimedError ? error.mediaIds : Promise.reject(error)));

describe('createPost — un média balayé refuse la publication (#13422)', () => {
  it('demandé par mediaIds : refus qui nomme le média, rien n’est écrit', async () => {
    const w = world();
    const refused = await refusedIds(w.service.createPost(
      { type: PostType.POST, visibility: PostVisibility.PUBLIC, mediaIds: [KEPT, SWEPT] }, AUTHOR,
    ));
    expect(refused).toEqual([SWEPT]);
    expect(w.create).not.toHaveBeenCalled();
  });

  it('demandé par la seule scène d’une story : même refus', async () => {
    const w = world();
    const storyEffects = { v: 3, scenes: [{ id: 's1', objects: [{ id: 'o1', kind: 'media', payload: { postMediaId: SWEPT } }] }] };
    const refused = await refusedIds(w.service.createPost(
      { type: PostType.STORY, visibility: PostVisibility.FRIENDS, mediaIds: [KEPT], storyEffects }, AUTHOR,
    ));
    expect(refused).toEqual([SWEPT]);
    expect(w.create).not.toHaveBeenCalled();
  });
});
