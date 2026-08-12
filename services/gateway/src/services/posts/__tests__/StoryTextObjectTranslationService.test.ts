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

  // ─── content dérivé ────────────────────────────────────────────────────────
  //
  // Le `content` d'une story sans légende n'est qu'un index : la concaténation
  // des textes du canvas. Le traduire pour lui-même en faisait une seconde
  // source qui divergeait de la première — six langues sur le `content`, zéro
  // sur les overlays (production, story 6a6673870677d29b325a1a83, 2026-07-27).
  // Il doit désormais se recomposer à partir des traductions des overlays.

  const derivedPost = (overrides: Record<string, unknown> = {}) => ({
    authorId: 'author-1',
    visibility: 'ONLY',
    visibilityUserIds: [],
    content: 'Bonjour le monde',
    storyEffects: {
      textObjects: [{ text: 'Bonjour' }, { text: 'le monde' }],
    },
    ...overrides,
  });

  const setPayloads = (prisma: { $runCommandRaw: jest.Mock }) =>
    prisma.$runCommandRaw.mock.calls.map(
      ([cmd]: [{ updates: Array<{ u: { $set: Record<string, unknown> } }> }]) => cmd.updates[0].u.$set,
    );

  describe('handleTranslationCompleted — recomposition du content dérivé', () => {
    it('recompose translations.<langue> à partir des overlays', async () => {
      const { service, prisma } = makeService({ post: derivedPost() });

      await service.handleTranslationCompleted({
        postId: 'post-1',
        textObjectIndex: 0,
        translations: { en: 'Hello' },
      });

      const derived = setPayloads(prisma).find((set) => 'translations.en' in set);
      expect(derived).toBeDefined();
      // Overlay 0 traduit, overlay 1 pas encore : l'original tient sa place.
      expect((derived!['translations.en'] as { text: string }).text).toBe('Hello le monde');
    });

    it('assemble les overlays déjà traduits avec celui qui vient d\'arriver', async () => {
      const { service, prisma } = makeService({
        post: derivedPost({
          storyEffects: {
            textObjects: [
              { text: 'Bonjour' },
              { text: 'le monde', translations: { en: 'the world' } },
            ],
          },
        }),
      });

      await service.handleTranslationCompleted({
        postId: 'post-1',
        textObjectIndex: 0,
        translations: { en: 'Hello' },
      });

      const derived = setPayloads(prisma).find((set) => 'translations.en' in set);
      expect((derived!['translations.en'] as { text: string }).text).toBe('Hello the world');
    });

    it('laisse une vraie légende d\'auteur à son propre pipeline', async () => {
      const { service, prisma } = makeService({
        post: derivedPost({ content: 'Ma légende à moi, écrite à la main' }),
      });

      await service.handleTranslationCompleted({
        postId: 'post-1',
        textObjectIndex: 0,
        translations: { en: 'Hello' },
      });

      expect(setPayloads(prisma).some((set) => 'translations.en' in set)).toBe(false);
    });

    it('ne recompose rien quand la story n\'a pas de content', async () => {
      const { service, prisma } = makeService({ post: derivedPost({ content: null }) });

      await service.handleTranslationCompleted({
        postId: 'post-1',
        textObjectIndex: 0,
        translations: { en: 'Hello' },
      });

      expect(setPayloads(prisma).some((set) => 'translations.en' in set)).toBe(false);
    });

    it('ignore les langues rejetées par la validation', async () => {
      const { service, prisma } = makeService({ post: derivedPost() });

      await service.handleTranslationCompleted({
        postId: 'post-1',
        textObjectIndex: 0,
        translations: { 'not-a-lang': 'Hello' },
      });

      expect(prisma.$runCommandRaw).not.toHaveBeenCalled();
    });
  });

  // ─── temps réel ────────────────────────────────────────────────────────────
  //
  // Écrire l'index recomposé en base ne suffit pas : la feuille des langues du
  // lecteur lit `story.translations` en mémoire, alimentée par
  // `post:translation-updated`. Sans cette diffusion, l'aperçu de la langue
  // demandée restait sur l'ancien texte jusqu'à un rechargement complet —
  // exactement le symptôme que `95c97ff4b` avait corrigé pour la légende.

  describe('handleTranslationCompleted — diffusion temps réel de l\'index recomposé', () => {
    const emitsFor = (emitMock: jest.Mock, event: string) =>
      emitMock.mock.calls.filter(([name]: [string]) => name === event);

    it('diffuse post:translation-updated avec le texte recomposé', async () => {
      const { service, emitMock } = makeService({ post: derivedPost() });

      await service.handleTranslationCompleted({
        postId: 'post-1',
        textObjectIndex: 0,
        translations: { en: 'Hello' },
      });

      const emitted = emitsFor(emitMock, SERVER_EVENTS.POST_TRANSLATION_UPDATED);
      expect(emitted).toHaveLength(1);
      const [, payload] = emitted[0] as [string, { postId: string; language: string; translation: { text: string } }];
      expect(payload.postId).toBe('post-1');
      expect(payload.language).toBe('en');
      expect(payload.translation.text).toBe('Hello le monde');
    });

    it('diffuse aussi story:translation-updated — les deux événements sont distincts', async () => {
      const { service, emitMock } = makeService({ post: derivedPost() });

      await service.handleTranslationCompleted({
        postId: 'post-1',
        textObjectIndex: 0,
        translations: { en: 'Hello' },
      });

      expect(emitsFor(emitMock, SERVER_EVENTS.STORY_TRANSLATION_UPDATED)).toHaveLength(1);
    });

    it('ne diffuse rien pour le content quand la légende est une vraie source', async () => {
      const { service, emitMock } = makeService({
        post: derivedPost({ content: 'Ma légende à moi' }),
      });

      await service.handleTranslationCompleted({
        postId: 'post-1',
        textObjectIndex: 0,
        translations: { en: 'Hello' },
      });

      expect(emitsFor(emitMock, SERVER_EVENTS.POST_TRANSLATION_UPDATED)).toHaveLength(0);
      expect(emitsFor(emitMock, SERVER_EVENTS.STORY_TRANSLATION_UPDATED)).toHaveLength(1);
    });

    it('atteint la même audience que l\'événement overlay', async () => {
      const { service, io } = makeService({
        post: derivedPost({ visibility: 'ONLY', visibilityUserIds: ['viewer-9'] }),
      });

      await service.handleTranslationCompleted({
        postId: 'post-1',
        textObjectIndex: 0,
        translations: { en: 'Hello' },
      });

      const rooms = (io.to as jest.Mock).mock.calls.map(([r]: [string]) => r);
      expect(rooms).toContain(ROOMS.feed('author-1'));
      expect(rooms).toContain(ROOMS.feed('viewer-9'));
    });
  });
});
