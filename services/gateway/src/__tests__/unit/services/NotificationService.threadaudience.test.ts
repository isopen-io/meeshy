/**
 * Les notifications à destinataire UNIQUE du fil respectent l'audience du post.
 *
 * Le cycle précédent a fermé la lecture et l'écriture du fil ; il restait les
 * notifications qui en découlent. `createCommentReplyNotification`,
 * `createCommentLikeNotification` et `createCommentReactionNotification`
 * poussent vers l'auteur d'un commentaire — quelqu'un qui A pu commenter, donc
 * qui était admis À CE MOMENT-LÀ. Rien ne garantit qu'il le soit encore : une
 * dés-amitié ou une édition de visibilité (`PUT /posts/:postId`) le sort de
 * l'audience sans toucher à son commentaire.
 *
 * Ce qui part alors sur son écran verrouillé n'est pas un simple ping :
 *  - la réponse porte un extrait du contenu d'un TIERS (`replyPreview`) et la
 *    vignette du post (`resolvePostMedia` → `firstAttachmentUrl`),
 *  - le like porte cette même vignette.
 *
 * @jest-environment node
 */

jest.mock('isomorphic-dompurify', () => ({
  __esModule: true,
  default: { sanitize: (input: string) => input?.replace(/<[^>]*>/g, '') || '' },
}));

jest.mock('../../../utils/sanitize', () => ({
  SecuritySanitizer: {
    sanitizeText: jest.fn((input: string) => input?.replace(/<[^>]*>/g, '') || ''),
    sanitizeUsername: jest.fn((input: string) => input?.replace(/[^a-zA-Z0-9_.-]/g, '').substring(0, 50) || ''),
    sanitizeURL: jest.fn(() => null),
    sanitizeJSON: jest.fn((input: unknown) => input),
    isValidNotificationType: jest.fn(() => true),
    isValidPriority: jest.fn(() => true),
  },
}));

jest.mock('@meeshy/shared/prisma/client', () => {
  const mockPrisma = {
    notification: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
      createMany: jest.fn(),
    },
    notificationPreference: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    user: { findUnique: jest.fn(), findMany: jest.fn() },
    userPreferences: { findUnique: jest.fn() },
    post: { findFirst: jest.fn(), findUnique: jest.fn() },
    postComment: { findFirst: jest.fn(), findUnique: jest.fn() },
    postMedia: { findFirst: jest.fn() },
    friendRequest: { findMany: jest.fn(), findFirst: jest.fn() },
    communityMember: { findMany: jest.fn(), findFirst: jest.fn() },
    participant: { findMany: jest.fn(), findFirst: jest.fn() },
  };
  return {
    PrismaClient: jest.fn(() => mockPrisma),
    // `postVisibility` importe `NOT_DELETED` depuis `postIncludes`, qui appelle
    // `Prisma.validator` au chargement du module — le double doit donc l'exposer.
    Prisma: { validator: () => (shape: unknown) => shape },
    PostVisibility: {
      PUBLIC: 'PUBLIC', PRIVATE: 'PRIVATE', FRIENDS: 'FRIENDS',
      ONLY: 'ONLY', EXCEPT: 'EXCEPT', COMMUNITY: 'COMMUNITY',
    },
  };
});

jest.mock('firebase-admin/app', () => ({
  getApps: jest.fn(() => []), initializeApp: jest.fn(), cert: jest.fn(),
}));
jest.mock('firebase-admin/messaging', () => ({
  getMessaging: jest.fn(() => ({ send: jest.fn().mockResolvedValue('message-id') })),
}));

jest.mock('fs', () => ({ existsSync: jest.fn().mockReturnValue(false), readFileSync: jest.fn() }));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  notificationLogger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
  securityLogger: { logViolation: jest.fn(), logAttempt: jest.fn(), logSuccess: jest.fn() },
}));

import { NotificationService } from '../../../services/notifications/NotificationService';
import { PrismaClient } from '@meeshy/shared/prisma/client';

const AUTHOR_ID = '507f1f77bcf86cd799439001';
const RECIPIENT_ID = '507f1f77bcf86cd799439002';
const ACTOR_ID = '507f1f77bcf86cd799439003';
const POST_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const COMMENT_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb';

