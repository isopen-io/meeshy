/**
 * Unit tests for PostReactionHandler
 * Covers: handleAddReaction, handleRemoveReaction, handleRequestSync,
 * handleJoinPost, handleLeavePost — auth guard, schema validation,
 * anonymous guard, rate limiting, service delegation, broadcast routing
 * (❤️ via SocialEventsHandler vs per-emoji via post room), and join/leave guards.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PostReactionHandler } from '../PostReactionHandler';
import type { Socket } from 'socket.io';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('@meeshy/shared/types/socketio-events', () => ({
  SERVER_EVENTS: {
    POST_REACTION_ADDED: 'post:reaction-added',
    POST_REACTION_REMOVED: 'post:reaction-removed',
    POST_LIKED: 'post:liked',
    POST_UNLIKED: 'post:unliked',
  },
  ROOMS: {
    post: (id: string) => `post:${id}`,
    feed: (id: string) => `feed:${id}`,
  },
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

jest.mock('../../../middleware/validation', () => ({
  validateSocketEvent: jest.fn((schema: unknown, data: unknown) => ({ success: true, data })),
}));

// var (not const/let) avoids TDZ when jest hoists the mock factory before imports.
// The factory assigns the shared object so that the module-level singleton created
// inside PostReactionHandler.ts gets the same reference we can mutate in tests.
var rateLimiterMockObj: { checkLimit: jest.MockedFunction<() => Promise<boolean>> };
jest.mock('../../../utils/socket-rate-limiter', () => {
  rateLimiterMockObj = { checkLimit: jest.fn<() => Promise<boolean>>().mockResolvedValue(true) };
  return { SocketRateLimiter: jest.fn(() => rateLimiterMockObj) };
});

jest.mock('../../../services/posts/postVisibility', () => ({
  // Module d'ACL entièrement doublé : ces suites portent sur le protocole du
  // handler (ACK, broadcast, idempotence, erreurs), pas sur l'audience — celle-ci
  // est couverte, avec le vrai module, par `src/__tests__/unit/socketio/*`.
  canUserViewPost: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
  canUserInteractWithPost: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
  canUserConsumePost: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
  loadPostAcl: jest.fn<() => Promise<unknown>>().mockResolvedValue({
    authorId: 'author-1', visibility: 'PUBLIC', visibilityUserIds: [],
  }),
  loadCommentPostAcl: jest.fn<() => Promise<unknown>>().mockResolvedValue({
    postId: 'post-1',
    post: { authorId: 'author-1', visibility: 'PUBLIC', visibilityUserIds: [] },
  }),
  // Repost simple → racine (tâche 9) : par défaut, PAS un repost — la cible
  // résolue est le post lui-même, avec le POST_ID passé par l'appelant. La
  // redirection vers la racine elle-même est couverte, avec le vrai module,
  // par `src/__tests__/unit/socketio/PostReactionHandler.test.ts`.
  resolveInteractionTarget: jest.fn<(_p: unknown, postId: string) => Promise<unknown>>()
    .mockImplementation((_prisma: unknown, postId: string) => Promise.resolve({
      id: postId, authorId: 'author-1', visibility: 'PUBLIC', visibilityUserIds: [],
      isQuote: false, repostOfId: null, originalRepostOfId: null,
    })),
  // `post:join`/`post:leave` (review task-9, important #1) : même passthrough
  // par défaut que `resolveInteractionTarget` ci-dessus — l'audience/la
  // redirection elles-mêmes restent couvertes par le vrai module dans
  // `src/__tests__/unit/socketio/PostReactionHandler.test.ts`.
  resolveConsumptionTarget: jest.fn<(_p: unknown, postId: string) => Promise<unknown>>()
    .mockImplementation((_prisma: unknown, postId: string) => Promise.resolve({
      id: postId, authorId: 'author-1', visibility: 'PUBLIC', visibilityUserIds: [],
      isQuote: false, repostOfId: null, originalRepostOfId: null,
    })),
}));

const { validateSocketEvent } = require('../../../middleware/validation');
const { resolveConsumptionTarget } = require('../../../services/posts/postVisibility');

// ─── Constants ───────────────────────────────────────────────────────────────

const SOCKET_ID = 'socket-post-abc';
const USER_ID = 'user-post-123';
const POST_ID = '507f191e810c19729de860ea';

// ─── Factories ───────────────────────────────────────────────────────────────

function makeSocket(id = SOCKET_ID): Socket {
  return {
    id,
    emit: jest.fn<any>(),
    join: jest.fn<any>().mockResolvedValue(undefined),
    leave: jest.fn<any>().mockResolvedValue(undefined),
    to: jest.fn<any>().mockReturnValue({ emit: jest.fn() }),
  } as unknown as Socket;
}

/**
 * Audience déclarée PUBLIC par défaut : réagir consulte désormais
 * `Post.visibility` via `loadPostAcl`. Les surcharges par test sont fusionnées
 * DANS `post` plutôt qu'à la place — sans quoi une surcharge portant sur
 * `findUnique` (contenu, agrégats) effacerait silencieusement la tranche ACL et
 * ferait échouer le test sur un refus d'audience qu'il n'énonce pas.
 */
