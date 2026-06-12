/**
 * Précision des notifications sociales (2026-06-12).
 *
 * Chaque notification doit dire QUOI est arrivé et SUR QUOI ça porte :
 *  - commentaire / réponse à un commentaire → la cible voyage en `subtitle`
 *    (« Votre humeur : « … » », « En réponse à « … » ») ;
 *  - story / publication / humeur — fan-out typé (« Story de X »,
 *    « Nouvelle humeur ») au lieu d'un wording story hardcodé ;
 *  - partage (repost) typé (« a partagé votre story ») ;
 *  - un commentaire sur un post non-story ne déclenche PLUS le bucket auteur
 *    story_new_comment (double notification avec post_comment).
 *
 * Les assertions passent par le payload Socket.IO `notification:new`, qui
 * embarque le même couple `title`/`subtitle` que le push APN/FCM.
 *
 * @jest-environment node
 */
import { NotificationService } from '../../../../services/notifications/NotificationService';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

jest.mock('../../../../utils/logger-enhanced', () => ({
  notificationLogger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
  securityLogger: { logViolation: jest.fn() },
}));

const ACTOR_ID = '507f1f77bcf86cd799439011';
const RECIPIENT_ID = '507f1f77bcf86cd799439012';
const PREV_COMMENTER_ID = '507f1f77bcf86cd799439013';
const FRIEND_ID = '507f1f77bcf86cd799439014';
const POST_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const COMMENT_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb';

