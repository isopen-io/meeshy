/**
 * L'extrait du POST porté par une notification sociale descend le Prisme du
 * DESTINATAIRE (#8731).
 *
 * Six bâtisseurs à destinataire nommé posent `metadata.postPreview` (et, pour
 * trois d'entre eux, le composent dans le corps ou le sous-titre) : réaction à
 * un post, commentaire, partage, réponse à un commentaire, like et réaction de
 * commentaire. Tous servaient `post.content` — la langue de l'AUTEUR.
 *
 * Les témoins de RANG se posent sur un rang AUTRE que le premier (leçon 261) :
 * au rang 1, la descente et un simple appariement au rang 1 rendent le même
 * verdict, donc le témoin ne pourrait pas tomber.
 *
 * @jest-environment node
 */
import { NotificationService } from '../../../../services/notifications/NotificationService';

jest.mock('../../../../utils/logger-enhanced', () => ({
  notificationLogger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
  securityLogger: { logViolation: jest.fn() },
}));

const ACTOR_ID = '507f1f77bcf86cd799439011';
const RECIPIENT_ID = '507f1f77bcf86cd799439012';
const POST_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const COMMENT_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb';

const ORIGINAL = 'Launch day for the new version';
const FRENCH = 'Jour de lancement de la nouvelle version';
const SPANISH = 'Día de lanzamiento de la nueva versión';

type PostRow = {
  content: string | null;
  originalLanguage: string | null;
  translations: unknown;
  deletedAt: Date | null;
  expiresAt: Date | null;
};

const livePost = (overrides: Partial<PostRow> = {}): PostRow => ({
  content: ORIGINAL,
  originalLanguage: 'en',
  translations: {
    fr: { text: FRENCH, translationModel: 'medium', createdAt: new Date('2026-09-01') },
    es: { text: SPANISH, translationModel: 'medium', createdAt: new Date('2026-09-01') },
  },
  deletedAt: null,
  expiresAt: null,
  ...overrides,
});

type RecipientPrism = {
  systemLanguage?: string | null;
  regionalLanguage?: string | null;
  customDestinationLanguage?: string | null;
  deviceLocale?: string | null;
};

