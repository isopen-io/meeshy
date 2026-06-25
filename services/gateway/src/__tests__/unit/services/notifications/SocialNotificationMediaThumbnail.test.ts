/**
 * Détails média des notifications sociales (2026-06-25).
 *
 * Une réaction / un commentaire / un partage sur une publication, un réel ou
 * une story doit identifier QUEL contenu est visé — y compris quand le contenu
 * n'a PAS de texte (story photo). Le service résout alors le 1er média du post :
 *  - le sous-titre gagne un résumé média localisé (« Votre story · 📷 Photo ») ;
 *  - la metadata porte `mediaType` + `postThumbnailUrl` (vignette in-app) ;
 *  - le contexte porte `firstAttachmentUrl`/`firstAttachmentMimeType` (absolutisés)
 *    → l'extension iOS attache la miniature au push (UNNotificationAttachment).
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
const POST_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';

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
  conversation: { findUnique: jest.fn() },
  userPreferences: { findUnique: jest.fn().mockResolvedValue(null) },
  message: { findUnique: jest.fn() },
  postMedia: { findFirst: jest.fn().mockResolvedValue(null) },
}) as any;

const makeIO = () => ({
  to: jest.fn().mockReturnThis(),
  in: jest.fn().mockReturnThis(),
  fetchSockets: jest.fn().mockResolvedValue([]),
  emit: jest.fn(),
}) as any;

const createdDataOfType = (prisma: any, type: string): any | undefined =>
  prisma.notification.create.mock.calls
    .map((c: any[]) => c[0]?.data)
    .find((d: any) => d?.type === type);

const payloadOfType = (mockIO: any, type: string): any | undefined =>
  mockIO.emit.mock.calls
    .filter((c: any[]) => c[0] === SERVER_EVENTS.NOTIFICATION_NEW)
    .map((c: any[]) => c[1])
    .find((p: any) => p.type === type);

describe('Notifications sociales — vignette média du contenu visé', () => {
  let prisma: any;
  let mockIO: any;
  let service: NotificationService;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.API_PUBLIC_URL;
    prisma = makePrismaMock();
    mockIO = makeIO();
    service = new NotificationService(prisma);
    service.setSocketIO(mockIO);

    prisma.user.findUnique.mockImplementation(({ where }: any) =>
      Promise.resolve(
        where.id === ACTOR_ID
          ? { username: 'windie', displayName: 'Windie Nh', avatar: null }
          : { username: 'alice', displayName: 'Alice', avatar: null }
      )
    );
  });

  describe('createPostLikeNotification — story photo (sans texte)', () => {
    it('enrichit le sous-titre du résumé média + porte mediaType/postThumbnailUrl + push attachment', async () => {
      prisma.postMedia.findFirst.mockResolvedValue({
        mimeType: 'image/jpeg',
        fileUrl: '/api/v1/static/story-bg.jpg',
        thumbnailUrl: '/api/v1/static/story-bg-thumb.jpg',
      });

      await service.createPostLikeNotification({
        actorId: ACTOR_ID,
        postId: POST_ID,
        postAuthorId: RECIPIENT_ID,
        emoji: '❤️',
        postType: 'STORY',
      });

      const created = createdDataOfType(prisma, 'story_reaction');
      expect(created.subtitle).toBe('Votre story · 📷 Photo');
      expect(created.metadata.mediaType).toBe('image');
      // Image → on attache le fichier lui-même, absolutisé pour l'extension iOS.
      expect(created.metadata.postThumbnailUrl).toBe('https://gate.meeshy.me/api/v1/static/story-bg.jpg');
      expect(created.context.firstAttachmentUrl).toBe('https://gate.meeshy.me/api/v1/static/story-bg.jpg');
      expect(created.context.firstAttachmentMimeType).toBe('image/jpeg');
    });

    it('vidéo → vignette = miniature générée (image/jpeg), pas le fichier vidéo', async () => {
      prisma.postMedia.findFirst.mockResolvedValue({
        mimeType: 'video/mp4',
        fileUrl: 'https://cdn.meeshy.me/reel.mp4',
        thumbnailUrl: 'https://cdn.meeshy.me/reel-thumb.jpg',
      });

      await service.createPostLikeNotification({
        actorId: ACTOR_ID,
        postId: POST_ID,
        postAuthorId: RECIPIENT_ID,
        emoji: '🔥',
        postType: 'REEL',
      });

      const created = createdDataOfType(prisma, 'post_like');
      expect(created.subtitle).toBe('Votre réel · 🎬 Vidéo');
      expect(created.metadata.mediaType).toBe('video');
      expect(created.metadata.postThumbnailUrl).toBe('https://cdn.meeshy.me/reel-thumb.jpg');
      expect(created.context.firstAttachmentUrl).toBe('https://cdn.meeshy.me/reel-thumb.jpg');
      expect(created.context.firstAttachmentMimeType).toBe('image/jpeg');
    });

    it('texte présent : l\'extrait prime sur le résumé média dans le sous-titre', async () => {
      prisma.postMedia.findFirst.mockResolvedValue({
        mimeType: 'image/jpeg',
        fileUrl: 'https://cdn.meeshy.me/p.jpg',
        thumbnailUrl: null,
      });

      await service.createPostLikeNotification({
        actorId: ACTOR_ID,
        postId: POST_ID,
        postAuthorId: RECIPIENT_ID,
        emoji: '😍',
        postType: 'POST',
        postPreview: 'Mon plus beau voyage',
      });

      const payload = payloadOfType(mockIO, 'post_like');
      expect(payload.subtitle).toBe('Votre publication : « Mon plus beau voyage »');
      // La vignette voyage quand même (push + in-app).
      expect(payload.context.firstAttachmentUrl).toBe('https://cdn.meeshy.me/p.jpg');
      expect(payload.metadata.postThumbnailUrl).toBe('https://cdn.meeshy.me/p.jpg');
    });

    it('sans média ni texte : sous-titre = label nu (comportement historique préservé)', async () => {
      await service.createPostLikeNotification({
        actorId: ACTOR_ID,
        postId: POST_ID,
        postAuthorId: RECIPIENT_ID,
        emoji: '👍',
        postType: 'STORY',
      });

      const created = createdDataOfType(prisma, 'story_reaction');
      expect(created.subtitle).toBe('Votre story');
      expect(created.metadata.postThumbnailUrl).toBeUndefined();
      expect(created.context.firstAttachmentUrl).toBeUndefined();
    });
  });

  describe('createPostCommentNotification — post photo sans texte', () => {
    it('retombe sur le résumé média quand le post n\'a pas de texte + attache la vignette', async () => {
      prisma.postMedia.findFirst.mockResolvedValue({
        mimeType: 'image/png',
        fileUrl: '/uploads/photo.png',
        thumbnailUrl: null,
      });

      await service.createPostCommentNotification({
        actorId: ACTOR_ID,
        postId: POST_ID,
        postAuthorId: RECIPIENT_ID,
        commentId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
        commentPreview: 'Magnifique !',
        postType: 'POST',
      });

      const created = createdDataOfType(prisma, 'post_comment');
      expect(created.subtitle).toBe('Votre publication · 📷 Photo');
      expect(created.content).toBe('Magnifique !');
      expect(created.metadata.postThumbnailUrl).toBe('https://gate.meeshy.me/uploads/photo.png');
      expect(created.context.firstAttachmentUrl).toBe('https://gate.meeshy.me/uploads/photo.png');
    });
  });

  describe('résolution média défensive', () => {
    it('ne casse pas si le modèle postMedia est absent (retombe sur texte seul)', async () => {
      const bare = makePrismaMock();
      delete (bare as any).postMedia;
      bare.user.findUnique.mockResolvedValue({ username: 'windie', displayName: 'Windie Nh', avatar: null });
      const svc = new NotificationService(bare);
      svc.setSocketIO(mockIO);

      await svc.createPostLikeNotification({
        actorId: ACTOR_ID,
        postId: POST_ID,
        postAuthorId: RECIPIENT_ID,
        emoji: '❤️',
        postType: 'STORY',
      });

      const created = createdDataOfType(bare, 'story_reaction');
      expect(created.subtitle).toBe('Votre story');
      expect(created.metadata.mediaType).toBeUndefined();
    });
  });
});