const makePrismaMock = () => ({
  notification: {
    create: jest.fn().mockImplementation((args: any) => ({ id: 'notif_emitted', ...args.data })),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  user: {
    findUnique: jest.fn(),
  },
  conversation: {
    findUnique: jest.fn(),
  },
  userPreferences: {
    findUnique: jest.fn().mockResolvedValue(null),
  },
  message: { findUnique: jest.fn() },
  postComment: { findMany: jest.fn().mockResolvedValue([]) },
  postReaction: { findMany: jest.fn().mockResolvedValue([]) },
  friendRequest: { findMany: jest.fn().mockResolvedValue([]) },
}) as any;

const makeIO = () => ({
  to: jest.fn().mockReturnThis(),
  in: jest.fn().mockReturnThis(),
  fetchSockets: jest.fn().mockResolvedValue([]),
  emit: jest.fn(),
}) as any;

const emittedPayloads = (mockIO: any): any[] =>
  mockIO.emit.mock.calls
    .filter((c: any[]) => c[0] === SERVER_EVENTS.NOTIFICATION_NEW)
    .map((c: any[]) => c[1]);

const payloadOfType = (mockIO: any, type: string): any | undefined =>
  emittedPayloads(mockIO).find((p) => p.type === type);

describe('Précision des notifications sociales — subtitle + wording typé', () => {
  let prisma: any;
  let mockIO: any;
  let service: NotificationService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrismaMock();
    mockIO = makeIO();
    service = new NotificationService(prisma);
    service.setSocketIO(mockIO);

    prisma.user.findUnique.mockImplementation(({ where }: any) =>
      Promise.resolve(
        where.id === ACTOR_ID
          ? { username: 'bob', displayName: 'Bob Commentateur', avatar: null }
          : { username: 'alice', displayName: 'Alice Autrice', avatar: null }
      )
    );
  });

  describe('createPostCommentNotification', () => {
    it('met la cible typée + extrait du post en subtitle, le commentaire en body', async () => {
      await service.createPostCommentNotification({
        actorId: ACTOR_ID,
        postId: POST_ID,
        postAuthorId: RECIPIENT_ID,
        commentId: COMMENT_ID,
        commentPreview: 'Trop drôle !',
        postType: 'STATUS',
        postPreview: 'Journée de ouf au bureau',
      });

      const payload = payloadOfType(mockIO, 'post_comment');
      expect(payload).toBeDefined();
      expect(payload.title).toBe('Bob Commentateur');
      expect(payload.subtitle).toBe('Votre statut : « Journée de ouf au bureau »');
      expect(payload.content).toBe('Trop drôle !');
    });

    it('retombe sur le label typé seul quand le post n\'a pas de texte', async () => {
      await service.createPostCommentNotification({
        actorId: ACTOR_ID,
        postId: POST_ID,
        postAuthorId: RECIPIENT_ID,
        commentId: COMMENT_ID,
        commentPreview: 'Magnifique photo',
        postType: 'POST',
      });

      expect(payloadOfType(mockIO, 'post_comment').subtitle).toBe('Votre publication');
    });

    it('défaut POST quand le type n\'est pas fourni (compat appels existants)', async () => {
      await service.createPostCommentNotification({
        actorId: ACTOR_ID,
        postId: POST_ID,
        postAuthorId: RECIPIENT_ID,
        commentId: COMMENT_ID,
        commentPreview: 'ok',
      });

      expect(payloadOfType(mockIO, 'post_comment').subtitle).toBe('Votre publication');
    });
  });

  describe('createCommentReplyNotification', () => {
    it('met le commentaire parent en subtitle (« En réponse à « … » »)', async () => {
      await service.createCommentReplyNotification({
        actorId: ACTOR_ID,
        postId: POST_ID,
        commentAuthorId: RECIPIENT_ID,
        commentId: COMMENT_ID,
        replyPreview: 'Complètement d\'accord',
        parentCommentPreview: 'Le meilleur resto de la ville',
      });

      const payload = payloadOfType(mockIO, 'comment_reply');
      expect(payload.subtitle).toBe('En réponse à « Le meilleur resto de la ville »');
      expect(payload.content).toBe('Complètement d\'accord');
    });

    it('retombe sur un libellé générique précis sans extrait parent', async () => {
      await service.createCommentReplyNotification({
        actorId: ACTOR_ID,
        postId: POST_ID,
        commentAuthorId: RECIPIENT_ID,
        commentId: COMMENT_ID,
        replyPreview: 'Oui !',
      });

      expect(payloadOfType(mockIO, 'comment_reply').subtitle).toBe('En réponse à votre commentaire');
    });
  });

  describe('createCommentLikeNotification', () => {
    it('wording « a réagi … à votre commentaire » + extrait du commentaire liké en subtitle', async () => {
      // comment_like est opt-in (défaut produit: false) — la préférence doit
      // être activée pour que la notification parte.
      prisma.userPreferences.findUnique.mockResolvedValue({
        notification: { commentLikeEnabled: true },
      });

      await service.createCommentLikeNotification({
        actorId: ACTOR_ID,
        postId: POST_ID,
        commentId: COMMENT_ID,
        commentAuthorId: RECIPIENT_ID,
        emoji: '🔥',
        commentPreview: 'Mon avis sur la question',
      });

      const payload = payloadOfType(mockIO, 'comment_like');
      expect(payload.content).toBe('a réagi 🔥 à votre commentaire');
      expect(payload.subtitle).toBe('« Mon avis sur la question »');
    });
  });

  describe('createPostRepostNotification', () => {
    it('wording typé « a partagé votre story » + extrait en subtitle', async () => {
      await service.createPostRepostNotification({
        actorId: ACTOR_ID,
        originalPostId: POST_ID,
        postAuthorId: RECIPIENT_ID,
        repostId: 'cccccccccccccccccccccccc',
        postType: 'STORY',
        postPreview: 'Coucher de soleil à Douala',
      });

      const payload = payloadOfType(mockIO, 'post_repost');
      expect(payload.content).toBe('a partagé votre story');
      expect(payload.subtitle).toBe('« Coucher de soleil à Douala »');
    });

    it('défaut « a partagé votre publication » sans type ni extrait', async () => {
      await service.createPostRepostNotification({
        actorId: ACTOR_ID,
        originalPostId: POST_ID,
        postAuthorId: RECIPIENT_ID,
        repostId: 'cccccccccccccccccccccccc',
      });

      const payload = payloadOfType(mockIO, 'post_repost');
      expect(payload.content).toBe('a partagé votre publication');
      expect(payload.subtitle).toBeUndefined();
    });
  });

  describe('createFriendContentNotificationsBatch — subtitle typé', () => {
    beforeEach(() => {
      prisma.friendRequest.findMany.mockResolvedValue([
        { senderId: ACTOR_ID, receiverId: FRIEND_ID },
      ]);
    });

    it('« Nouvelle humeur » en subtitle pour un MOOD avec extrait en body', async () => {
      await service.createFriendContentNotificationsBatch({
        postId: POST_ID,
        authorId: ACTOR_ID,
        contentType: 'MOOD',
        excerpt: 'Motivé comme jamais 💪',
      });

      const payload = payloadOfType(mockIO, 'friend_new_mood');
      expect(payload).toBeDefined();
      expect(payload.subtitle).toBe('Nouvelle humeur');
      expect(payload.content).toBe('Motivé comme jamais 💪');
    });

    it('« Nouvelle story » en subtitle pour une STORY sans texte', async () => {
      await service.createFriendContentNotificationsBatch({
        postId: POST_ID,
        authorId: ACTOR_ID,
        contentType: 'STORY',
      });

      const payload = payloadOfType(mockIO, 'friend_new_story');
      expect(payload.subtitle).toBe('Nouvelle story');
      expect(payload.content).toBe('a publié une nouvelle story');
    });
  });

  describe('createStoryCommentNotificationsBatch — subtitles + postType', () => {
    const baseParams = {
      postId: POST_ID,
      commentId: COMMENT_ID,
      storyAuthorId: RECIPIENT_ID,
      commenterId: ACTOR_ID,
      commentExcerpt: 'Super moment !',
    };

    beforeEach(() => {
      prisma.postComment.findMany.mockResolvedValue([{ authorId: PREV_COMMENTER_ID }]);
      prisma.friendRequest.findMany.mockResolvedValue([
        { senderId: RECIPIENT_ID, receiverId: FRIEND_ID },
      ]);
    });

    it('STORY : « Votre story » pour l\'auteur, « Story de X » pour thread et amis', async () => {
      await service.createStoryCommentNotificationsBatch(baseParams);

      expect(payloadOfType(mockIO, 'story_new_comment').subtitle).toBe('Votre story');
      expect(payloadOfType(mockIO, 'story_thread_reply').subtitle).toBe('Story de Alice Autrice');
      expect(payloadOfType(mockIO, 'friend_story_comment').subtitle).toBe('Story de Alice Autrice');
    });

    it('POST : le bucket auteur est sauté (post_comment notifie déjà l\'auteur) et le wording est « publication »', async () => {
      await service.createStoryCommentNotificationsBatch({
        ...baseParams,
        commentExcerpt: undefined,
        postType: 'POST',
      });

      expect(payloadOfType(mockIO, 'story_new_comment')).toBeUndefined();
      const thread = payloadOfType(mockIO, 'story_thread_reply');
      expect(thread.content).toBe('a répondu dans une publication');
      expect(thread.subtitle).toBe('Publication de Alice Autrice');
      expect(payloadOfType(mockIO, 'friend_story_comment').content).toBe('a commenté une publication');
    });

    it('STATUS : article masculin (« a répondu dans un statut »)', async () => {
      await service.createStoryCommentNotificationsBatch({
        ...baseParams,
        commentExcerpt: undefined,
        postType: 'STATUS',
      });

      expect(payloadOfType(mockIO, 'story_thread_reply').content).toBe('a répondu dans un statut');
      expect(payloadOfType(mockIO, 'story_thread_reply').subtitle).toBe('Statut de Alice Autrice');
    });
  });

  describe('type REEL — wording (fondation reels 2026-06-12)', () => {
    it('post_comment : subtitle « Votre reel »', async () => {
      await service.createPostCommentNotification({
        actorId: ACTOR_ID,
        postId: POST_ID,
        postAuthorId: RECIPIENT_ID,
        commentId: COMMENT_ID,
        commentPreview: 'Incroyable !',
        postType: 'REEL',
      });

      expect(payloadOfType(mockIO, 'post_comment').subtitle).toBe('Votre reel');
    });

    it('post_repost : « a partagé votre reel »', async () => {
      await service.createPostRepostNotification({
        actorId: ACTOR_ID,
        originalPostId: POST_ID,
        postAuthorId: RECIPIENT_ID,
        repostId: 'cccccccccccccccccccccccc',
        postType: 'REEL',
      });

      expect(payloadOfType(mockIO, 'post_repost').content).toBe('a partagé votre reel');
    });

    it('friend content : subtitle « Nouveau reel » + fallback « a publié un nouveau reel »', async () => {
      prisma.friendRequest.findMany.mockResolvedValue([
        { senderId: ACTOR_ID, receiverId: FRIEND_ID },
      ]);

      await service.createFriendContentNotificationsBatch({
        postId: POST_ID,
        authorId: ACTOR_ID,
        contentType: 'REEL',
      });

      const payload = payloadOfType(mockIO, 'friend_new_post');
      expect(payload).toBeDefined();
      expect(payload.subtitle).toBe('Nouveau reel');
      expect(payload.content).toBe('a publié un nouveau reel');
    });

    it('fan-out commentaire sur reel : « Reel de X » / « a répondu dans un reel »', async () => {
      prisma.postComment.findMany.mockResolvedValue([{ authorId: PREV_COMMENTER_ID }]);
      prisma.friendRequest.findMany.mockResolvedValue([]);

      await service.createStoryCommentNotificationsBatch({
        postId: POST_ID,
        commentId: COMMENT_ID,
        storyAuthorId: RECIPIENT_ID,
        commenterId: ACTOR_ID,
        postType: 'REEL',
      });

      const thread = payloadOfType(mockIO, 'story_thread_reply');
      expect(thread.content).toBe('a répondu dans un reel');
      expect(thread.subtitle).toBe('Reel de Alice Autrice');
    });
  });
});
