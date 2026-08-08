/**
 * Les deux lots de notification de mention respectent l'AUDIENCE du post.
 *
 * Tout le reste du domaine social filtre déjà : `createStoryCommentNotificationsBatch`
 * (`canSeePost`), `createFriendContentNotificationsBatch` (ONLY/EXCEPT/COMMUNITY),
 * `SocialEventsHandler.getVisibilityFilteredRecipients`,
 * `StoryTextObjectTranslationService.resolveBroadcastRecipients`. Les lots de
 * mention étaient les SEULS à ne pas le faire : nommer `@carol` dans un post
 * qu'elle n'a pas le droit de voir lui poussait un extrait de son contenu — sur
 * un écran verrouillé — et un lien de tap vers un post qui la refuserait.
 *
 * @jest-environment node
 */

jest.mock('isomorphic-dompurify', () => ({
  __esModule: true,
  default: {
    sanitize: (input: string) => input?.replace(/<[^>]*>/g, '') || '',
  },
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
    notificationPreference: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    userPreferences: {
      findUnique: jest.fn(),
    },
    friendRequest: {
      findMany: jest.fn(),
    },
    communityMember: {
      findMany: jest.fn(),
    },
  };

  return {
    PrismaClient: jest.fn(() => mockPrisma),
  };
});

jest.mock('firebase-admin/app', () => ({
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(),
  cert: jest.fn(),
}));
jest.mock('firebase-admin/messaging', () => ({
  getMessaging: jest.fn(() => ({ send: jest.fn().mockResolvedValue('message-id') })),
}));

jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(false),
  readFileSync: jest.fn(),
}));

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
const FRIEND_ID = '507f1f77bcf86cd799439002';
const STRANGER_ID = '507f1f77bcf86cd799439003';
const POST_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const COMMENT_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb';

