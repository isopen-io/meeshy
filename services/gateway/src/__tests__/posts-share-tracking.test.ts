/**
 * Tests — LOT 6 partage tracé (PostService share-link upsert, bookmark fix,
 * delete invalidation).
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PostService } from '../services/PostService';

const POST_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439099';

class P2002Error extends Error {
  code = 'P2002';
  constructor() { super('Unique constraint failed'); }
}

type Link = {
  id: string; token: string; shortUrl: string; targetId: string; createdBy: string;
  totalClicks: number; uniqueClicks: number; lastClickedAt: Date | null; isActive: boolean;
};

const buildPrisma = () => {
  const post = {
    findFirst: jest.fn<(arg?: unknown) => Promise<{ id: string; authorId: string; shareCount?: number; type?: string; bookmarkCount?: number } | null>>()
      .mockResolvedValue({ id: POST_ID, authorId: 'author', shareCount: 0, type: 'POST', bookmarkCount: 0 }),
    update: jest.fn<(arg?: unknown) => Promise<{ shareCount: number; bookmarkCount: number }>>().mockResolvedValue({ shareCount: 1, bookmarkCount: 1 }),
    updateMany: jest.fn<(arg?: unknown) => Promise<{ count: number }>>().mockResolvedValue({ count: 1 }),
  };
  const trackingLink = {
    findFirst: jest.fn<(arg?: unknown) => Promise<Link | null>>().mockResolvedValue(null),
    findUnique: jest.fn<(arg?: unknown) => Promise<Link | null>>().mockResolvedValue(null),
    create: jest.fn<(arg?: unknown) => Promise<Link>>().mockImplementation(async (arg: any) => ({
      id: 'link1', token: arg?.data?.token ?? 'abc123', shortUrl: `/l/${arg?.data?.token ?? 'abc123'}`,
      targetId: arg?.data?.targetId ?? POST_ID, createdBy: arg?.data?.createdBy ?? USER_ID,
      totalClicks: 0, uniqueClicks: 0, lastClickedAt: null, isActive: true,
    })),
    updateMany: jest.fn<(arg?: unknown) => Promise<{ count: number }>>().mockResolvedValue({ count: 0 }),
  };
  const postBookmark = {
    create: jest.fn<(arg?: unknown) => Promise<unknown>>().mockResolvedValue({}),
    delete: jest.fn<(arg?: unknown) => Promise<unknown>>().mockResolvedValue({}),
  };
  const prisma: any = {
    post, trackingLink, postBookmark,
    $transaction: jest.fn(async (fn: unknown) => {
      if (typeof fn === 'function') return (fn as (tx: unknown) => unknown)(prisma);
      return Promise.all(fn as Promise<unknown>[]);
    }),
  };
  return prisma as ConstructorParameters<typeof PostService>[0] & {
    post: typeof post; trackingLink: typeof trackingLink; postBookmark: typeof postBookmark;
  };
};

describe('PostService.shareWithTrackingLink', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let service: PostService;
  beforeEach(() => { prisma = buildPrisma(); service = new PostService(prisma); });

  it('creates a new link and increments shareCount for a first-time sharer', async () => {
    const res = await service.shareWithTrackingLink(POST_ID, USER_ID, { baseUrl: 'https://meeshy.me' });
    expect(res).not.toBeNull();
    expect(res!.token).toMatch(/^[a-zA-Z0-9]{6}$/);
    expect(res!.shortUrl).toBe(`https://meeshy.me/l/${res!.token}`);
    expect(res!.reused).toBe(false);
    expect(prisma.trackingLink.create).toHaveBeenCalledTimes(1);
    expect(prisma.post.update).toHaveBeenCalledTimes(1);
  });

  it('derives targetType from the post type (POST stays POST) + targetId', async () => {
    await service.shareWithTrackingLink(POST_ID, USER_ID, { baseUrl: 'https://meeshy.me' });
    const data = (prisma.trackingLink.create.mock.calls[0][0] as any).data;
    expect(data.targetType).toBe('POST');
    expect(data.targetId).toBe(POST_ID);
    expect(data.createdBy).toBe(USER_ID);
    expect(data.originalUrl).toBe(`https://meeshy.me/post/${POST_ID}`);
  });

  it('types a shared REEL as targetType=REEL with the /reel page URL', async () => {
    prisma.post.findFirst.mockResolvedValueOnce({ id: POST_ID, authorId: 'author', shareCount: 0, type: 'REEL' });
    await service.shareWithTrackingLink(POST_ID, USER_ID, { baseUrl: 'https://meeshy.me' });
    const data = (prisma.trackingLink.create.mock.calls[0][0] as any).data;
    expect(data.targetType).toBe('REEL');
    expect(data.originalUrl).toBe(`https://meeshy.me/reel/${POST_ID}`);
  });

  it('types a shared STORY as targetType=STORY with the story viewer URL', async () => {
    prisma.post.findFirst.mockResolvedValueOnce({ id: POST_ID, authorId: 'author', shareCount: 0, type: 'STORY' });
    await service.shareWithTrackingLink(POST_ID, USER_ID, { baseUrl: 'https://meeshy.me' });
    const data = (prisma.trackingLink.create.mock.calls[0][0] as any).data;
    expect(data.targetType).toBe('STORY');
    expect(data.originalUrl).toBe(`https://meeshy.me/story/${POST_ID}`);
  });

  it('reuses an existing link and does NOT re-increment shareCount', async () => {
    prisma.trackingLink.findFirst.mockResolvedValueOnce({
      id: 'old', token: 'reused', shortUrl: '/l/reused', targetId: POST_ID, createdBy: USER_ID,
      totalClicks: 5, uniqueClicks: 2, lastClickedAt: null, isActive: true,
    });
    const res = await service.shareWithTrackingLink(POST_ID, USER_ID, { baseUrl: 'https://meeshy.me' });
    expect(res!.token).toBe('reused');
    expect(res!.reused).toBe(true);
    expect(prisma.trackingLink.create).not.toHaveBeenCalled();
    expect(prisma.post.update).not.toHaveBeenCalled();
  });

  it('on P2002 collision, re-reads the existing link WITHOUT re-incrementing shareCount', async () => {
    prisma.trackingLink.findFirst
      .mockResolvedValueOnce(null) // initial check: no link
      .mockResolvedValueOnce({     // post-collision re-read: link now exists
        id: 'raced', token: 'raced', shortUrl: '/l/raced', targetId: POST_ID, createdBy: USER_ID,
        totalClicks: 0, uniqueClicks: 0, lastClickedAt: null, isActive: true,
      });
    prisma.trackingLink.create.mockRejectedValueOnce(new P2002Error());
    const res = await service.shareWithTrackingLink(POST_ID, USER_ID, { baseUrl: 'https://meeshy.me' });
    expect(res!.token).toBe('raced');
    expect(res!.reused).toBe(true);
    // share count must not double-count the raced creation
    expect(prisma.post.update).not.toHaveBeenCalled();
  });

  it('returns null when the post does not exist', async () => {
    prisma.post.findFirst.mockResolvedValueOnce(null);
    const res = await service.shareWithTrackingLink(POST_ID, USER_ID, { baseUrl: 'https://meeshy.me' });
    expect(res).toBeNull();
    expect(prisma.trackingLink.create).not.toHaveBeenCalled();
  });
});

describe('PostService.getPostShareLink', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let service: PostService;
  beforeEach(() => { prisma = buildPrisma(); service = new PostService(prisma); });

  it('returns the current sharer link analytics', async () => {
    prisma.trackingLink.findFirst.mockResolvedValueOnce({
      id: 'l', token: 'tok', shortUrl: '/l/tok', targetId: POST_ID, createdBy: USER_ID,
      totalClicks: 9, uniqueClicks: 4, lastClickedAt: new Date('2026-06-14T10:00:00.000Z'), isActive: true,
    });
    const res = await service.getPostShareLink(POST_ID, USER_ID, 'https://meeshy.me');
    expect(res).toEqual({
      token: 'tok',
      shortUrl: 'https://meeshy.me/l/tok',
      totalClicks: 9,
      uniqueClicks: 4,
      lastClickedAt: new Date('2026-06-14T10:00:00.000Z'),
    });
  });

  it('returns null when the current user has no link for the post', async () => {
    prisma.trackingLink.findFirst.mockResolvedValueOnce(null);
    const res = await service.getPostShareLink(POST_ID, USER_ID, 'https://meeshy.me');
    expect(res).toBeNull();
  });
});

describe('PostService.bookmarkPost — P2002 fix', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let service: PostService;
  beforeEach(() => { prisma = buildPrisma(); service = new PostService(prisma); });

  it('creates the bookmark and returns the incremented absolute bookmarkCount', async () => {
    // update() returns the post AFTER `increment: 1` → that is the absolute
    // count broadcast on `post:bookmarked` so the 3 views reconcile without reload.
    const res = await service.bookmarkPost(POST_ID, USER_ID);
    expect(res).toEqual({ success: true, bookmarkCount: 1 });
    expect(prisma.postBookmark.create).toHaveBeenCalledTimes(1);
    expect(prisma.post.update).toHaveBeenCalledTimes(1);
  });

  it('does NOT re-increment on a duplicate (P2002) and returns the unchanged count', async () => {
    prisma.post.findFirst.mockResolvedValueOnce({ id: POST_ID, authorId: 'author', bookmarkCount: 7 });
    prisma.postBookmark.create.mockRejectedValueOnce(new P2002Error());
    const res = await service.bookmarkPost(POST_ID, USER_ID);
    expect(res).toEqual({ success: true, bookmarkCount: 7 });
    expect(prisma.post.update).not.toHaveBeenCalled();
  });
});

describe('PostService.unbookmarkPost — count guard', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let service: PostService;
  beforeEach(() => { prisma = buildPrisma(); service = new PostService(prisma); });

  it('decrements only when bookmarkCount stays >= 0 and returns the fresh absolute count', async () => {
    // read-after-write reflects the post AFTER the guarded decrement.
    prisma.post.findFirst.mockResolvedValueOnce({ id: POST_ID, authorId: 'author', bookmarkCount: 2 });
    const res = await service.unbookmarkPost(POST_ID, USER_ID);
    expect(res).toEqual({ success: true, bookmarkCount: 2 });
    expect(prisma.postBookmark.delete).toHaveBeenCalledTimes(1);
    expect(prisma.post.updateMany).toHaveBeenCalledTimes(1);
    const arg = prisma.post.updateMany.mock.calls[0][0] as any;
    expect(arg.where).toMatchObject({ id: POST_ID, bookmarkCount: { gt: 0 } });
    expect(arg.data).toMatchObject({ bookmarkCount: { decrement: 1 } });
  });

  it('does not decrement when the bookmark was not present but still returns the count', async () => {
    prisma.postBookmark.delete.mockRejectedValueOnce(new P2002Error());
    prisma.post.findFirst.mockResolvedValueOnce({ id: POST_ID, authorId: 'author', bookmarkCount: 5 });
    const res = await service.unbookmarkPost(POST_ID, USER_ID);
    expect(res).toEqual({ success: true, bookmarkCount: 5 });
    expect(prisma.post.updateMany).not.toHaveBeenCalled();
  });
});

describe('PostService.deletePost — TrackingLink invalidation', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let service: PostService;
  beforeEach(() => { prisma = buildPrisma(); service = new PostService(prisma); });

  it('soft-deletes the post AND deactivates its tracking links', async () => {
    prisma.post.findFirst.mockResolvedValueOnce({ id: POST_ID, authorId: USER_ID });
    prisma.post.update.mockResolvedValueOnce({ id: POST_ID } as any);
    await service.deletePost(POST_ID, USER_ID);
    expect(prisma.trackingLink.updateMany).toHaveBeenCalledTimes(1);
    const arg = prisma.trackingLink.updateMany.mock.calls[0][0] as any;
    expect(arg.where).toMatchObject({ targetId: POST_ID });
    expect(arg.data).toMatchObject({ isActive: false });
  });

  it('returns null (no link work) when the post does not exist', async () => {
    prisma.post.findFirst.mockResolvedValueOnce(null);
    const res = await service.deletePost(POST_ID, USER_ID);
    expect(res).toBeNull();
    expect(prisma.trackingLink.updateMany).not.toHaveBeenCalled();
  });
});
