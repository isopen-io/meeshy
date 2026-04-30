/**
 * StoryTextObjectTranslationService
 * Handles the ZMQ response for story_text_object_translation_completed:
 * - Reads the Post from MongoDB
 * - Merges new translations into storyEffects.textObjects[n].translations
 * - Persists the updated storyEffects
 * - Broadcasts post:story-translation-updated to the author's feed room
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { Prisma } from '@meeshy/shared/prisma/client';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import type { StoryTranslationUpdatedEventData } from '@meeshy/shared/types/socketio-events';
import type { Server as SocketIOServer } from 'socket.io';
import { enhancedLogger } from '../../utils/logger-enhanced';

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

      // Read authorId to know which feed room to notify
      const post = await this.prisma.post.findUnique({
        where: { id: postId },
        select: { authorId: true },
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

      this.io.to(ROOMS.feed(post.authorId)).emit(SERVER_EVENTS.STORY_TRANSLATION_UPDATED, eventData);

    } catch (err: unknown) {
      log.error('handleTranslationCompleted failed', err, { postId, textObjectIndex });
    }
  }
}