function makePrisma(overrides: Record<string, any> = {}): PrismaClient {
  const base = {
    post: {
      findUnique: jest.fn<any>().mockResolvedValue({
        id: POST_ID,
        authorId: 'author-1',
        type: 'POST',
        likeCount: 5,
        reactionSummary: { '❤️': 5 },
        visibility: 'PUBLIC',
        visibilityUserIds: [],
        deletedAt: null,
      }),
      findFirst: jest.fn<any>().mockResolvedValue({
        authorId: 'author-1',
        visibility: 'PUBLIC',
        visibilityUserIds: [],
      }),
    },
  };
  return {
    ...base,
    ...overrides,
    post: { ...base.post, ...(overrides['post'] ?? {}) },
  } as unknown as PrismaClient;
}

function makePostReactionService(overrides: Record<string, any> = {}) {
  return {
    addReaction: jest.fn<any>().mockResolvedValue({ id: 'reaction-1', emoji: '👍' }),
    removeReaction: jest.fn<any>().mockResolvedValue(true),
    getPostReactions: jest.fn<any>().mockResolvedValue([]),
    createUpdateEvent: jest.fn<any>().mockResolvedValue({
      postId: POST_ID,
      userId: USER_ID,
      emoji: '👍',
      action: 'add',
    }),
    ...overrides,
  };
}

function makeSocialEvents() {
  return {
    broadcastPostLiked: jest.fn<any>().mockResolvedValue(undefined),
    broadcastPostUnliked: jest.fn<any>().mockResolvedValue(undefined),
  };
}

function makeNotificationService() {
  return {
    createPostLikeNotification: jest.fn<any>().mockResolvedValue(undefined),
  };
}

function makeIo() {
  const emit = jest.fn<any>();
  return {
    to: jest.fn<any>().mockReturnValue({ emit }),
    _emit: emit,
  };
}

function makeConnectedUsers() {
  const users = new Map<string, any>();
  users.set(USER_ID, {
    id: USER_ID,
    socketId: SOCKET_ID,
    isAnonymous: false,
    language: 'fr',
  });
  return users;
}

function makeSocketToUser() {
  const m = new Map<string, string>();
  m.set(SOCKET_ID, USER_ID);
  return m;
}

