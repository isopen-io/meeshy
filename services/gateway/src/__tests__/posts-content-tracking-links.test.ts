/**
 * Tests — généralisation du tracking « URL brute » aux POSTS / STORIES (modèle
 * Post) et COMMENTAIRES (PostComment), via la source UNIQUE
 * `TrackingLinkService.collectContentTrackingLinks` déjà utilisée par les
 * messages.
 *
 * Prouve :
 *  (a) un post créé avec une URL brute persiste `metadata.trackingLinks =
 *      [{url, token}]` (même mécanisme que les messages) ;
 *  (b) une story (Post type STORY) suit le même chemin (texte = `content`) ;
 *  (c) un post sans URL n'écrit PAS de metadata ;
 *  (d) un commentaire avec URL brute persiste `metadata.trackingLinks` et le
 *      renvoie hissé dans l'objet commentaire retourné ;
 *  (e) le tracking ne bloque JAMAIS la création (helper qui throw → post créé).
 *
 * Le `TrackingLinkService` est mocké au minimum (injection constructeur) — la
 * détection/mint d'URL elle-même est déjà couverte par
 * `tracking-content-links.test.ts`.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PostService } from '../services/PostService';
import { PostCommentService } from '../services/PostCommentService';
import type { TrackingLinkService, ContentTrackingLink } from '../services/TrackingLinkService';

const POST_ID = '507f1f77bcf86cd799439011';
const COMMENT_ID = '507f1f77bcf86cd799439022';
const USER_ID = '507f1f77bcf86cd799439099';

type CollectFn = TrackingLinkService['collectContentTrackingLinks'];

const buildTracking = (links: ContentTrackingLink[]): { service: TrackingLinkService; collect: jest.Mock } => {
  const collect = jest.fn<CollectFn>().mockResolvedValue(links);
  return { service: { collectContentTrackingLinks: collect } as unknown as TrackingLinkService, collect };
};

const LINKS: ContentTrackingLink[] = [{ url: 'https://example.com/video.mp4', token: 'tok1' }];

// ---------------------------------------------------------------------------
// POST / STORY creation
// ---------------------------------------------------------------------------

const buildPostPrisma = (createdMetadata: Record<string, unknown> | null = null) => {
  const updateCalls: unknown[] = [];
  const post = {
    create: jest.fn<(arg?: unknown) => Promise<{ id: string; authorId: string; metadata: unknown }>>()
      .mockResolvedValue({ id: POST_ID, authorId: USER_ID, metadata: createdMetadata }),
    update: jest.fn<(arg?: unknown) => Promise<unknown>>().mockImplementation(async (arg: any) => {
      updateCalls.push(arg);
      return {};
    }),
    findUnique: jest.fn<(arg?: unknown) => Promise<unknown>>()
      .mockResolvedValue({ id: POST_ID, authorId: USER_ID }),
    findFirst: jest.fn<(arg?: unknown) => Promise<unknown>>().mockResolvedValue(null),
  };
  const prisma = { post, __updateCalls: updateCalls };
  return prisma as unknown as ConstructorParameters<typeof PostService>[0] & {
    post: typeof post; __updateCalls: unknown[];
  };
};

const makePostService = (
  prisma: ReturnType<typeof buildPostPrisma>,
  tracking: TrackingLinkService,
) =>
  new PostService(
    prisma as unknown as ConstructorParameters<typeof PostService>[0],
    undefined,
    undefined,
    undefined,
    tracking,
  );

describe('PostService.createPost — raw-URL tracking links', () => {
  it('(a) persists metadata.trackingLinks for a POST whose content has a raw URL', async () => {
    const prisma = buildPostPrisma();
    const { service, collect } = buildTracking(LINKS);

    await makePostService(prisma, service).createPost(
      { type: 'POST', visibility: 'PUBLIC', content: 'Watch https://example.com/video.mp4 now' } as never,
      USER_ID,
    );

    expect(collect).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Watch https://example.com/video.mp4 now', createdBy: USER_ID, postId: POST_ID }),
    );
    const metadataWrite = prisma.post.update.mock.calls
      .map((c) => c[0] as any)
      .find((arg) => arg?.data?.metadata !== undefined);
    expect(metadataWrite).toBeDefined();
    expect(metadataWrite.data.metadata).toEqual({ trackingLinks: LINKS });
  });

  it('(b) follows the same path for a STORY (story text = content)', async () => {
    const prisma = buildPostPrisma();
    const { service, collect } = buildTracking(LINKS);

    await makePostService(prisma, service).createPost(
      { type: 'STORY', visibility: 'PUBLIC', content: 'Story https://example.com/video.mp4' } as never,
      USER_ID,
    );

    expect(collect).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Story https://example.com/video.mp4', postId: POST_ID }),
    );
    const metadataWrite = prisma.post.update.mock.calls
      .map((c) => c[0] as any)
      .find((arg) => arg?.data?.metadata !== undefined);
    expect(metadataWrite.data.metadata).toEqual({ trackingLinks: LINKS });
  });

  it('(c) does NOT write metadata when there are no tracking links', async () => {
    const prisma = buildPostPrisma();
    const { service } = buildTracking([]);

    await makePostService(prisma, service).createPost(
      { type: 'POST', visibility: 'PUBLIC', content: 'plain text, no urls' } as never,
      USER_ID,
    );

    const metadataWrite = prisma.post.update.mock.calls
      .map((c) => c[0] as any)
      .find((arg) => arg?.data?.metadata !== undefined);
    expect(metadataWrite).toBeUndefined();
  });

  it('(c2) merges trackingLinks into existing metadata (never clobbers)', async () => {
    const prisma = buildPostPrisma({ foo: 'bar' });
    const { service } = buildTracking(LINKS);

    await makePostService(prisma, service).createPost(
      { type: 'POST', visibility: 'PUBLIC', content: 'x https://example.com/video.mp4' } as never,
      USER_ID,
    );

    const metadataWrite = prisma.post.update.mock.calls
      .map((c) => c[0] as any)
      .find((arg) => arg?.data?.metadata !== undefined);
    expect(metadataWrite.data.metadata).toEqual({ foo: 'bar', trackingLinks: LINKS });
  });

  it('(e) never blocks post creation when tracking throws', async () => {
    const prisma = buildPostPrisma();
    const collect = jest.fn<CollectFn>().mockRejectedValue(new Error('boom'));
    const service = { collectContentTrackingLinks: collect } as unknown as TrackingLinkService;

    const created = await makePostService(prisma, service).createPost(
      { type: 'POST', visibility: 'PUBLIC', content: 'x https://example.com/video.mp4' } as never,
      USER_ID,
    );

    expect(created).toBeDefined();
    expect(prisma.post.create).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// COMMENT creation
// ---------------------------------------------------------------------------

const buildCommentPrisma = (commentMetadata: Record<string, unknown> | null = null) => {
  const postComment = {
    create: jest.fn<(arg?: unknown) => Promise<{ id: string; content: string; metadata: unknown }>>()
      .mockResolvedValue({ id: COMMENT_ID, content: 'c', metadata: commentMetadata }),
    update: jest.fn<(arg?: unknown) => Promise<unknown>>().mockResolvedValue({}),
    findFirst: jest.fn<(arg?: unknown) => Promise<unknown>>().mockResolvedValue(null),
  };
  const post = {
    findFirst: jest.fn<(arg?: unknown) => Promise<{ id: string } | null>>()
      .mockResolvedValue({ id: POST_ID }),
    update: jest.fn<(arg?: unknown) => Promise<unknown>>().mockResolvedValue({}),
  };
  const prisma = { post, postComment };
  return prisma as unknown as ConstructorParameters<typeof PostCommentService>[0] & {
    post: typeof post; postComment: typeof postComment;
  };
};

describe('PostCommentService.addComment — raw-URL tracking links', () => {
  it('(d) persists metadata.trackingLinks and hoists it onto the returned comment', async () => {
    const prisma = buildCommentPrisma();
    const { service, collect } = buildTracking(LINKS);
    const svc = new PostCommentService(prisma as unknown as ConstructorParameters<typeof PostCommentService>[0], service);

    const comment = await svc.addComment(POST_ID, USER_ID, 'see https://example.com/video.mp4');

    expect(collect).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'see https://example.com/video.mp4', createdBy: USER_ID }),
    );
    const metadataWrite = (prisma.postComment.update.mock.calls
      .map((c) => c[0] as any)
      .find((arg) => arg?.data?.metadata !== undefined));
    expect(metadataWrite.data.metadata).toEqual({ trackingLinks: LINKS });
    expect((comment as any)?.metadata).toEqual({ trackingLinks: LINKS });
  });

  it('(d2) does NOT write metadata when the comment has no tracking links', async () => {
    const prisma = buildCommentPrisma();
    const { service } = buildTracking([]);
    const svc = new PostCommentService(prisma as unknown as ConstructorParameters<typeof PostCommentService>[0], service);

    await svc.addComment(POST_ID, USER_ID, 'plain comment');

    const metadataWrite = prisma.postComment.update.mock.calls
      .map((c) => c[0] as any)
      .find((arg) => arg?.data?.metadata !== undefined);
    expect(metadataWrite).toBeUndefined();
  });

  it('(e2) never blocks comment creation when tracking throws', async () => {
    const prisma = buildCommentPrisma();
    const collect = jest.fn<CollectFn>().mockRejectedValue(new Error('boom'));
    const service = { collectContentTrackingLinks: collect } as unknown as TrackingLinkService;
    const svc = new PostCommentService(prisma as unknown as ConstructorParameters<typeof PostCommentService>[0], service);

    const comment = await svc.addComment(POST_ID, USER_ID, 'x https://example.com/video.mp4');

    expect(comment).toBeDefined();
    expect(prisma.postComment.create).toHaveBeenCalledTimes(1);
  });
});
