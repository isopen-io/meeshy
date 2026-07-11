/**
 * StoryTextObjectTranslationService
 * Handles the ZMQ response for story_text_object_translation_completed:
 * - Reads the Post from MongoDB
 * - Merges new translations into storyEffects.textObjects[n].translations
 * - Persists the updated storyEffects
 * - Broadcasts story:translation-updated to the author's feed room
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { Prisma } from '@meeshy/shared/prisma/client';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import type { StoryTranslationUpdatedEventData } from '@meeshy/shared/types/socketio-events';
import type { Server as SocketIOServer } from 'socket.io';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { getCommunityCoMemberIds } from './communityVisibility';

const log = enhancedLogger.child({ module: 'StoryTextObjectTranslationService' });

type HandleTranslationCompletedParams = {
  postId: string;
  textObjectIndex: number;
  translations: Record<string, string>;
};

export class StoryTextObjectTranslationService {
  private static _shared: StoryTextObjectTranslationService | null = null;

  private constructor(
    private readonly prisma: PrismaClient,
    private readonly io: SocketIOServer,
  ) {}

  static init(prisma: PrismaClient, io: SocketIOServer): StoryTextObjectTranslationService {
    StoryTextObjectTranslationService._shared = new StoryTextObjectTranslationService(prisma, io);
    return StoryTextObjectTranslationService._shared;
  }

  static get shared(): StoryTextObjectTranslationService {
    if (!StoryTextObjectTranslationService._shared) {
      throw new Error('StoryTextObjectTranslationService not initialized — call StoryTextObjectTranslationService.init() first');
    }
    return StoryTextObjectTranslationService._shared;
  }

  /**
   * Called when the translator returns a story_text_object_translation_completed event.
   * Reads the post, merges the new translations into storyEffects.textObjects[n].translations,
   * persists and broadcasts to the author's feed room.
   */
  async handleTranslationCompleted(params: HandleTranslationCompletedParams): Promise<void> {
    const { postId, textObjectIndex, translations } = params;

    try {
      log.info('StoryTextObject translation completed — persisting', { postId, textObjectIndex });

      // Read post + author to know which feed rooms to notify (author + viewers
      // who can see this post per its visibility).
      const post = await this.prisma.post.findUnique({
        where: { id: postId },
        select: { authorId: true, visibility: true, visibilityUserIds: true },
      });

      if (!post) {
        log.warn('Post not found — skipping', { postId });
        return;
      }

      // Validate textObjectIndex — non-negative integer only, prevents `$inject`-style
      // tricks if a malicious translator response forges this field.
      if (!Number.isInteger(textObjectIndex) || textObjectIndex < 0 || textObjectIndex > 1000) {
        log.warn('rejected malformed textObjectIndex', { postId, textObjectIndex });
        return;
      }

      // Build $set fields for each translated language using MongoDB dot-notation.
      // Each language code is sanitized before interpolation to prevent field-path
      // injection via a compromised translator returning e.g. `"a.$set.foo"`.
      const setFields: Record<string, string> = {};
      for (const [lang, text] of Object.entries(translations)) {
        if (!/^[a-z]{2,5}$/.test(lang)) {
          log.warn('rejected malformed language code', { postId, textObjectIndex, lang });
          continue;
        }
        setFields[`storyEffects.textObjects.${textObjectIndex}.translations.${lang}`] = text;
      }
      if (Object.keys(setFields).length === 0) return;

      await (this.prisma as unknown as { $runCommandRaw: (cmd: Prisma.InputJsonObject) => Promise<unknown> }).$runCommandRaw({
        update: 'Post',
        updates: [{
          q: { _id: { $oid: postId } },
          u: { $set: setFields },
        }],
      });

      log.info('StoryTextObject translations persisted — broadcasting', { postId, textObjectIndex });

      const eventData: StoryTranslationUpdatedEventData = {
        postId,
        textObjectIndex,
        translations,
      };

      // Broadcast to both the author's feed room (so they see translations land
      // in their own composer/preview) AND to viewers who can see the post.
      // Previously only the author was notified, so live viewers stayed on the
      // untranslated text until they refreshed.
      const recipientIds = await this.resolveBroadcastRecipients(post.authorId, post.visibility, post.visibilityUserIds);
      for (const userId of recipientIds) {
        this.io.to(ROOMS.feed(userId)).emit(SERVER_EVENTS.STORY_TRANSLATION_UPDATED, eventData);
      }

    } catch (err: unknown) {
      log.error('handleTranslationCompleted failed', err, { postId, textObjectIndex });
    }
  }

  /// Returns the set of user IDs whose feed room should receive the translation
  /// update — author + visibility-filtered friends. Mirrors the broadcast logic
  /// of `SocialEventsHandler.getVisibilityFilteredRecipients` so live and cached
  /// viewers see the same content.
  private async resolveBroadcastRecipients(
    authorId: string,
    visibility: string,
    visibilityUserIds: string[],
  ): Promise<string[]> {
    const recipients = new Set<string>([authorId]);
    if (visibility === 'ONLY') {
      for (const id of visibilityUserIds) recipients.add(id);
      return [...recipients];
    }

    if (visibility === 'COMMUNITY') {
      for (const id of await getCommunityCoMemberIds(this.prisma, authorId)) recipients.add(id);
      return [...recipients];
    }

    // PRIVATE = draft / author-only. Mirrors `SocialEventsHandler.getVisibilityFilteredRecipients`
    // (`case 'PRIVATE': return []`). Without this guard the story falls through to the friend
    // fan-out below and leaks the translated overlay text to every friend of the author.
    if (visibility === 'PRIVATE') {
      return [...recipients];
    }

    try {
      const friendRequests = await this.prisma.friendRequest.findMany({
        where: { status: 'accepted', OR: [{ senderId: authorId }, { receiverId: authorId }] },
        select: { senderId: true, receiverId: true },
      });
      const friendIds = friendRequests.flatMap((fr) => [fr.senderId, fr.receiverId])
        .filter((id) => id !== authorId);
      const excluded = new Set(visibility === 'EXCEPT' ? visibilityUserIds : []);
      for (const id of friendIds) {
        if (!excluded.has(id)) recipients.add(id);
      }
    } catch {
      // Friend lookup failures degrade to author-only broadcast (safe default).
    }
    return [...recipients];
  }
}