function buildHandler(overrides: Record<string, any> = {}) {
  const notificationService = overrides.notificationService ?? makeNotificationService();
  const postReactionService = makePostReactionService(overrides.postReactionService);
  const prisma = makePrisma(overrides.prisma);
  const io = makeIo();
  const connectedUsers = overrides.connectedUsers ?? makeConnectedUsers();
  const socketToUser = overrides.socketToUser ?? makeSocketToUser();
  const socialEvents = overrides.socialEvents ?? makeSocialEvents();

  const handler = new PostReactionHandler({
    io: io as any,
    prisma,
    notificationService: notificationService as any,
    postReactionService: postReactionService as any,
    connectedUsers,
    socketToUser,
    socialEvents: socialEvents as any,
  });

  return { handler, prisma, postReactionService, notificationService, socialEvents, io, connectedUsers, socketToUser };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('PostReactionHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    rateLimiterMockObj.checkLimit.mockReset();
    rateLimiterMockObj.checkLimit.mockResolvedValue(true);
    (validateSocketEvent as jest.Mock<any>).mockImplementation((_schema: unknown, data: unknown) => ({
      success: true,
      data,
    }));
    (resolveConsumptionTarget as jest.Mock<any>).mockImplementation((_prisma: unknown, postId: string) =>
      Promise.resolve({
        id: postId, authorId: 'author-1', visibility: 'PUBLIC', visibilityUserIds: [],
        isQuote: false, repostOfId: null, originalRepostOfId: null,
      }));
  });

  // ── handleAddReaction ────────────────────────────────────────────────────

  describe('handleAddReaction', () => {
    it('returns error when socket is unauthenticated', async () => {
      const { handler } = buildHandler({ socketToUser: new Map() });
      const callback = jest.fn<any>();

      await handler.handleAddReaction(makeSocket(), { postId: POST_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'User not authenticated' }));
    });

    it('returns error when schema validation fails', async () => {
      (validateSocketEvent as jest.Mock<any>).mockReturnValueOnce({ success: false, error: 'postId required' });
      const { handler } = buildHandler();
      const callback = jest.fn<any>();

      await handler.handleAddReaction(makeSocket(), { postId: '', emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith({ success: false, error: 'postId required' });
    });

    it('returns error for anonymous users (posts require registered users)', async () => {
      const anonymousUsers = new Map<string, any>();
      anonymousUsers.set(USER_ID, { id: USER_ID, socketId: SOCKET_ID, isAnonymous: true });
      const { handler } = buildHandler({ connectedUsers: anonymousUsers });
      const callback = jest.fn<any>();

      await handler.handleAddReaction(makeSocket(), { postId: POST_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Only registered users can react' }));
    });

    it('returns error when rate limit is exceeded', async () => {
      rateLimiterMockObj.checkLimit.mockResolvedValueOnce(false);
      const { handler } = buildHandler();
      const callback = jest.fn<any>();

      await handler.handleAddReaction(makeSocket(), { postId: POST_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Rate limit exceeded' }));
    });

    it('returns error when addReaction returns null', async () => {
      const { handler } = buildHandler({
        postReactionService: {
          addReaction: jest.fn<any>().mockResolvedValue(null),
          createUpdateEvent: jest.fn<any>().mockResolvedValue({}),
        },
      });
      const callback = jest.fn<any>();

      await handler.handleAddReaction(makeSocket(), { postId: POST_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Failed to add reaction' }));
    });

    it('calls callback with success and data on happy path', async () => {
      const updateEvent = { postId: POST_ID, userId: USER_ID, emoji: '👍', action: 'add' };
      const { handler } = buildHandler({
        postReactionService: {
          addReaction: jest.fn<any>().mockResolvedValue({ id: 'r1' }),
          createUpdateEvent: jest.fn<any>().mockResolvedValue(updateEvent),
          getPostReactions: jest.fn<any>().mockResolvedValue([]),
        },
      });
      const callback = jest.fn<any>();

      await handler.handleAddReaction(makeSocket(), { postId: POST_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith({ success: true, data: updateEvent });
    });

    it('routes ❤️ on POST type through SocialEventsHandler.broadcastPostLiked', async () => {
      const { handler, socialEvents } = buildHandler({
        prisma: {
          post: {
            findUnique: jest.fn<any>().mockResolvedValue({
              id: POST_ID,
              authorId: 'author-1',
              type: 'POST',
              likeCount: 6,
              reactionSummary: { '❤️': 6 },
              visibility: 'PUBLIC',
              visibilityUserIds: [],
              deletedAt: null,
            }),
          },
        },
        postReactionService: {
          addReaction: jest.fn<any>().mockResolvedValue({ id: 'r1' }),
          createUpdateEvent: jest.fn<any>().mockResolvedValue({ postId: POST_ID, emoji: '❤️', action: 'add', likeCount: 6 }),
          getPostReactions: jest.fn<any>().mockResolvedValue([]),
        },
      });
      const callback = jest.fn<any>();

      await handler.handleAddReaction(makeSocket(), { postId: POST_ID, emoji: '❤️' }, callback);

      expect(socialEvents.broadcastPostLiked).toHaveBeenCalled();
    });

    it('routes other emojis to post room directly (not social events)', async () => {
      const { handler, socialEvents, io } = buildHandler({
        prisma: {
          post: {
            findUnique: jest.fn<any>().mockResolvedValue({
              id: POST_ID,
              authorId: 'author-1',
              type: 'STORY',
              likeCount: 0,
              reactionSummary: {},
              visibility: 'PUBLIC',
              visibilityUserIds: [],
              deletedAt: null,
            }),
          },
        },
        postReactionService: {
          addReaction: jest.fn<any>().mockResolvedValue({ id: 'r1' }),
          createUpdateEvent: jest.fn<any>().mockResolvedValue({ postId: POST_ID, emoji: '🎉', action: 'add' }),
          getPostReactions: jest.fn<any>().mockResolvedValue([]),
        },
      });
      const callback = jest.fn<any>();

      await handler.handleAddReaction(makeSocket(), { postId: POST_ID, emoji: '🎉' }, callback);

      expect(socialEvents.broadcastPostLiked).not.toHaveBeenCalled();
      expect(io.to).toHaveBeenCalledWith(`post:${POST_ID}`);
    });

    it('returns error on service exception', async () => {
      const { handler } = buildHandler({
        postReactionService: {
          addReaction: jest.fn<any>().mockRejectedValue(new Error('db error')),
          createUpdateEvent: jest.fn<any>(),
        },
      });
      const callback = jest.fn<any>();

      await handler.handleAddReaction(makeSocket(), { postId: POST_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'db error' }));
    });

    it('returns generic error when thrown value is not an Error instance', async () => {
      const { handler } = buildHandler({
        postReactionService: {
          addReaction: jest.fn<any>().mockRejectedValue(null),
          createUpdateEvent: jest.fn<any>(),
        },
      });
      const callback = jest.fn<any>();

      await handler.handleAddReaction(makeSocket(), { postId: POST_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Failed to add reaction' }));
    });

    it('swallows notification rejection without propagating to caller', async () => {
      const failingNotificationService = {
        createPostLikeNotification: jest.fn<any>().mockRejectedValue(new Error('push down')),
      };
      const { handler } = buildHandler({
        notificationService: failingNotificationService,
        prisma: {
          post: {
            findUnique: jest.fn<any>().mockResolvedValue({
              id: POST_ID,
              authorId: 'author-1',
              type: 'STATUS',
              likeCount: 0,
              reactionSummary: {},
              visibility: 'PUBLIC',
              visibilityUserIds: [],
              deletedAt: null,
            }),
          },
        },
      });
      const callback = jest.fn<any>();

      await expect(handler.handleAddReaction(makeSocket(), { postId: POST_ID, emoji: '👍' }, callback)).resolves.toBeUndefined();
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    /**
     * Le lot de notification est DÉTACHÉ (fire-and-forget) : le `try/catch` de
     * `handleAddReaction` ne peut donc rien pour lui, et l'ACK de succès est
     * déjà parti. Si sa promesse rejette sans que personne ne l'écoute, Node 22
     * (`--unhandled-rejections=throw` par défaut) termine le PROCESS — soit
     * toutes les WebSockets de la gateway tombées pour un aléa DB sur un
     * chemin latéral.
     *
     * Le test au-dessus ne le prouve pas : il fait rejeter
     * `createPostLikeNotification`, qui est le SEUL appel du callee portant
     * déjà un `.catch`. Le `prisma.post.findUnique` qui le précède, lui, est
     * nu — c'est la moitié du callee qu'aucun témoin ne regardait, et c'est
     * elle qui rejette quand MongoDB bascule ou que le pool est saturé.
     *
     * Le témoin est donc l'événement `unhandledRejection` lui-même, et non la
     * valeur de retour : un `void` sur une promesse rejetée résout quand même
     * `handleAddReaction`. On sonde après deux tours de boucle, Node ne
     * signalant le rejet non traité qu'une fois la file de microtâches vidée.
     */
    it('n\'abandonne aucun rejet du lot de notification quand la lecture du post échoue', async () => {
      const { handler } = buildHandler({
        prisma: {
          post: {
            findUnique: jest.fn<any>().mockRejectedValue(new Error('replica set stepped down')),
          },
        },
      });
      const callback = jest.fn<any>();

      const unhandled: unknown[] = [];
      const onUnhandled = (reason: unknown) => { unhandled.push(reason); };
      process.on('unhandledRejection', onUnhandled);
      try {
        await handler.handleAddReaction(makeSocket(), { postId: POST_ID, emoji: '👍' }, callback);
        await new Promise((resolve) => setImmediate(resolve));
        await new Promise((resolve) => setImmediate(resolve));
      } finally {
        process.off('unhandledRejection', onUnhandled);
      }

      expect(unhandled).toEqual([]);
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('does not throw when no callback provided', async () => {
      const { handler } = buildHandler();

      await expect(handler.handleAddReaction(makeSocket(), { postId: POST_ID, emoji: '👍' })).resolves.toBeUndefined();
    });
  });

  // ── handleRemoveReaction ─────────────────────────────────────────────────

  describe('handleRemoveReaction', () => {
    it('returns error when socket is unauthenticated', async () => {
      const { handler } = buildHandler({ socketToUser: new Map() });
      const callback = jest.fn<any>();

      await handler.handleRemoveReaction(makeSocket(), { postId: POST_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'User not authenticated' }));
    });

    it('returns schema error when validation fails', async () => {
      (validateSocketEvent as jest.Mock<any>).mockReturnValueOnce({ success: false, error: 'postId required' });
      const { handler } = buildHandler();
      const callback = jest.fn<any>();

      await handler.handleRemoveReaction(makeSocket(), { postId: '', emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith({ success: false, error: 'postId required' });
    });

    it('returns error for anonymous users', async () => {
      const anonymousUsers = new Map<string, any>();
      anonymousUsers.set(USER_ID, { id: USER_ID, socketId: SOCKET_ID, isAnonymous: true });
      const { handler } = buildHandler({ connectedUsers: anonymousUsers });
      const callback = jest.fn<any>();

      await handler.handleRemoveReaction(makeSocket(), { postId: POST_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Only registered users can react' }));
    });

    it('is idempotent when removeReaction returns false (reaction already absent)', async () => {
      // Already gone (concurrent removal / retry / double-tap un-like) — reply
      // success so the client doesn't roll its optimistic un-like back.
      const { handler } = buildHandler({
        postReactionService: {
          removeReaction: jest.fn<any>().mockResolvedValue(false),
          createUpdateEvent: jest.fn<any>().mockResolvedValue({}),
        },
      });
      const callback = jest.fn<any>();

      await handler.handleRemoveReaction(makeSocket(), { postId: POST_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith({ success: true });
    });

    it('broadcasts removal via SocialEventsHandler for ❤️ on POST type', async () => {
      const { handler, socialEvents } = buildHandler({
        postReactionService: {
          removeReaction: jest.fn<any>().mockResolvedValue(true),
          createUpdateEvent: jest.fn<any>().mockResolvedValue({ postId: POST_ID, emoji: '❤️', action: 'remove' }),
          getPostReactions: jest.fn<any>().mockResolvedValue([]),
          addReaction: jest.fn<any>(),
        },
      });
      const callback = jest.fn<any>();

      await handler.handleRemoveReaction(makeSocket(), { postId: POST_ID, emoji: '❤️' }, callback);

      expect(socialEvents.broadcastPostUnliked).toHaveBeenCalled();
    });

    it('broadcasts removal to post room for non-heart emojis', async () => {
      const { handler, io } = buildHandler({
        prisma: {
          post: {
            findUnique: jest.fn<any>().mockResolvedValue({
              id: POST_ID,
              authorId: 'author-1',
              type: 'STORY',
              likeCount: 0,
              reactionSummary: {},
              visibility: 'PUBLIC',
              visibilityUserIds: [],
              deletedAt: null,
            }),
          },
        },
        postReactionService: {
          removeReaction: jest.fn<any>().mockResolvedValue(true),
          createUpdateEvent: jest.fn<any>().mockResolvedValue({ postId: POST_ID, emoji: '🎉', action: 'remove' }),
          getPostReactions: jest.fn<any>().mockResolvedValue([]),
          addReaction: jest.fn<any>(),
        },
      });
      const callback = jest.fn<any>();

      await handler.handleRemoveReaction(makeSocket(), { postId: POST_ID, emoji: '🎉' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
      expect(io.to).toHaveBeenCalledWith(`post:${POST_ID}`);
    });

    it('returns error on service exception', async () => {
      const { handler } = buildHandler({
        postReactionService: {
          removeReaction: jest.fn<any>().mockRejectedValue(new Error('remove failed')),
          createUpdateEvent: jest.fn<any>(),
        },
      });
      const callback = jest.fn<any>();

      await handler.handleRemoveReaction(makeSocket(), { postId: POST_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'remove failed' }));
    });

    it('does not throw when no callback provided on error', async () => {
      const { handler } = buildHandler({
        postReactionService: {
          removeReaction: jest.fn<any>().mockRejectedValue(new Error('boom')),
          createUpdateEvent: jest.fn<any>(),
        },
      });

      await expect(handler.handleRemoveReaction(makeSocket(), { postId: POST_ID, emoji: '👍' })).resolves.toBeUndefined();
    });
  });

  // ── handleRequestSync ────────────────────────────────────────────────────

  describe('handleRequestSync', () => {
    it('returns error when socket is unauthenticated', async () => {
      const { handler } = buildHandler({ socketToUser: new Map() });
      const callback = jest.fn<any>();

      await handler.handleRequestSync(makeSocket(), { postId: POST_ID }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'User not authenticated' }));
    });

    it('returns success with reaction list on happy path', async () => {
      const reactions = [{ emoji: '👍', count: 2, userReacted: false }];
      const { handler } = buildHandler({
        postReactionService: {
          addReaction: jest.fn<any>(),
          removeReaction: jest.fn<any>(),
          getPostReactions: jest.fn<any>().mockResolvedValue(reactions),
          createUpdateEvent: jest.fn<any>(),
        },
      });
      const callback = jest.fn<any>();

      await handler.handleRequestSync(makeSocket(), { postId: POST_ID }, callback);

      expect(callback).toHaveBeenCalledWith({ success: true, data: reactions });
    });

    it('returns error on service exception', async () => {
      const { handler } = buildHandler({
        postReactionService: {
          addReaction: jest.fn<any>(),
          removeReaction: jest.fn<any>(),
          getPostReactions: jest.fn<any>().mockRejectedValue(new Error('timeout')),
          createUpdateEvent: jest.fn<any>(),
        },
      });
      const callback = jest.fn<any>();

      await handler.handleRequestSync(makeSocket(), { postId: POST_ID }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'timeout' }));
    });

    // Synchroniser = LIRE l'état social du post. Même audience que `post:join`,
    // qui laisse entrer dans la room où ce même état est ensuite diffusé —
    // sinon la garde de la room ne borne rien : il suffit de demander l'état
    // directement au lieu de s'abonner. Les frères `handleAddReaction` /
    // `handleRemoveReaction` passent déjà par `resolveInteractionTarget`.
    it('denies sync when the post is not consumable by the viewer', async () => {
      const { handler, postReactionService } = buildHandler();
      const callback = jest.fn<any>();

      (resolveConsumptionTarget as jest.Mock<any>).mockResolvedValueOnce(null);

      await handler.handleRequestSync(makeSocket(), { postId: POST_ID }, callback);

      expect(postReactionService.getPostReactions).not.toHaveBeenCalled();
      // Refus indistinct — jamais de 403 qui confirmerait l'existence du post.
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Post not found' }));
    });

    // La redirection des reposts simples vaut ici comme partout ailleurs : la
    // vie sociale d'un repost simple est celle de sa RACINE, donc son état de
    // réactions aussi. Sans elle, ouvrir un repost rendait un état vide alors
    // que la racine porte les réactions — et le room-join, lui, redirigeait
    // déjà. Les deux doivent désigner le même post.
    it('syncs the resolved target (root) for a simple repost, not the raw id', async () => {
      const ROOT_ID = '507f191e810c19729de860cc';
      const { handler, postReactionService } = buildHandler();
      const callback = jest.fn<any>();

      (resolveConsumptionTarget as jest.Mock<any>).mockResolvedValueOnce({ id: ROOT_ID });

      await handler.handleRequestSync(makeSocket(), { postId: POST_ID }, callback);

      expect(postReactionService.getPostReactions).toHaveBeenCalledWith(
        expect.objectContaining({ postId: ROOT_ID }),
      );
    });
  });

  // ── handleJoinPost ───────────────────────────────────────────────────────

  describe('handleJoinPost', () => {
    it('returns error when socket is unauthenticated', async () => {
      const { handler } = buildHandler({ socketToUser: new Map() });
      const socket = makeSocket();
      const callback = jest.fn<any>();

      await handler.handleJoinPost(socket, { postId: POST_ID }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'User not authenticated' }));
      expect(socket.join).not.toHaveBeenCalled();
    });

    it('returns schema error when validation fails', async () => {
      (validateSocketEvent as jest.Mock<any>).mockReturnValueOnce({ success: false, error: 'postId required' });
      const { handler } = buildHandler();
      const socket = makeSocket();
      const callback = jest.fn<any>();

      await handler.handleJoinPost(socket, { postId: '' }, callback);

      expect(callback).toHaveBeenCalledWith({ success: false, error: 'postId required' });
      expect(socket.join).not.toHaveBeenCalled();
    });

    it('returns error when the post cannot be resolved (absent, deleted, or denied — refus indistinct)', async () => {
      // `post:join` route désormais par `resolveConsumptionTarget` (review
      // task-9, important #1) : absent/supprimé/refusé sont tous le même
      // `null` — jamais de code distinct qui divulguerait l'existence d'un
      // post restreint.
      (resolveConsumptionTarget as jest.Mock<any>).mockResolvedValueOnce(null);
      const { handler } = buildHandler();
      const socket = makeSocket();
      const callback = jest.fn<any>();

      await handler.handleJoinPost(socket, { postId: POST_ID }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Post not found' }));
      expect(socket.join).not.toHaveBeenCalled();
    });

    it('joins post room and calls callback with success on happy path', async () => {
      const { handler } = buildHandler();
      const socket = makeSocket();
      const callback = jest.fn<any>();

      await handler.handleJoinPost(socket, { postId: POST_ID }, callback);

      expect(socket.join).toHaveBeenCalledWith(`post:${POST_ID}`);
      expect(callback).toHaveBeenCalledWith({ success: true });
    });

    it('joins the RESOLVED target room (simple repost redirects to its root)', async () => {
      const ROOT_ID = 'root-post-1';
      (resolveConsumptionTarget as jest.Mock<any>).mockResolvedValueOnce({
        id: ROOT_ID, authorId: 'author-1', visibility: 'PUBLIC', visibilityUserIds: [],
        isQuote: false, repostOfId: null, originalRepostOfId: null,
      });
      const { handler } = buildHandler();
      const socket = makeSocket();
      const callback = jest.fn<any>();

      await handler.handleJoinPost(socket, { postId: POST_ID }, callback);

      expect(socket.join).toHaveBeenCalledWith(`post:${ROOT_ID}`);
      expect(socket.join).not.toHaveBeenCalledWith(`post:${POST_ID}`);
      expect(callback).toHaveBeenCalledWith({ success: true });
    });

    it('returns error on exception', async () => {
      (resolveConsumptionTarget as jest.Mock<any>).mockRejectedValueOnce(new Error('db error'));
      const { handler } = buildHandler();
      const socket = makeSocket();
      const callback = jest.fn<any>();

      await handler.handleJoinPost(socket, { postId: POST_ID }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'db error' }));
    });
  });

  // ── handleLeavePost ──────────────────────────────────────────────────────

  describe('handleLeavePost', () => {
    it('returns error when socket is unauthenticated', async () => {
      const { handler } = buildHandler({ socketToUser: new Map() });
      const socket = makeSocket();
      const callback = jest.fn<any>();

      await handler.handleLeavePost(socket, { postId: POST_ID }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'User not authenticated' }));
      expect(socket.leave).not.toHaveBeenCalled();
    });

    it('returns schema error when validation fails', async () => {
      (validateSocketEvent as jest.Mock<any>).mockReturnValueOnce({ success: false, error: 'postId required' });
      const { handler } = buildHandler();
      const socket = makeSocket();
      const callback = jest.fn<any>();

      await handler.handleLeavePost(socket, { postId: '' }, callback);

      expect(callback).toHaveBeenCalledWith({ success: false, error: 'postId required' });
    });

    it('leaves post room and calls callback with success on happy path', async () => {
      const { handler } = buildHandler();
      const socket = makeSocket();
      const callback = jest.fn<any>();

      await handler.handleLeavePost(socket, { postId: POST_ID }, callback);

      expect(socket.leave).toHaveBeenCalledWith(`post:${POST_ID}`);
      expect(callback).toHaveBeenCalledWith({ success: true });
    });

    it('leaves the RESOLVED target room (symmetric with handleJoinPost — simple repost redirects to its root)', async () => {
      const ROOT_ID = 'root-post-1';
      (resolveConsumptionTarget as jest.Mock<any>).mockResolvedValueOnce({
        id: ROOT_ID, authorId: 'author-1', visibility: 'PUBLIC', visibilityUserIds: [],
        isQuote: false, repostOfId: null, originalRepostOfId: null,
      });
      const { handler } = buildHandler();
      const socket = makeSocket();
      const callback = jest.fn<any>();

      await handler.handleLeavePost(socket, { postId: POST_ID }, callback);

      expect(socket.leave).toHaveBeenCalledWith(`post:${ROOT_ID}`);
      expect(socket.leave).not.toHaveBeenCalledWith(`post:${POST_ID}`);
      expect(callback).toHaveBeenCalledWith({ success: true });
    });

    it('falls back to the raw postId room when resolution fails — leave never errors on a stale ACL', async () => {
      (resolveConsumptionTarget as jest.Mock<any>).mockResolvedValueOnce(null);
      const { handler } = buildHandler();
      const socket = makeSocket();
      const callback = jest.fn<any>();

      await handler.handleLeavePost(socket, { postId: POST_ID }, callback);

      expect(socket.leave).toHaveBeenCalledWith(`post:${POST_ID}`);
      expect(callback).toHaveBeenCalledWith({ success: true });
    });

    it('does not throw when no callback provided', async () => {
      const { handler } = buildHandler();
      const socket = makeSocket();

      await expect(handler.handleLeavePost(socket, { postId: POST_ID })).resolves.toBeUndefined();
    });
  });
});