describe('NotificationService — les mentions respectent l’audience du post', () => {
  let service: NotificationService;
  let prisma: any;

  beforeEach(() => {
    jest.clearAllMocks();

    prisma = new PrismaClient();
    service = new NotificationService(prisma);
    service.setSocketIO({ to: jest.fn().mockReturnThis(), emit: jest.fn() } as any, new Map());

    prisma.userPreferences.findUnique.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({
      username: 'author',
      displayName: 'Author',
      avatar: null,
    });
    prisma.user.findMany.mockResolvedValue([]);
    prisma.notification.create.mockResolvedValue({
      id: 'notif-1',
      type: 'user_mentioned',
      isRead: false,
      createdAt: new Date(),
    });
    // L'ami l'est dans les deux sens ; l'inconnu n'apparaît dans aucun lien.
    prisma.friendRequest.findMany.mockResolvedValue([
      { senderId: AUTHOR_ID, receiverId: FRIEND_ID },
    ]);
    prisma.communityMember.findMany.mockResolvedValue([]);
  });

  /** Les destinataires réellement notifiés, lus sur les écritures de notification. */
  const notifiedUserIds = (): string[] =>
    (prisma.notification.create.mock.calls as Array<[{ data: { userId: string } }]>).map(
      (call) => call[0].data.userId
    );

  describe('createPostMentionNotificationsBatch', () => {
    it('ne notifie PAS un inconnu nommé dans un post réservé aux amis', async () => {
      await service.createPostMentionNotificationsBatch({
        postId: POST_ID,
        posterId: AUTHOR_ID,
        mentionedUserIds: [FRIEND_ID, STRANGER_ID],
        postExcerpt: 'secret entre amis, coucou @stranger',
        visibility: 'FRIENDS',
      });

      expect(notifiedUserIds()).toEqual([FRIEND_ID]);
    });

    it('ne notifie PERSONNE sur un post PRIVATE', async () => {
      await service.createPostMentionNotificationsBatch({
        postId: POST_ID,
        posterId: AUTHOR_ID,
        mentionedUserIds: [FRIEND_ID, STRANGER_ID],
        postExcerpt: 'brouillon',
        visibility: 'PRIVATE',
      });

      expect(notifiedUserIds()).toEqual([]);
    });

    it('ne notifie qu’un mentionné présent dans la liste blanche ONLY', async () => {
      await service.createPostMentionNotificationsBatch({
        postId: POST_ID,
        posterId: AUTHOR_ID,
        mentionedUserIds: [FRIEND_ID, STRANGER_ID],
        postExcerpt: 'pour toi seul',
        visibility: 'ONLY',
        visibilityUserIds: [STRANGER_ID],
      });

      expect(notifiedUserIds()).toEqual([STRANGER_ID]);
    });

    it('n’notifie pas un ami explicitement exclu par EXCEPT', async () => {
      await service.createPostMentionNotificationsBatch({
        postId: POST_ID,
        posterId: AUTHOR_ID,
        mentionedUserIds: [FRIEND_ID],
        postExcerpt: 'sauf toi',
        visibility: 'EXCEPT',
        visibilityUserIds: [FRIEND_ID],
      });

      expect(notifiedUserIds()).toEqual([]);
    });

    it('notifie un INCONNU nommé dans un post PUBLIC — un post public se lit par tous', async () => {
      await service.createPostMentionNotificationsBatch({
        postId: POST_ID,
        posterId: AUTHOR_ID,
        mentionedUserIds: [STRANGER_ID],
        postExcerpt: 'bravo @stranger',
        visibility: 'PUBLIC',
      });

      expect(notifiedUserIds()).toEqual([STRANGER_ID]);
      // Un post public n'a aucune raison d'interroger le graphe ami.
      expect(prisma.friendRequest.findMany).not.toHaveBeenCalled();
    });

    it('ne notifie personne quand le graphe d’audience est illisible', async () => {
      prisma.friendRequest.findMany.mockRejectedValue(new Error('mongo down'));

      await service.createPostMentionNotificationsBatch({
        postId: POST_ID,
        posterId: AUTHOR_ID,
        mentionedUserIds: [FRIEND_ID],
        postExcerpt: 'entre amis',
        visibility: 'FRIENDS',
      });

      expect(notifiedUserIds()).toEqual([]);
    });
  });

  describe('createCommentMentionNotificationsBatch', () => {
    it('ne notifie PAS un inconnu nommé dans un commentaire sur un post réservé aux amis', async () => {
      await service.createCommentMentionNotificationsBatch({
        commentId: COMMENT_ID,
        postId: POST_ID,
        commenterId: FRIEND_ID,
        postAuthorId: AUTHOR_ID,
        mentionedUserIds: [STRANGER_ID],
        commentExcerpt: 'regarde ça @stranger',
        visibility: 'FRIENDS',
      });

      expect(notifiedUserIds()).toEqual([]);
    });

    it('l’audience est celle du POST, pas celle du commentateur', async () => {
      // Le commentateur est un ami de l'auteur ; le mentionné aussi. Le graphe
      // interrogé doit être celui de l'AUTEUR du post — c'est lui qui a choisi
      // qui peut voir. Un graphe centré sur le commentateur admettrait des gens
      // que l'auteur n'a jamais autorisés.
      await service.createCommentMentionNotificationsBatch({
        commentId: COMMENT_ID,
        postId: POST_ID,
        commenterId: STRANGER_ID,
        postAuthorId: AUTHOR_ID,
        mentionedUserIds: [FRIEND_ID],
        commentExcerpt: 'coucou @friend',
        visibility: 'FRIENDS',
      });

      expect(notifiedUserIds()).toEqual([FRIEND_ID]);
      const where = prisma.friendRequest.findMany.mock.calls[0][0].where;
      expect(JSON.stringify(where)).toContain(AUTHOR_ID);
    });

    it('notifie normalement sur un post PUBLIC', async () => {
      await service.createCommentMentionNotificationsBatch({
        commentId: COMMENT_ID,
        postId: POST_ID,
        commenterId: FRIEND_ID,
        postAuthorId: AUTHOR_ID,
        mentionedUserIds: [STRANGER_ID],
        commentExcerpt: 'coucou @stranger',
        visibility: 'PUBLIC',
      });

      expect(notifiedUserIds()).toEqual([STRANGER_ID]);
    });

    it('ne notifie personne sur un post PRIVATE', async () => {
      await service.createCommentMentionNotificationsBatch({
        commentId: COMMENT_ID,
        postId: POST_ID,
        commenterId: AUTHOR_ID,
        postAuthorId: AUTHOR_ID,
        mentionedUserIds: [FRIEND_ID],
        commentExcerpt: 'note perso @friend',
        visibility: 'PRIVATE',
      });

      expect(notifiedUserIds()).toEqual([]);
    });
  });
});
