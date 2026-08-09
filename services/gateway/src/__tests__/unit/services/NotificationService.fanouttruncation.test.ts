/**
 * Un fan-out tronqué doit se VOIR.
 *
 * `getStoryNotificationRecipients` borne chacun de ses trois seaux à 500 lignes
 * — commentateurs antérieurs, amis de l'auteur, réacteurs — pour tenir le coût
 * sur un post viral. La borne est légitime ; son silence ne l'est pas. Une fois
 * saturée, la liste rendue est INDISCERNABLE d'une liste complète : le seau
 * paraît entier, personne n'apprend que le 501e destinataire n'a jamais été
 * notifié, et le défaut ne se manifeste que comme « je n'ai rien reçu ».
 *
 * Le pendant existe côté `createFriendContentNotificationsBatch`, dont la borne
 * décide qui apprend la publication elle-même — et pour un auteur qui dépasse
 * durablement la borne, ce sont TOUJOURS les mêmes qui n'apprennent rien, le
 * tri étant `updatedAt desc`.
 *
 * Ce que ces tests exigent : la troncature est nommée dans le retour (pour que
 * l'appelant puisse en tenir compte) et consignée dans le log (pour qu'elle soit
 * observable en production).
 *
 * Le verdict se lit sur une LIGNE TÉMOIN : chaque requête prend `borne + 1`, et
 * la ligne excédentaire est comptée puis jetée — jamais notifiée. D'où les
 * fixtures à `FANOUT_ROW_CAP + 1` : « la requête a rendu autant de lignes que la
 * borne » ne suffit pas à conclure, puisqu'un seau de très exactement
 * `FANOUT_ROW_CAP` engagés est COMPLET. Le cas est verrouillé plus bas — sans
 * lui, un auteur à exactement 500 amis crierait au loup à chaque publication.
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
      count: jest.fn(),
      createMany: jest.fn(),
    },
    notificationPreference: { findUnique: jest.fn() },
    user: { findUnique: jest.fn(), findMany: jest.fn() },
    userPreferences: { findUnique: jest.fn() },
    post: { findUnique: jest.fn(), findFirst: jest.fn() },
    postComment: { findMany: jest.fn() },
    postReaction: { findMany: jest.fn() },
    postMedia: { findFirst: jest.fn() },
    friendRequest: { findMany: jest.fn() },
    communityMember: { findMany: jest.fn() },
    participant: { findMany: jest.fn() },
  };
  return { PrismaClient: jest.fn(() => mockPrisma) };
});

jest.mock('firebase-admin/app', () => ({
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(),
  cert: jest.fn(),
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
import { notificationLogger } from '../../../utils/logger-enhanced';

const AUTHOR_ID = '507f1f77bcf86cd799439001';
const COMMENTER_ID = '507f1f77bcf86cd799439002';
const POST_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';

/** La borne appliquée à chaque seau — la même valeur que le `take` des requêtes. */
const FANOUT_ROW_CAP = 500;

const idsOfLength = (count: number, prefix: string): string[] =>
  Array.from({ length: count }, (_, index) => `${prefix}${index}`);

