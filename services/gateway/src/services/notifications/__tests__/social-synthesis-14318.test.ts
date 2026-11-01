/**
 * #14318 — une notification de post, de commentaire ou de story décrit le
 * contenu par sa SYNTHÈSE (décision porteur du 2026-11-01, #14309), jamais par
 * son texte : ni dans le corps, ni dans le sous-titre, ni dans l'aperçu
 * persisté que l'inbox web relit. Une image ne voyage que par sa VIGNETTE.
 */
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/logger', () => require('../../../__tests__/helpers/notification-service-doubles').makeLoggerModule());
jest.mock('../../../utils/logger-enhanced', () =>
  require('../../../__tests__/helpers/notification-service-doubles').makeLoggerEnhancedModule()
);

import {
  createPostCommentNotification,
  createPostRepostNotification,
  createCommentReplyNotification,
  createCommentLikeNotification,
  createCommentReactionNotification,
} from '../builders/social-engagement';
import { createPostMentionNotificationsBatch } from '../fanout/post-mention';
import { createCommentMentionNotificationsBatch } from '../fanout/comment-mention';
import { createFriendContentNotificationsBatch } from '../fanout/friend-content';
import { reproduceEditedSubjectNotifications } from '../../posts/reproduceEditedSubjectNotifications';
import {
  AUTEUR, COMMENTATEUR, SANG, SANG_DU_COMMENTATEUR, POST, COMMENT, monde,
} from '../../../__tests__/helpers/circle-world';

const ACTOR = '6000000000000000000000f1';
const OWNER = '6000000000000000000000f2';
const POST_TEXT = 'Le coucher de soleil sur la baie hier soir était vraiment magnifique, je voulais vous le montrer';
const COMMENT_TEXT = 'Trop beau ce ciel';
const HD_URL = 'https://cdn.example/posts/photo-hd.jpg';
const THUMB_URL = 'https://cdn.example/posts/photo-thumb.jpg';

type Created = { content?: string; subtitle?: string; metadata?: Record<string, unknown>; context?: Record<string, unknown> };

function builderDeps(lang = 'fr', media: Record<string, unknown> | null = { mimeType: 'image/jpeg', fileUrl: HD_URL, thumbnailUrl: THUMB_URL }) {
  const created: Created[] = [];
  const deps = {
    prisma: {
      user: { findUnique: jest.fn(async () => ({ username: 'alice', displayName: 'Alice', avatar: null })) },
      post: {
        findUnique: jest.fn(async () => ({
          content: POST_TEXT, originalLanguage: 'fr', translations: null, storyEffects: null, deletedAt: null, expiresAt: null,
        })),
      },
      postMedia: { findFirst: jest.fn(async () => media) },
    },
    createNotification: jest.fn(async (params: Created) => { created.push(params); return { id: 'n' }; }),
    resolveRecipientLang: async () => lang,
    resolveRecipientPrism: async () => ({ lang, ordered: [lang] }),
    canNotifyAboutPost: async () => true,
    shouldCreateReactionNotification: () => true,
    truncateMessage: (m: string) => m,
    isConversationMutedFor: async () => false,
  };
  return { deps: deps as any, created };
}

const everything = (c: Created | undefined) => JSON.stringify(c ?? {});

describe('#14318 — commentaire et réponse : le corps dit la longueur du commentaire', () => {
  it('post_comment : corps « Petit message texte », sous-titre « Votre publication · Message texte · Image haute définition »', async () => {
    const { deps, created } = builderDeps();
    await createPostCommentNotification(deps, {
      actorId: ACTOR, postId: POST, postAuthorId: OWNER, commentId: COMMENT, commentPreview: COMMENT_TEXT,
    });

    expect(created[0]?.content).toBe('Petit message texte');
    expect(created[0]?.subtitle).toMatch(/ · Message texte · Image haute définition$/);
    expect(created[0]?.metadata?.commentPreview).toBe('Petit message texte');
    expect(created[0]?.metadata?.postPreview).toBe('Message texte');
    expect(everything(created[0])).not.toContain('Trop beau');
    expect(everything(created[0])).not.toContain('coucher de soleil');
  });

  it('comment_reply : le commentaire parent aussi se dit par sa synthèse', async () => {
    const { deps, created } = builderDeps();
    await createCommentReplyNotification(deps, {
      actorId: ACTOR, postId: POST, commentAuthorId: OWNER, commentId: COMMENT,
      replyPreview: 'Merci', parentCommentPreview: COMMENT_TEXT,
    } as any);

    expect(created[0]?.content).toBe('Petit mot reçu');
    expect(created[0]?.metadata?.parentCommentPreview).toBe('Petit message texte');
    expect(everything(created[0])).not.toContain('Trop beau');
    expect(everything(created[0])).not.toContain('Merci');
  });

  it('la synthèse suit la langue de CADRAGE du destinataire', async () => {
    const { deps, created } = builderDeps('en');
    await createPostCommentNotification(deps, {
      actorId: ACTOR, postId: POST, postAuthorId: OWNER, commentId: COMMENT, commentPreview: COMMENT_TEXT,
    });

    expect(created[0]?.content).toBe('Short text message');
  });
});