describe('NotificationService — les notifications du fil suivent l’audience du post', () => {
  let service: NotificationService;
  let prisma: any;

  beforeEach(() => {
    jest.clearAllMocks();

    prisma = new PrismaClient();
    service = new NotificationService(prisma);
    service.setSocketIO({ to: jest.fn().mockReturnThis(), emit: jest.fn() } as any, new Map());

    prisma.userPreferences.findUnique.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({ username: 'actor', displayName: 'Actor', avatar: null });
    prisma.user.findMany.mockResolvedValue([]);
    prisma.notification.create.mockResolvedValue({
      id: 'notif-1', type: 'comment_reply', isRead: false, createdAt: new Date(),
    });
    // Une vignette existe : c'est elle qui ne doit PAS partir hors audience.
    prisma.postMedia.findFirst.mockResolvedValue({
      mimeType: 'image/jpeg', fileUrl: '/uploads/secret.jpg', thumbnailUrl: null,
    });
    prisma.friendRequest.findFirst.mockResolvedValue(null);
    prisma.friendRequest.findMany.mockResolvedValue([]);
    prisma.communityMember.findMany.mockResolvedValue([]);
    prisma.communityMember.findFirst.mockResolvedValue(null);
    prisma.participant.findMany.mockResolvedValue([]);
    prisma.participant.findFirst.mockResolvedValue(null);
    prisma.postComment.findUnique.mockResolvedValue({ authorId: RECIPIENT_ID, content: 'mon commentaire' });
  });

  /** Déclare l'audience du post que les gardes vont lire. */
  const givenPost = (visibility: string, visibilityUserIds: string[] = []) => {
    prisma.post.findFirst.mockResolvedValue({ authorId: AUTHOR_ID, visibility, visibilityUserIds });
    prisma.post.findUnique.mockResolvedValue({
      type: 'POST', author: { displayName: 'Author', username: 'author' },
    });
  };

  const notified = (): number => prisma.notification.create.mock.calls.length;

  // ─── comment_reply ──────────────────────────────────────────────────────────

  describe('createCommentReplyNotification', () => {
    it('ne pousse RIEN quand le destinataire n’est plus dans l’audience du post', async () => {
      givenPost('FRIENDS');

      await service.createCommentReplyNotification({
        actorId: ACTOR_ID,
        postId: POST_ID,
        commentAuthorId: RECIPIENT_ID,
        commentId: COMMENT_ID,
        replyPreview: 'contenu d’un tiers qui ne doit pas fuiter',
      });

      expect(notified()).toBe(0);
    });

    it('ne pousse RIEN sur un post devenu PRIVATE', async () => {
      givenPost('PRIVATE');

      await service.createCommentReplyNotification({
        actorId: ACTOR_ID,
        postId: POST_ID,
        commentAuthorId: RECIPIENT_ID,
        commentId: COMMENT_ID,
        replyPreview: 'secret',
      });

      expect(notified()).toBe(0);
    });

    it('pousse pour un destinataire resté ami', async () => {
      givenPost('FRIENDS');
      prisma.friendRequest.findFirst.mockResolvedValue({ id: 'fr-1' });

      await service.createCommentReplyNotification({
        actorId: ACTOR_ID,
        postId: POST_ID,
        commentAuthorId: RECIPIENT_ID,
        commentId: COMMENT_ID,
        replyPreview: 'bonne remarque',
      });

      expect(notified()).toBe(1);
    });

    it('pousse à l’auteur du post même sur son propre post PRIVATE', async () => {
      givenPost('PRIVATE');

      await service.createCommentReplyNotification({
        actorId: ACTOR_ID,
        postId: POST_ID,
        commentAuthorId: AUTHOR_ID,
        commentId: COMMENT_ID,
        replyPreview: 'note',
      });

      expect(notified()).toBe(1);
    });

    it('pousse sur un post PUBLIC sans interroger le graphe social', async () => {
      givenPost('PUBLIC');

      await service.createCommentReplyNotification({
        actorId: ACTOR_ID,
        postId: POST_ID,
        commentAuthorId: RECIPIENT_ID,
        commentId: COMMENT_ID,
        replyPreview: 'salut',
      });

      expect(notified()).toBe(1);
      expect(prisma.friendRequest.findFirst).not.toHaveBeenCalled();
    });

    it('REFUSE quand le post est introuvable — l’absence n’ouvre pas', async () => {
      prisma.post.findFirst.mockResolvedValue(null);

      await service.createCommentReplyNotification({
        actorId: ACTOR_ID,
        postId: POST_ID,
        commentAuthorId: RECIPIENT_ID,
        commentId: COMMENT_ID,
        replyPreview: 'orphelin',
      });

      expect(notified()).toBe(0);
    });

    it('ne lit même pas la vignette du post quand le destinataire est hors audience', async () => {
      givenPost('PRIVATE');

      await service.createCommentReplyNotification({
        actorId: ACTOR_ID,
        postId: POST_ID,
        commentAuthorId: RECIPIENT_ID,
        commentId: COMMENT_ID,
        replyPreview: 'secret',
      });

      expect(prisma.postMedia.findFirst).not.toHaveBeenCalled();
    });
  });

  // ─── comment_like ───────────────────────────────────────────────────────────

  describe('createCommentLikeNotification', () => {
    it('ne pousse RIEN — donc aucune vignette de post restreint — hors audience', async () => {
      givenPost('ONLY', [AUTHOR_ID]);

      await service.createCommentLikeNotification({
        actorId: ACTOR_ID,
        postId: POST_ID,
        commentId: COMMENT_ID,
        commentAuthorId: RECIPIENT_ID,
        emoji: '❤️',
      });

      expect(notified()).toBe(0);
      expect(prisma.postMedia.findFirst).not.toHaveBeenCalled();
    });

    it('pousse sur un post PUBLIC', async () => {
      givenPost('PUBLIC');

      await service.createCommentLikeNotification({
        actorId: ACTOR_ID,
        postId: POST_ID,
        commentId: COMMENT_ID,
        commentAuthorId: RECIPIENT_ID,
        emoji: '❤️',
      });

      expect(notified()).toBe(1);
    });
  });

  // ─── comment_reaction (chemin socket) ───────────────────────────────────────

  describe('createCommentReactionNotification', () => {
    it('ne pousse RIEN hors audience', async () => {
      givenPost('PRIVATE');

      await service.createCommentReactionNotification({
        commentAuthorId: RECIPIENT_ID,
        reactorUserId: ACTOR_ID,
        commentId: COMMENT_ID,
        postId: POST_ID,
        reactionEmoji: '👍',
      });

      expect(notified()).toBe(0);
    });

    it('pousse sur un post PUBLIC', async () => {
      givenPost('PUBLIC');

      await service.createCommentReactionNotification({
        commentAuthorId: RECIPIENT_ID,
        reactorUserId: ACTOR_ID,
        commentId: COMMENT_ID,
        postId: POST_ID,
        reactionEmoji: '👍',
      });

      expect(notified()).toBe(1);
    });
  });
});