describe('NotificationService — une troncature de fan-out est nommée et consignée', () => {
  let service: NotificationService;
  let prisma: any;

  beforeEach(() => {
    jest.clearAllMocks();

    prisma = new PrismaClient();
    service = new NotificationService(prisma);
    service.setSocketIO({ to: jest.fn().mockReturnThis(), emit: jest.fn() } as any, new Map());

    prisma.userPreferences.findUnique.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({ username: 'a', displayName: 'A', avatar: null });
    prisma.user.findMany.mockResolvedValue([]);
    prisma.postComment.findMany.mockResolvedValue([]);
    prisma.postReaction.findMany.mockResolvedValue([]);
    prisma.friendRequest.findMany.mockResolvedValue([]);
    prisma.communityMember.findMany.mockResolvedValue([]);
    prisma.participant.findMany.mockResolvedValue([]);
  });

  const warnedTruncations = () =>
    (notificationLogger.warn as jest.Mock).mock.calls.filter(
      ([message]) => typeof message === 'string' && message.toLowerCase().includes('tronqu')
    );

  describe('getStoryNotificationRecipients', () => {
    it('ne signale aucune troncature quand les seaux tiennent sous la borne', async () => {
      prisma.postComment.findMany.mockResolvedValue([{ authorId: 'u-1' }]);
      prisma.friendRequest.findMany.mockResolvedValue([
        { senderId: AUTHOR_ID, receiverId: 'u-2' },
      ]);

      const result = await service.getStoryNotificationRecipients(POST_ID, AUTHOR_ID, COMMENTER_ID);

      expect(result.truncatedBuckets).toEqual([]);
      expect(warnedTruncations()).toHaveLength(0);
    });

    // Le point exact où « complet » et « s'arrête à la borne » se touchent, et
    // où déduire la troncature du seul « autant de lignes que la borne » se
    // trompe : ces 500 engagés SONT toute l'audience du fil.
    it('ne signale rien quand un seau compte très exactement la borne', async () => {
      prisma.postComment.findMany.mockResolvedValue(
        idsOfLength(FANOUT_ROW_CAP, 'c-').map((authorId) => ({ authorId }))
      );

      const result = await service.getStoryNotificationRecipients(POST_ID, AUTHOR_ID, COMMENTER_ID);

      expect(result.truncatedBuckets).toEqual([]);
      expect(warnedTruncations()).toHaveLength(0);
      expect(result.previousCommenterIds).toHaveLength(FANOUT_ROW_CAP);
    });

    it('nomme le seau des commentateurs quand il sature la borne', async () => {
      prisma.postComment.findMany.mockResolvedValue(
        idsOfLength(FANOUT_ROW_CAP + 1, 'c-').map((authorId) => ({ authorId }))
      );

      const result = await service.getStoryNotificationRecipients(POST_ID, AUTHOR_ID, COMMENTER_ID);

      expect(result.truncatedBuckets).toContain('previousComments');
    });

    it('nomme le seau des amis, et celui des réacteurs, quand ils saturent', async () => {
      prisma.friendRequest.findMany.mockResolvedValue(
        idsOfLength(FANOUT_ROW_CAP + 1, 'f-').map((id) => ({ senderId: AUTHOR_ID, receiverId: id }))
      );
      prisma.postReaction.findMany.mockResolvedValue(
        idsOfLength(FANOUT_ROW_CAP + 1, 'r-').map((userId) => ({ userId }))
      );

      const result = await service.getStoryNotificationRecipients(POST_ID, AUTHOR_ID, COMMENTER_ID);

      expect(result.truncatedBuckets).toEqual(
        expect.arrayContaining(['friendRequests', 'reactors'])
      );
    });

    it('consigne la troncature avec le post et le seau concernés', async () => {
      prisma.postComment.findMany.mockResolvedValue(
        idsOfLength(FANOUT_ROW_CAP + 1, 'c-').map((authorId) => ({ authorId }))
      );

      await service.getStoryNotificationRecipients(POST_ID, AUTHOR_ID, COMMENTER_ID);

      const [, context] = warnedTruncations()[0] ?? [];
      expect(context).toEqual(
        expect.objectContaining({ postId: POST_ID, buckets: ['previousComments'], cap: FANOUT_ROW_CAP })
      );
    });
  });

  describe('createFriendContentNotificationsBatch', () => {
    it('consigne la troncature du graphe ami — ce sont toujours les mêmes qui n’apprennent rien', async () => {
      prisma.friendRequest.findMany.mockResolvedValue(
        idsOfLength(FANOUT_ROW_CAP + 1, 'f-').map((id) => ({ senderId: AUTHOR_ID, receiverId: id }))
      );
      prisma.notification.create.mockResolvedValue({
        id: 'n-1',
        type: 'friend_new_post',
        isRead: false,
        createdAt: new Date(),
      });

      await service.createFriendContentNotificationsBatch({
        postId: POST_ID,
        authorId: AUTHOR_ID,
        contentType: 'POST',
        excerpt: 'coucou',
        visibility: 'PUBLIC',
      });

      const [, context] = warnedTruncations()[0] ?? [];
      expect(context).toEqual(
        expect.objectContaining({ postId: POST_ID, authorId: AUTHOR_ID, cap: FANOUT_ROW_CAP })
      );
    });

    it('ne consigne rien quand le graphe ami tient sous la borne', async () => {
      prisma.friendRequest.findMany.mockResolvedValue([
        { senderId: AUTHOR_ID, receiverId: 'u-1' },
      ]);
      prisma.notification.create.mockResolvedValue({
        id: 'n-1',
        type: 'friend_new_post',
        isRead: false,
        createdAt: new Date(),
      });

      await service.createFriendContentNotificationsBatch({
        postId: POST_ID,
        authorId: AUTHOR_ID,
        contentType: 'POST',
        excerpt: 'coucou',
        visibility: 'PUBLIC',
      });

      expect(warnedTruncations()).toHaveLength(0);
    });
  });
});