const makeHarness = (params: { post: PostRow | null | Error; recipient: RecipientPrism }) => {
  const created: Array<Record<string, any>> = [];
  const prisma: any = {
    notification: {
      create: jest.fn().mockImplementation((args: any) => {
        created.push(args.data);
        return { id: `notif_${created.length}`, ...args.data };
      }),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
    },
    user: {
      findUnique: jest.fn().mockImplementation(({ where }: any) =>
        Promise.resolve(
          where.id === ACTOR_ID
            ? { username: 'bob', displayName: 'Bob', avatar: null, systemLanguage: 'en' }
            : { username: 'alice', displayName: 'Alice', avatar: null, ...params.recipient }
        )
      ),
      findMany: jest.fn().mockResolvedValue([]),
    },
    post: {
      findFirst: jest.fn().mockResolvedValue({ authorId: 'post-author', visibility: 'PUBLIC', visibilityUserIds: [] }),
      findUnique: jest.fn().mockImplementation(() =>
        params.post instanceof Error ? Promise.reject(params.post) : Promise.resolve(params.post)
      ),
    },
    postMedia: { findFirst: jest.fn().mockResolvedValue(null) },
    userPreferences: { findUnique: jest.fn().mockResolvedValue(null) },
    conversation: { findUnique: jest.fn() },
    message: { findUnique: jest.fn() },
    postComment: { findMany: jest.fn().mockResolvedValue([]) },
    postReaction: { findMany: jest.fn().mockResolvedValue([]) },
    friendRequest: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const service = new NotificationService(prisma);
  service.setSocketIO({
    to: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    fetchSockets: jest.fn().mockResolvedValue([]),
    emit: jest.fn(),
  } as any);
  const createdOfType = (type: string) => created.find((d) => d.type === type);
  return { service, prisma, createdOfType };
};

/** Prisme ['de', 'fr'] : rien en allemand, le français au RANG 2. */
const GERMAN_THEN_FRENCH: RecipientPrism = { systemLanguage: 'de', regionalLanguage: 'fr' };

const everySixBuilders = [
  {
    type: 'post_like',
    run: (s: NotificationService) =>
      s.createPostLikeNotification({ actorId: ACTOR_ID, postId: POST_ID, postAuthorId: RECIPIENT_ID, emoji: '❤️' }),
  },
  {
    type: 'post_comment',
    run: (s: NotificationService) =>
      s.createPostCommentNotification({
        actorId: ACTOR_ID, postId: POST_ID, postAuthorId: RECIPIENT_ID, commentId: COMMENT_ID, commentPreview: 'Bravo',
      }),
  },
  {
    type: 'post_repost',
    run: (s: NotificationService) =>
      s.createPostRepostNotification({
        actorId: ACTOR_ID, originalPostId: POST_ID, postAuthorId: RECIPIENT_ID, repostId: 'cccccccccccccccccccccccc',
      }),
  },
  {
    type: 'comment_reply',
    run: (s: NotificationService) =>
      s.createCommentReplyNotification({
        actorId: ACTOR_ID, postId: POST_ID, commentAuthorId: RECIPIENT_ID, commentId: COMMENT_ID, replyPreview: 'Merci',
      }),
  },
  {
    type: 'comment_like',
    run: (s: NotificationService) =>
      s.createCommentLikeNotification({
        actorId: ACTOR_ID, postId: POST_ID, commentId: COMMENT_ID, commentAuthorId: RECIPIENT_ID, emoji: '🔥',
      }),
  },
  {
    type: 'comment_reaction',
    run: (s: NotificationService) =>
      s.createCommentReactionNotification({
        commentAuthorId: RECIPIENT_ID, reactorUserId: ACTOR_ID, commentId: COMMENT_ID, postId: POST_ID, reactionEmoji: '👏',
      }),
  },
] as const;

const allText = (data: Record<string, any> | undefined): string =>
  JSON.stringify({ content: data?.content, subtitle: data?.subtitle, metadata: data?.metadata });

describe('l’extrait du post d’une notification sociale descend le Prisme du destinataire (#8731)', () => {
  describe.each(everySixBuilders)('$type', ({ type, run }) => {
    it('sert la traduction du RANG 2 quand le rang 1 n’en a pas', async () => {
      const { service, createdOfType } = makeHarness({ post: livePost(), recipient: GERMAN_THEN_FRENCH });

      await run(service);

      const data = createdOfType(type);
      expect(data?.metadata?.postPreview).toBe(FRENCH);
      expect(allText(data)).not.toContain(ORIGINAL);
    });

    it('sert l’ORIGINAL quand sa langue précède toute traduction dans le prisme', async () => {
      const { service, createdOfType } = makeHarness({
        post: livePost(),
        recipient: { systemLanguage: 'de', regionalLanguage: 'en', customDestinationLanguage: 'fr' },
      });

      await run(service);

      expect(createdOfType(type)?.metadata?.postPreview).toBe(ORIGINAL);
    });

    it('un post SUPPRIMÉ ne fait partir aucun texte, ni original ni traduit', async () => {
      const { service, createdOfType } = makeHarness({
        post: livePost({ deletedAt: new Date('2026-09-29T10:00:00Z') }),
        recipient: GERMAN_THEN_FRENCH,
      });

      await run(service);

      const data = createdOfType(type);
      expect(data?.metadata ?? {}).not.toHaveProperty('postPreview');
      expect(allText(data)).not.toContain(ORIGINAL);
      expect(allText(data)).not.toContain(FRENCH);
      expect(allText(data)).not.toContain(SPANISH);
    });

    it('un post EXPIRÉ ne fait partir aucun texte', async () => {
      const { service, createdOfType } = makeHarness({
        post: livePost({ expiresAt: new Date(Date.now() - 60_000) }),
        recipient: GERMAN_THEN_FRENCH,
      });

      await run(service);

      const data = createdOfType(type);
      expect(data?.metadata ?? {}).not.toHaveProperty('postPreview');
      expect(allText(data)).not.toContain(ORIGINAL);
      expect(allText(data)).not.toContain(FRENCH);
    });

    it('une relecture en PANNE ne pousse aucun extrait (fail-closed)', async () => {
      const { service, createdOfType } = makeHarness({ post: new Error('mongo down'), recipient: GERMAN_THEN_FRENCH });

      await run(service);

      const data = createdOfType(type);
      expect(data?.metadata ?? {}).not.toHaveProperty('postPreview');
      expect(allText(data)).not.toContain(ORIGINAL);
    });
  });

  it('le CORPS de la réaction et sa métadonnée sont deux projections d’UNE descente', async () => {
    const { service, createdOfType } = makeHarness({ post: livePost(), recipient: GERMAN_THEN_FRENCH });

    await service.createPostLikeNotification({
      actorId: ACTOR_ID, postId: POST_ID, postAuthorId: RECIPIENT_ID, emoji: '❤️',
    });

    const data = createdOfType('post_like');
    expect(data?.content).toContain(FRENCH);
    expect(data?.metadata?.postPreview).toBe(FRENCH);
  });

  it('le SOUS-TITRE d’un commentaire cite le post dans la langue servie', async () => {
    const { service, createdOfType } = makeHarness({ post: livePost(), recipient: GERMAN_THEN_FRENCH });

    await service.createPostCommentNotification({
      actorId: ACTOR_ID, postId: POST_ID, postAuthorId: RECIPIENT_ID, commentId: COMMENT_ID, commentPreview: 'Bravo',
    });

    expect(createdOfType('post_comment')?.subtitle).toContain(FRENCH);
  });

  it('la locale APPAREIL (rang 4) élit sa traduction quand aucun rang in-app n’est servi', async () => {
    const { service, createdOfType } = makeHarness({
      post: livePost(),
      recipient: { systemLanguage: 'de', deviceLocale: 'es-ES' },
    });

    await service.createCommentReplyNotification({
      actorId: ACTOR_ID, postId: POST_ID, commentAuthorId: RECIPIENT_ID, commentId: COMMENT_ID, replyPreview: 'Merci',
    });

    expect(createdOfType('comment_reply')?.metadata?.postPreview).toBe(SPANISH);
  });

  it('sans traduction dans le prisme, l’original est servi', async () => {
    const { service, createdOfType } = makeHarness({
      post: livePost({ translations: null }),
      recipient: GERMAN_THEN_FRENCH,
    });

    await service.createCommentLikeNotification({
      actorId: ACTOR_ID, postId: POST_ID, commentId: COMMENT_ID, commentAuthorId: RECIPIENT_ID, emoji: '🔥',
    });

    expect(createdOfType('comment_like')?.metadata?.postPreview).toBe(ORIGINAL);
  });

  it('une traduction longue est bornée comme l’original (80 points de code)', async () => {
    const long = 'é'.repeat(200);
    const { service, createdOfType } = makeHarness({
      post: livePost({ translations: { fr: { text: long } } }),
      recipient: GERMAN_THEN_FRENCH,
    });

    await service.createCommentReactionNotification({
      commentAuthorId: RECIPIENT_ID, reactorUserId: ACTOR_ID, commentId: COMMENT_ID, postId: POST_ID, reactionEmoji: '👏',
    });

    const served = createdOfType('comment_reaction')?.metadata?.postPreview as string;
    expect(Array.from(served.replace(/…$/, '')).length).toBeLessThanOrEqual(80);
    expect(served.startsWith('é')).toBe(true);
  });

  it('un post sans texte ne pose aucune clé postPreview', async () => {
    const { service, createdOfType } = makeHarness({
      post: livePost({ content: null, translations: null }),
      recipient: GERMAN_THEN_FRENCH,
    });

    await service.createCommentReplyNotification({
      actorId: ACTOR_ID, postId: POST_ID, commentAuthorId: RECIPIENT_ID, commentId: COMMENT_ID, replyPreview: 'Merci',
    });

    expect(createdOfType('comment_reply')?.metadata ?? {}).not.toHaveProperty('postPreview');
  });
});
