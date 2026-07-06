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
    findMany: jest.fn().mockResolvedValue([]),
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
      const createdAt = new Date('2026-06-23T09:00:00.000Z');
      await service.createPostCommentNotification({
        actorId: ACTOR_ID,
        postId: POST_ID,
        postAuthorId: RECIPIENT_ID,
        commentId: COMMENT_ID,
        commentPreview: 'Trop drôle !',
        postType: 'STATUS',
        postPreview: 'Journée de ouf au bureau',
        postCreatedAt: createdAt,
      });

      const payload = payloadOfType(mockIO, 'post_comment');
      expect(payload).toBeDefined();
      expect(payload.title).toBe('Bob Commentateur');
      expect(payload.subtitle).toBe('Votre statut : « Journée de ouf au bureau »');
      expect(payload.content).toBe('Trop drôle !');
      // postCreatedAt voyage en contexte → le client en dérive « du JJ/MM/AAAA HH:MM ».
      expect(payload.context.postCreatedAt).toBe(createdAt.toISOString());
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

  const createdDataOfType = (type: string): any | undefined =>
    prisma.notification.create.mock.calls
      .map((c: any[]) => c[0]?.data)
      .find((d: any) => d?.type === type);

  describe('createCommentReplyNotification', () => {
    it('persiste le titre « a répondu à votre commentaire » + sous-titre typé sur l\'entité (story)', async () => {
      await service.createCommentReplyNotification({
        actorId: ACTOR_ID,
        postId: POST_ID,
        commentAuthorId: RECIPIENT_ID,
        commentId: COMMENT_ID,
        replyPreview: 'Complètement d\'accord',
        parentCommentPreview: 'Le meilleur resto de la ville',
        postType: 'STORY',
      });

      // Titre persisté (source unique liste/web) : corrige le bug « a commenté
      // votre publication » pour une réponse à un commentaire.
      const created = createdDataOfType('comment_reply');
      expect(created.title).toBe('Bob Commentateur a répondu à votre commentaire');
      // Sous-titre = l'ENTITÉ portant le commentaire (« Story »), le client y
      // append la date locale. Le body reste la réponse.
      expect(created.subtitle).toBe('Story');
      expect(payloadOfType(mockIO, 'comment_reply').content).toBe('Complètement d\'accord');
    });

    it('replie sur « Publication » quand le type de contenu n\'est pas précisé', async () => {
      await service.createCommentReplyNotification({
        actorId: ACTOR_ID,
        postId: POST_ID,
        commentAuthorId: RECIPIENT_ID,
        commentId: COMMENT_ID,
        replyPreview: 'Oui !',
      });

      expect(createdDataOfType('comment_reply').subtitle).toBe('Publication');
    });

    it('porte commentId + parentCommentId en contexte ET metadata (navigation jusqu\'à la réponse)', async () => {
      const PARENT_COMMENT_ID = 'dddddddddddddddddddddddd';
      await service.createCommentReplyNotification({
        actorId: ACTOR_ID,
        postId: POST_ID,
        commentAuthorId: RECIPIENT_ID,
        commentId: COMMENT_ID,
        parentCommentId: PARENT_COMMENT_ID,
        replyPreview: 'Complètement d\'accord',
        parentCommentPreview: 'Le meilleur resto de la ville',
        postType: 'POST',
      });

      const created = createdDataOfType('comment_reply');
      // Contexte : le client ouvre le post (postId), déplie le fil du parent
      // (parentCommentId) puis défile/surligne la réponse (commentId).
      expect(created.context.postId).toBe(POST_ID);
      expect(created.context.commentId).toBe(COMMENT_ID);
      expect(created.context.parentCommentId).toBe(PARENT_COMMENT_ID);
      // Metadata : mêmes identifiants, pour le repli web/iOS qui lit metadata.
      expect(created.metadata.commentId).toBe(COMMENT_ID);
      expect(created.metadata.parentCommentId).toBe(PARENT_COMMENT_ID);
    });

    it('omet parentCommentId quand il n\'est pas fourni (réponse sans parent connu)', async () => {
      await service.createCommentReplyNotification({
        actorId: ACTOR_ID,
        postId: POST_ID,
        commentAuthorId: RECIPIENT_ID,
        commentId: COMMENT_ID,
        replyPreview: 'Oui !',
      });

      const created = createdDataOfType('comment_reply');
      expect(created.context.commentId).toBe(COMMENT_ID);
      expect(created.context.parentCommentId).toBeUndefined();
      expect(created.metadata.parentCommentId).toBeUndefined();
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

  // Réagir à un commentaire est le MÊME geste produit que « liker » un
  // commentaire — seul le transport diffère (socket `comment:reaction-add` →
  // type `comment_reaction` ; REST `POST .../like` → type `comment_like`). Les
  // deux DOIVENT honorer la même préférence `commentLikeEnabled`. Sinon un
  // destinataire ayant coupé les notifs de like-commentaire les reçoit quand
  // même par le chemin socket (le type `comment_reaction` retombait sur
  // `default: return true`).
  describe('createCommentReactionNotification — gating préférence', () => {
    it('respecte commentLikeEnabled:false (aucune notification émise)', async () => {
      prisma.userPreferences.findUnique.mockResolvedValue({
        notification: { commentLikeEnabled: false },
      });

      await service.createCommentReactionNotification({
        commentAuthorId: RECIPIENT_ID,
        reactorUserId: ACTOR_ID,
        commentId: COMMENT_ID,
        postId: POST_ID,
        reactionEmoji: '🔥',
        commentPreview: 'Mon avis sur la question',
      });

      expect(payloadOfType(mockIO, 'comment_reaction')).toBeUndefined();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it('émet quand la préférence est active (défaut produit)', async () => {
      prisma.userPreferences.findUnique.mockResolvedValue({
        notification: { commentLikeEnabled: true },
      });

      await service.createCommentReactionNotification({
        commentAuthorId: RECIPIENT_ID,
        reactorUserId: ACTOR_ID,
        commentId: COMMENT_ID,
        postId: POST_ID,
        reactionEmoji: '🔥',
        postType: 'REEL',
      });

      const payload = payloadOfType(mockIO, 'comment_reaction');
      expect(payload).toBeDefined();
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

    it('persiste postExpiresAt/postCreatedAt en contexte (story partagée expirée)', async () => {
      const createdAt = new Date('2026-06-20T10:00:00.000Z');
      const expiresAt = new Date('2026-06-21T10:00:00.000Z');
      await service.createPostRepostNotification({
        actorId: ACTOR_ID,
        originalPostId: POST_ID,
        postAuthorId: RECIPIENT_ID,
        repostId: 'cccccccccccccccccccccccc',
        postType: 'STORY',
        postCreatedAt: createdAt,
        postExpiresAt: expiresAt,
      });

      const ctx = prisma.notification.create.mock.calls[0][0].data.context;
      expect(ctx.postCreatedAt).toBe(createdAt.toISOString());
      expect(ctx.postExpiresAt).toBe(expiresAt.toISOString());
    });
  });

  describe('createPostLikeNotification — contexte expiry', () => {
    it('persiste postExpiresAt pour une réaction sur une story expirée', async () => {
      const expiresAt = new Date('2026-06-21T10:00:00.000Z');
      await service.createPostLikeNotification({
        actorId: ACTOR_ID,
        postId: POST_ID,
        postAuthorId: RECIPIENT_ID,
        emoji: '😍',
        postType: 'STORY',
        postPreview: 'Coucher de soleil',
        postExpiresAt: expiresAt,
      });

      const ctx = prisma.notification.create.mock.calls[0][0].data.context;
      expect(ctx.postExpiresAt).toBe(expiresAt.toISOString());
      const meta = prisma.notification.create.mock.calls[0][0].data.metadata;
      expect(meta.postPreview).toBe('Coucher de soleil');
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
});
