/**
 * Le témoin de MUTATION du découpage #7093 : chaque loi pure et chaque
 * éventail batch vit à UN endroit après extraction, et `NotificationService.ts`
 * ne réexporte plus rien — un ré-export laissé par erreur, ou une fonction pure
 * ajoutée demain dans la classe-fichier, le fait rougir.
 *
 * Écrit AVANT le découpage (#7093) : ROUGE tant que les modules `notification-
 * preview.ts`, `push-header.ts`, `post-media-thumbnail.ts` et `fanout/*.ts`
 * n'existent pas.
 *
 * @jest-environment node
 */
import * as attachmentProtection from '@meeshy/shared/utils/attachment-protection';

describe("frontières des modules de notifications (#7093)", () => {
  it("NotificationService.ts n'exporte plus que la classe", async () => {
    const legacy: Record<string, unknown> = await import('../NotificationService');
    expect(Object.keys(legacy).sort()).toEqual(['NotificationService']);
  });

  it('index.ts sert chaque loi pure par la RÉFÉRENCE de son module', async () => {
    const index: Record<string, unknown> = await import('../index');
    const preview: Record<string, unknown> = await import('../notification-preview');
    const pushHeader: Record<string, unknown> = await import('../push-header');
    const postMedia: Record<string, unknown> = await import('../post-media-thumbnail');

    const fromPreview = [
      'protectedPreview',
      'contentTypeIcon',
      'formatEphemeralDuration',
      'formatSingleAttachmentLabelI18n',
      'buildMessageNotificationBodyI18n',
      'truncateMessage',
      'buildOwnerSubtitleWithDetail',
      'targetPreviewBody',
      'mediaSummaryString',
      'maskedAttachment',
    ];
    for (const name of fromPreview) {
      expect(index[name]).toBe(preview[name]);
    }

    const fromPushHeader = ['pushCategoryForNotificationType', 'buildPushHeader', 'dedupePushSubtitle'];
    for (const name of fromPushHeader) {
      expect(index[name]).toBe(pushHeader[name]);
    }

    expect(index.resolvePostMedia).toBe(postMedia.resolvePostMedia);
  });

  it('chaque éventail est une fonction de son module', async () => {
    const storyComment = await import('../fanout/story-comment');
    const commentMention = await import('../fanout/comment-mention');
    const postMention = await import('../fanout/post-mention');
    const friendContent = await import('../fanout/friend-content');
    const memberJoined = await import('../fanout/member-joined');

    expect(typeof storyComment.getStoryNotificationRecipients).toBe('function');
    expect(typeof storyComment.createStoryCommentNotificationsBatch).toBe('function');
    expect(typeof commentMention.createCommentMentionNotificationsBatch).toBe('function');
    expect(typeof postMention.createPostMentionNotificationsBatch).toBe('function');
    expect(typeof friendContent.createFriendContentNotificationsBatch).toBe('function');
    expect(typeof memberJoined.createMemberJoinedNotificationsBatch).toBe('function');
    expect(typeof memberJoined.createMemberJoinedNotification).toBe('function');
  });

  it('maskedAttachment reste celle de @meeshy/shared', async () => {
    const preview: Record<string, unknown> = await import('../notification-preview');
    expect(preview.maskedAttachment).toBe(attachmentProtection.maskedAttachment);
  });
});
