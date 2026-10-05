import { NotificationService } from '../../../services/notifications/NotificationService';
import { NOTIFICATION_LANGUAGES } from '@meeshy/shared/utils/notification-strings';

/**
 * #9049 — une réaction se lit « a réagi 🔥 à votre message : « … » » : l'émoji
 * UNE fois, et le nom de l'acteur jamais dans le corps quand le titre le porte.
 *
 * La passerelle est le SEUL site qui compose la phrase de réaction ; aucun
 * client ne la complète d'un second émoji. Ce témoin tient donc la loi là où
 * elle naît, pour chaque producteur et chaque langue servie : ce qu'une liste,
 * un push ou une bannière rendent (titre, sous-titre, corps) porte l'émoji
 * exactement une fois.
 */

const EMOJI = '🔥';
const ACTOR = 'Grace Hopper';

function makeHarness(language: string) {
  const created: Array<{ title?: string | null; subtitle?: string | null; content: string }> = [];
  const prisma: any = {
    user: {
      findUnique: async ({ where }: any) => ({
        id: where.id, username: 'grace', displayName: ACTOR, avatar: null, systemLanguage: language,
      }),
      findMany: async ({ where }: any) =>
        (where.id.in as string[]).map((id) => ({ id, systemLanguage: language })),
    },
    conversation: { findUnique: async () => ({ title: 'Équipe', type: 'direct' }) },
    post: { findFirst: async () => ({ authorId: 'r', visibility: 'PUBLIC', visibilityUserIds: [] }) },
    userPreferences: { findUnique: async () => null },
    userConversationPreferences: { findMany: async () => [] },
    notification: {
      create: async (args: any) => { created.push(args.data); return { id: 'n1', ...args.data, createdAt: new Date() }; },
      count: async () => 0,
    },
    message: { findUnique: async () => ({ content: 'J’attends!', messageType: 'text', createdAt: new Date() }) },
  };
  return { svc: new NotificationService(prisma as any), created };
}

const occurrences = (text: string, needle: string): number => text.split(needle).length - 1;

const rendered = (row: { title?: string | null; subtitle?: string | null; content: string }): string =>
  [row.title, row.subtitle, row.content].filter((part): part is string => typeof part === 'string').join(' | ');

type Producer = { readonly name: string; readonly run: (svc: NotificationService) => Promise<unknown> };

const PRODUCERS: readonly Producer[] = [
  {
    name: 'message_reaction',
    run: (svc) => svc.createReactionNotification({
      messageAuthorId: 'r', reactorUserId: 'a', messageId: 'm', conversationId: 'cv', reactionEmoji: EMOJI,
    }),
  },
  {
    name: 'comment_reaction',
    run: (svc) => svc.createCommentReactionNotification({
      commentAuthorId: 'r', reactorUserId: 'a', commentId: 'c', postId: 'p',
      reactionEmoji: EMOJI, postAuthorName: 'Bob', postType: 'REEL', commentPreview: 'Superbe',
    }),
  },
  {
    name: 'comment_like',
    run: (svc) => svc.createCommentLikeNotification({
      actorId: 'a', postId: 'p', commentId: 'c', commentAuthorId: 'r', emoji: EMOJI, commentPreview: 'Superbe',
    }),
  },
  ...(['POST', 'STORY', 'STATUS', 'REEL'] as const).map((postType): Producer => ({
    name: `post_like ${postType}`,
    run: (svc) => svc.createPostLikeNotification({ actorId: 'a', postId: 'p', postAuthorId: 'r', emoji: EMOJI, postType }),
  })),
];

describe('#9049 — une réaction dit son émoji une seule fois', () => {
  describe.each(NOTIFICATION_LANGUAGES.map((language) => [language]))('langue %s', (language) => {
    it.each(PRODUCERS.map((producer) => [producer.name, producer]))('%s : l’émoji paraît exactement une fois', async (_name, producer) => {
      const { svc, created } = makeHarness(language);
      await producer.run(svc);
      expect(created).toHaveLength(1);
      expect(occurrences(rendered(created[0]), EMOJI)).toBe(1);
    });
  });

  it.each(NOTIFICATION_LANGUAGES.map((language) => [language]))(
    'message_reaction (%s) : le corps cite le message et ne nomme pas l’acteur — le titre de la bannière le porte',
    async (language) => {
      const { svc, created } = makeHarness(language);
      await svc.createReactionNotification({
        messageAuthorId: 'r', reactorUserId: 'a', messageId: 'm', conversationId: 'cv', reactionEmoji: EMOJI,
      });
      expect(created[0].content).toContain(EMOJI);
      expect(created[0].content).toContain('J’attends!');
      expect(created[0].content).not.toContain(ACTOR);
    },
  );
});
