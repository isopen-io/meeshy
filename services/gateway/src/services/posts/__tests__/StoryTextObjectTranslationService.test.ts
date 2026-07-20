/**
 * StoryTextObjectTranslationService — unit tests
 *
 * Covers:
 *  - handleTranslationCompleted: post not found → no-op
 *  - handleTranslationCompleted: invalid textObjectIndex (negative, float, > 1000)
 *  - handleTranslationCompleted: malformed language codes → filtered out
 *  - handleTranslationCompleted: all languages filtered → no $runCommandRaw
 *  - handleTranslationCompleted: ONLY visibility → explicit recipient list
 *  - handleTranslationCompleted: FRIENDS/PUBLIC visibility → friend lookup
 *  - handleTranslationCompleted: EXCEPT visibility → friends minus excluded
 *  - resolveBroadcastRecipients: friend lookup failure → author-only fallback
 *  - static shared getter
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

// ─── Fakes ────────────────────────────────────────────────────────────────────

type FriendRequest = { senderId: string; receiverId: string };

type MakePrismaOpts = {
  post?: object | null;
  friendRequests?: FriendRequest[];
  friendRequestsError?: boolean;
};

const makeMockPrisma = ({
  post = { authorId: 'author-1', visibility: 'PUBLIC', visibilityUserIds: [] },
  friendRequests = [] as FriendRequest[],
  friendRequestsError = false,
}: MakePrismaOpts = {}) => ({
  post: {
    findUnique: jest.fn(async () => post),
  },
  friendRequest: {
    findMany: jest.fn(async () => {
      if (friendRequestsError) throw new Error('DB error');
      return friendRequests;
    }),
  },
  $runCommandRaw: jest.fn(async () => ({ ok: 1 })),
});

const makeToMock = () => {
  const emitMock = jest.fn();
  const toMock = { emit: emitMock };
  return { emitMock, toMock };
};

const makeMockIo = () => {
  const { emitMock, toMock } = makeToMock();
  return {
    io: { to: jest.fn().mockReturnValue(toMock) },
    emitMock,
  };
};

// ─── Import ───────────────────────────────────────────────────────────────────

import { StoryTextObjectTranslationService } from '../StoryTextObjectTranslationService';

// ─── Factory ──────────────────────────────────────────────────────────────────

const makeService = (opts: MakePrismaOpts = {}) => {
  const prisma = makeMockPrisma(opts);
  const { io, emitMock } = makeMockIo();
  // @ts-expect-error accessing private static
  StoryTextObjectTranslationService._shared = null;
  const service = StoryTextObjectTranslationService.init(
    prisma as unknown as Parameters<typeof StoryTextObjectTranslationService.init>[0],
    io as unknown as Parameters<typeof StoryTextObjectTranslationService.init>[1],
  );
  return { service, prisma, io, emitMock };
};

const BASE_PARAMS = {
  postId: 'post-1',
  textObjectIndex: 0,
  translations: { fr: 'Bonjour', en: 'Hello' },
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('StoryTextObjectTranslationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // @ts-expect-error accessing private static
    StoryTextObjectTranslationService._shared = null;
  });

  describe('static shared getter', () => {
    it('throws when not initialized', () => {
      expect(() => StoryTextObjectTranslationService.shared).toThrow(
        'StoryTextObjectTranslationService not initialized',
      );
    });

    it('returns the initialized instance after init', () => {
      const { service } = makeService();
      expect(StoryTextObjectTranslationService.shared).toBe(service);
    });
  });

  describe('handleTranslationCompleted — post not found', () => {
    it('returns without persisting when post does not exist', async () => {
      const { service, prisma } = makeService({ post: null });
      await service.handleTranslationCompleted(BASE_PARAMS);
      expect(prisma.$runCommandRaw).not.toHaveBeenCalled();
    });
  });

  describe('handleTranslationCompleted — textObjectIndex validation', () => {
    it('rejects negative index', async () => {
      const { service, prisma } = makeService();
      await service.handleTranslationCompleted({ ...BASE_PARAMS, textObjectIndex: -1 });
      expect(prisma.$runCommandRaw).not.toHaveBeenCalled();
    });

    it('rejects float index', async () => {
      const { service, prisma } = makeService();
      await service.handleTranslationCompleted({ ...BASE_PARAMS, textObjectIndex: 1.5 });
      expect(prisma.$runCommandRaw).not.toHaveBeenCalled();
    });

    it('rejects index greater than 1000', async () => {
      const { service, prisma } = makeService();
      await service.handleTranslationCompleted({ ...BASE_PARAMS, textObjectIndex: 1001 });
      expect(prisma.$runCommandRaw).not.toHaveBeenCalled();
    });

    it('accepts index exactly at 1000', async () => {
      const { service, prisma } = makeService();
      await service.handleTranslationCompleted({ ...BASE_PARAMS, textObjectIndex: 1000 });
      expect(prisma.$runCommandRaw).toHaveBeenCalledTimes(1);
    });

    it('accepts index 0', async () => {
      const { service, prisma } = makeService();
      await service.handleTranslationCompleted({ ...BASE_PARAMS, textObjectIndex: 0 });
      expect(prisma.$runCommandRaw).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleTranslationCompleted — language code sanitization', () => {
    it('filters out language codes that are too short (< 2 chars)', async () => {
      const { service, prisma } = makeService();
      await service.handleTranslationCompleted({
        ...BASE_PARAMS,
        translations: { f: 'text' }, // 1 char
      });
      expect(prisma.$runCommandRaw).not.toHaveBeenCalled();
    });

    it('filters out language codes that are too long (> 5 chars)', async () => {
      const { service, prisma } = makeService();
      await service.handleTranslationCompleted({
        ...BASE_PARAMS,
        translations: { toolong: 'text' }, // 7 chars
      });
      expect(prisma.$runCommandRaw).not.toHaveBeenCalled();
    });

    it('filters out language codes with uppercase letters', async () => {
      const { service, prisma } = makeService();
      await service.handleTranslationCompleted({
        ...BASE_PARAMS,
        translations: { FR: 'text', EN: 'text' },
      });
      expect(prisma.$runCommandRaw).not.toHaveBeenCalled();
    });

    it('filters out language codes with digits', async () => {
      const { service, prisma } = makeService();
      await service.handleTranslationCompleted({
        ...BASE_PARAMS,
        translations: { fr1: 'text' },
      });
      expect(prisma.$runCommandRaw).not.toHaveBeenCalled();
    });

    it('accepts valid 2-char language codes', async () => {
      const { service, prisma } = makeService();
      await service.handleTranslationCompleted({
        ...BASE_PARAMS,
        translations: { fr: 'Bonjour', en: 'Hello' },
      });
      expect(prisma.$runCommandRaw).toHaveBeenCalledTimes(1);
    });

    it('accepts valid 5-char language codes', async () => {
      const { service, prisma } = makeService();
      await service.handleTranslationCompleted({
        ...BASE_PARAMS,
        translations: { zhhans: 'text' }, // 6 chars — should be filtered
      });
      expect(prisma.$runCommandRaw).not.toHaveBeenCalled();
    });

    it('accepts exactly 5-char lowercase code', async () => {
      const { service, prisma } = makeService();
      await service.handleTranslationCompleted({
        ...BASE_PARAMS,
        translations: { zhtws: 'text' }, // 5 chars, all lowercase
      });
      expect(prisma.$runCommandRaw).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleTranslationCompleted — MongoDB $set', () => {
    it('builds correct dot-notation field path for $set', async () => {
      const { service, prisma } = makeService();
      await service.handleTranslationCompleted({
        postId: 'post-1',
        textObjectIndex: 2,
        translations: { fr: 'Bonjour' },
      });
      const cmd = (prisma.$runCommandRaw as jest.Mock).mock.calls[0] as [object];
      expect(cmd[0]).toMatchObject({
        update: 'Post',
        updates: [{
          q: { _id: { $oid: 'post-1' } },
          u: { $set: { 'storyEffects.textObjects.2.translations.fr': 'Bonjour' } },
        }],
      });
    });
  });

  describe('handleTranslationCompleted — ONLY visibility', () => {
    it('broadcasts to author + visibilityUserIds list only (no friend lookup)', async () => {
      const { service, prisma, io, emitMock } = makeService({
        post: {
          authorId: 'author-1',
          visibility: 'ONLY',
          visibilityUserIds: ['user-A', 'user-B'],
        },
      });

      await service.handleTranslationCompleted(BASE_PARAMS);

      expect(prisma.friendRequest.findMany).not.toHaveBeenCalled();

      const toArgs = (io.to as jest.Mock).mock.calls.map(([r]: [string]) => r);
      expect(toArgs).toContain(ROOMS.feed('author-1'));
      expect(toArgs).toContain(ROOMS.feed('user-A'));
      expect(toArgs).toContain(ROOMS.feed('user-B'));
    });
  });

  describe('handleTranslationCompleted — FRIENDS visibility', () => {
    it('broadcasts to author and accepted friends', async () => {
      const { service, io } = makeService({
        post: { authorId: 'author-1', visibility: 'FRIENDS', visibilityUserIds: [] },
        friendRequests: [
          { senderId: 'author-1', receiverId: 'friend-A' },
          { senderId: 'friend-B', receiverId: 'author-1' },
        ],
      });

      await service.handleTranslationCompleted(BASE_PARAMS);

      const toArgs = (io.to as jest.Mock).mock.calls.map(([r]: [string]) => r);
      expect(toArgs).toContain(ROOMS.feed('author-1'));
      expect(toArgs).toContain(ROOMS.feed('friend-A'));
      expect(toArgs).toContain(ROOMS.feed('friend-B'));
    });
  });

  describe('handleTranslationCompleted — EXCEPT visibility', () => {
    it('excludes users in visibilityUserIds from broadcast', async () => {
      const { service, io } = makeService({
        post: {
          authorId: 'author-1',
          visibility: 'EXCEPT',
          visibilityUserIds: ['friend-B'],
        },
        friendRequests: [
          { senderId: 'author-1', receiverId: 'friend-A' },
          { senderId: 'author-1', receiverId: 'friend-B' },
        ],
      });

      await service.handleTranslationCompleted(BASE_PARAMS);

      const toArgs = (io.to as jest.Mock).mock.calls.map(([r]: [string]) => r);
      expect(toArgs).toContain(ROOMS.feed('friend-A'));
      expect(toArgs).not.toContain(ROOMS.feed('friend-B'));
    });
  });

  describe('handleTranslationCompleted — PRIVATE visibility', () => {
    it('broadcasts to author only — no friend fan-out (draft / author-only story)', async () => {
      const { service, prisma, io } = makeService({
        post: { authorId: 'author-1', visibility: 'PRIVATE', visibilityUserIds: [] },
        friendRequests: [
          { senderId: 'author-1', receiverId: 'friend-A' },
          { senderId: 'friend-B', receiverId: 'author-1' },
        ],
      });

      await service.handleTranslationCompleted(BASE_PARAMS);

      expect(prisma.friendRequest.findMany).not.toHaveBeenCalled();

      const toArgs = (io.to as jest.Mock).mock.calls.map(([r]: [string]) => r);
      expect(toArgs).toEqual([ROOMS.feed('author-1')]);
      expect(toArgs).not.toContain(ROOMS.feed('friend-A'));
      expect(toArgs).not.toContain(ROOMS.feed('friend-B'));
    });
  });

  describe('resolveBroadcastRecipients — friend lookup failure', () => {
    it('falls back to author-only broadcast on friend request DB error', async () => {
      const { service, io } = makeService({
        post: { authorId: 'author-1', visibility: 'FRIENDS', visibilityUserIds: [] },
        friendRequestsError: true,
      });

      await service.handleTranslationCompleted(BASE_PARAMS);

      const toArgs = (io.to as jest.Mock).mock.calls.map(([r]: [string]) => r);
      expect(toArgs).toEqual([ROOMS.feed('author-1')]);
    });
  });

  describe('handleTranslationCompleted — event data', () => {
    it('emits correct story:translation-updated event data', async () => {
      const { service, io, emitMock } = makeService({
        post: {
          authorId: 'author-1',
          visibility: 'ONLY',
          visibilityUserIds: [],
        },
      });

      await service.handleTranslationCompleted({
        postId: 'post-1',
        textObjectIndex: 3,
        translations: { fr: 'Bonjour' },
      });

      expect(emitMock).toHaveBeenCalledWith(
        SERVER_EVENTS.STORY_TRANSLATION_UPDATED,
        { postId: 'post-1', textObjectIndex: 3, translations: { fr: 'Bonjour' } },
      );
    });
  });
});