describe('#14318 — réactions à un commentaire : le commentaire visé se dit par sa synthèse', () => {
  it('comment_like : corps sans guillemets ni texte', async () => {
    const { deps, created } = builderDeps();
    await createCommentLikeNotification(deps, {
      actorId: ACTOR, postId: POST, commentAuthorId: OWNER, commentId: COMMENT, emoji: '❤️', commentPreview: COMMENT_TEXT,
    } as any);

    expect(created[0]?.content).toBe('Petit message texte');
    expect(everything(created[0])).not.toContain('Trop beau');
  });

  it('comment_reaction : sous-titre et aperçu persisté sont la synthèse', async () => {
    const { deps, created } = builderDeps();
    await createCommentReactionNotification(deps, {
      commentAuthorId: OWNER, reactorUserId: ACTOR, commentId: COMMENT, postId: POST, reactionEmoji: '🔥', commentPreview: COMMENT_TEXT,
    });

    expect(created[0]?.subtitle).toBe('Petit message texte');
    expect(created[0]?.metadata?.commentPreview).toBe('Petit message texte');
    expect(everything(created[0])).not.toContain('Trop beau');
  });
});

describe('#14318 — republication : le post visé se dit par sa synthèse, son image par sa vignette', () => {
  it('post_repost : « Message texte · Image haute définition », jamais l’image HD', async () => {
    const { deps, created } = builderDeps();
    await createPostRepostNotification(deps, {
      actorId: ACTOR, repostId: '6000000000000000000000f9', originalPostId: POST, postAuthorId: OWNER,
    } as any);

    expect(created[0]?.content).toBe('Message texte · Image haute définition');
    expect(created[0]?.context?.firstAttachmentUrl).toContain('photo-thumb.jpg');
    expect(everything(created[0])).not.toContain('photo-hd.jpg');
  });

  it('une image SANS vignette ne voyage pas du tout', async () => {
    const { deps, created } = builderDeps('fr', { mimeType: 'image/jpeg', fileUrl: HD_URL, thumbnailUrl: null });
    await createPostRepostNotification(deps, {
      actorId: ACTOR, repostId: '6000000000000000000000f9', originalPostId: POST, postAuthorId: OWNER,
    } as any);

    expect(everything(created[0])).not.toContain('photo-hd.jpg');
    expect(created[0]?.content).toBe('Message texte · Image haute définition');
  });
});

describe('#14318 — éventails : mention et nouveau contenu d’un ami', () => {
  const contents = (m: ReturnType<typeof monde>) =>
    m.createNotification.mock.calls.map((call) => call[0] as unknown as Created);

  it('mention dans un post : la synthèse du post, jamais son texte', async () => {
    const m = monde();
    await createPostMentionNotificationsBatch(m.deps, {
      postId: POST, posterId: AUTEUR, mentionedUserIds: [SANG], postExcerpt: POST_TEXT, visibility: 'PUBLIC',
    });

    const sent = contents(m);
    expect(sent.length).toBeGreaterThan(0);
    for (const n of sent) {
      expect(n.content).toBe('Message texte');
      expect(n.metadata?.postPreview).toBe('Message texte');
      expect(everything(n)).not.toContain('coucher de soleil');
    }
  });

  it('mention dans un commentaire : la synthèse du commentaire', async () => {
    const m = monde();
    await createCommentMentionNotificationsBatch(m.deps, {
      commentId: COMMENT, postId: POST, commenterId: COMMENTATEUR, mentionedUserIds: [SANG_DU_COMMENTATEUR],
      commentExcerpt: COMMENT_TEXT, postAuthorId: AUTEUR, visibility: 'PUBLIC',
    });

    expect(contents(m).length).toBeGreaterThan(0);
    for (const n of contents(m)) {
      expect(n.content).toBe('Petit message texte');
      expect(everything(n)).not.toContain('Trop beau');
    }
  });

  it('nouveau post d’un ami : texte et média synthétisés', async () => {
    const m = monde();
    await createFriendContentNotificationsBatch(m.deps, {
      authorId: AUTEUR, postId: POST, contentType: 'POST', excerpt: POST_TEXT, mediaType: 'image', visibility: 'PUBLIC',
    } as any);

    expect(contents(m).length).toBeGreaterThan(0);
    for (const n of contents(m)) {
      expect(n.content).toBe('Message texte · Image haute définition');
      expect(n.metadata?.excerpt).toBe('Message texte');
      expect(everything(n)).not.toContain('coucher de soleil');
    }
  });
});

describe('#14318 — édition d’un commentaire : la synthèse se recalcule', () => {
  const rawRow = (over: Record<string, unknown>) => ({
    _id: { $oid: '6000000000000000000000aa' }, userId: { $oid: OWNER }, ...over,
  });
  const run = async (row: Record<string, unknown>, content: string) => {
    const update = jest.fn(async (_args: { where: { id: string }; data: Record<string, unknown> }) => ({}));
    const prisma = {
      $runCommandRaw: jest.fn(async () => ({ cursor: { firstBatch: [row] } })),
      notification: { update },
    };
    await reproduceEditedSubjectNotifications(prisma, { subject: { kind: 'comment', id: COMMENT }, content }, undefined);
    return update.mock.calls[0]?.[0]?.data;
  };

  it('une ligne de synthèse change de palier, dans sa langue', async () => {
    const data = await run(rawRow({
      content: 'Petit message texte',
      subtitle: null,
      metadata: { commentPreview: 'Petit message texte' },
    }), Array.from({ length: 40 }, (_, i) => `mot${i}`).join(' '));

    expect(data?.content).toBe('Long message texte');
    expect((data?.metadata as Record<string, unknown>)?.commentPreview).toBe('Long message texte');
  });

  it('une ligne d’AVANT la décision perd son texte au premier passage', async () => {
    const data = await run(rawRow({
      content: '« Trop beau ce ciel »',
      subtitle: null,
      metadata: { commentPreview: COMMENT_TEXT },
    }), 'Trop beau ce ciel corrigé');

    expect(data?.content).toBe('Message texte');
    expect(everything(data as Created)).not.toContain('Trop beau');
  });
});
