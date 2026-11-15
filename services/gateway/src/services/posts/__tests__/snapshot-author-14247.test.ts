/**
 * #14247 — la copie permanente d'un contenu éphémère garde la trace de son
 * auteur d'origine (`Post.snapshotAuthorId`), même après que le balayage des
 * stories expirées a détaché `repostOfId` ; la garde de blocage (#14242) la lit.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { PostType } from '@meeshy/shared/prisma/client';

jest.mock('../PostAudioService', () => ({
  PostAudioService: { shared: { processPostAudio: jest.fn().mockReturnValue(Promise.resolve()) }, init: jest.fn() },
}));

import { PostService } from '../../PostService';
import { MediaService } from '../../MediaService';
import type { PostReactionService } from '../../PostReactionService';
import { isBlockedWithContentAuthors } from '../contentAuthorBlock';

const ACTOR = '507f1f77bcf86cd799439001';
const ORIGIN = '507f1f77bcf86cd799439002';
const REPOSTER = '507f1f77bcf86cd799439003';
const COPY = '507f1f77bcf86cd799439022';

const story = (over: Record<string, unknown> = {}) => ({
  id: 'story-1', authorId: ORIGIN, type: PostType.STORY, visibility: 'PUBLIC', content: 'coucou',
  deletedAt: null, expiresAt: null, media: [], repostOfId: null, originalRepostOfId: null, ...over,
});

const written = async (source: Record<string, unknown>) => {
  const prisma: any = {
    post: { findFirst: jest.fn(async () => source), create: jest.fn(async () => ({ id: 'repost-1', media: [] })), update: jest.fn(async () => ({})) },
    postMedia: { findMany: jest.fn(async () => []), updateMany: jest.fn(async () => ({ count: 0 })) },
  };
  prisma.$transaction = jest.fn(async (arg: any) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg)));
  const service = new PostService(prisma, new MediaService(), undefined, { addReaction: jest.fn(), removeReaction: jest.fn() } as unknown as PostReactionService);
  await service.repostPost(source.id as string, REPOSTER, { targetType: PostType.POST });
  return (prisma.post.create.mock.calls[0]?.[0] as { data: Record<string, unknown> } | undefined)?.data;
};

describe('la copie d’un contenu éphémère garde son auteur d’origine (#14247)', () => {
  it('republier une story en post permanent écrit l’auteur de la story', async () => {
    expect((await written(story()))?.snapshotAuthorId).toBe(ORIGIN);
  });

  it('copier une copie garde l’auteur d’ORIGINE, pas celui de la copie intermédiaire', async () => {
    expect((await written(story({ authorId: REPOSTER, snapshotAuthorId: ORIGIN })))?.snapshotAuthorId).toBe(ORIGIN);
  });
});

type Row = { readonly id: string; readonly authorId: string; readonly repostOfId: string | null; readonly originalRepostOfId: string | null; readonly snapshotAuthorId?: string | null };

const guard = (rows: readonly Row[], blocks: ReadonlyArray<readonly [string, string]>) => {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return {
    post: {
      findFirst: jest.fn<any>(async (args: { where: { id: string } }) => byId.get(args.where.id) ?? null),
      findMany: jest.fn<any>(async (args: { where: { id: { in: string[] } } }) => args.where.id.in.flatMap((id) => byId.get(id) ?? [])),
    },
    user: {
      findFirst: jest.fn<any>(async (args: { where: { OR: Array<{ id: string; blockedUserIds: { has: string } }> } }) =>
        args.where.OR.some((c) => blocks.some(([a, b]) => a === c.id && b === c.blockedUserIds.has)) ? { id: 'x' } : null),
    },
  } as any;
};

const detached = (snapshotAuthorId: string | null): Row => ({ id: COPY, authorId: REPOSTER, repostOfId: null, originalRepostOfId: null, snapshotAuthorId });

describe('la garde de blocage lit l’auteur d’origine d’une copie détachée (#14247)', () => {
  it('témoin : copie détachée, aucun blocage ⇒ permis', async () => {
    expect(await isBlockedWithContentAuthors(guard([detached(ORIGIN)], []), { actorId: ACTOR, postId: COPY })).toBe(false);
  });

  it.each([
    ['l’auteur d’origine a bloqué l’acteur', [ORIGIN, ACTOR] as const],
    ['l’acteur a bloqué l’auteur d’origine', [ACTOR, ORIGIN] as const],
  ])('%s ⇒ bloqué, alors que plus rien ne relie la copie à sa source', async (_label, pair) => {
    expect(await isBlockedWithContentAuthors(guard([detached(ORIGIN)], [pair]), { actorId: ACTOR, postId: COPY })).toBe(true);
  });

  it('republier une copie détachée : l’auteur d’origine de la SOURCE est mesuré aussi', async () => {
    const SECOND = '507f1f77bcf86cd799439033';
    const rows: Row[] = [detached(ORIGIN), { id: SECOND, authorId: '507f1f77bcf86cd799439004', repostOfId: COPY, originalRepostOfId: COPY }];
    expect(await isBlockedWithContentAuthors(guard(rows, [[ORIGIN, ACTOR]]), { actorId: ACTOR, postId: SECOND })).toBe(true);
  });

  it('une ancienne copie sans la clé reste jugée sur son seul auteur (rétrocompatible)', async () => {
    expect(await isBlockedWithContentAuthors(guard([detached(null)], [[ORIGIN, ACTOR]]), { actorId: ACTOR, postId: COPY })).toBe(false);
  });
});
