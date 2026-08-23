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
import type { PostTranslationUpdatedEventData } from '@meeshy/shared/types/post';
import type { ServerEmitIO } from '../../socketio/serverEmit';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { getCommunityCoMemberIds } from './communityVisibility';
import {
  composeStoryContentForLanguage,
  isContentDerivedFromTextObjects,
} from './storyContentComposition';
import { isCanvasV3, storyTranslatableTexts, translationSetPath } from './storyEffectsV3';

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
    private readonly io: ServerEmitIO,
  ) {}

  static init(prisma: PrismaClient, io: ServerEmitIO): StoryTextObjectTranslationService {
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
      // who can see this post per its visibility). `content` et `storyEffects`
      // servent à recomposer l'index dérivé (voir plus bas).
      const post = await this.prisma.post.findUnique({
        where: { id: postId },
        select: {
          authorId: true,
          visibility: true,
          visibilityUserIds: true,
          content: true,
          storyEffects: true,
        },
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

      // A7b (revue totale C6) — dans un document v3 les textes vivent dans
      // `scenes[].objects[kind=text]` : le chemin v1 `textObjects.$i` y est
      // MORT. `textObjectIndex` reste l'index PLAT de l'énumération des textes
      // (le contrat du trigger avec le translator) ; la persistance, elle,
      // cible l'objet par SON ID dans sa scène — une scène contient aussi des
      // objets non-texte, l'index plat n'y est pas un index d'objet.
      const docIsV3 = isCanvasV3(post.storyEffects);
      const targetObjectId = docIsV3
        ? storyTranslatableTexts(post.storyEffects)?.[textObjectIndex]?.id
        : undefined;
      if (docIsV3 && typeof targetObjectId !== 'string') {
        log.warn('v3 doc has no text object at this index — skipping', { postId, textObjectIndex });
        return;
      }

      // Build $set fields for each translated language using MongoDB dot-notation.
      // Each language code is sanitized before interpolation to prevent field-path
      // injection via a compromised translator returning e.g. `"a.$set.foo"`.
      const setFields: Record<string, Prisma.InputJsonValue> = {};
      const acceptedLanguages: string[] = [];
      for (const [lang, text] of Object.entries(translations)) {
        if (!/^[a-z]{2,5}$/.test(lang)) {
          log.warn('rejected malformed language code', { postId, textObjectIndex, lang });
          continue;
        }
        const path = docIsV3 && typeof targetObjectId === 'string'
          ? translationSetPath(post.storyEffects, targetObjectId, lang)
          : `storyEffects.textObjects.${textObjectIndex}.translations.${lang}`;
        if (!path) continue;
        setFields[path] = text;
        acceptedLanguages.push(lang);
      }
      if (Object.keys(setFields).length === 0) return;

      // Le `content` d'une story sans légende n'est qu'un index : la
      // concaténation des textes du canvas. Le laisser se faire traduire pour
      // lui-même en faisait une SECONDE source, qui divergeait de la première
      // dès que l'un des deux pipelines bronchait — six langues sur le
      // `content` et zéro sur les overlays, constaté en production le
      // 2026-07-27. On le recompose donc à partir des overlays, dans la MÊME
      // écriture que les traductions qui viennent d'arriver : un seul aller en
      // base, et jamais d'état où l'index dérive d'un canvas déjà modifié.
      const derivedFields = this.derivedContentFields({
        content: post.content,
        storyEffects: post.storyEffects,
        textObjectIndex,
        translations,
        languages: acceptedLanguages,
      });
      Object.assign(setFields, derivedFields);

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

      // L'index recomposé doit remonter par le MÊME canal que la légende
      // (`post:translation-updated`) : c'est lui qui alimente `story.translations`
      // en mémoire, donc l'aperçu de la feuille des langues du lecteur. Sans
      // cette diffusion, l'écriture atterrissait en base et le lecteur gardait
      // son ancien texte jusqu'à un rechargement complet — le symptôme que
      // `95c97ff4b` avait déjà corrigé pour la légende, reproduit à l'identique
      // sur l'index dérivé.
      for (const [field, value] of Object.entries(derivedFields)) {
        const language = field.slice('translations.'.length);
        const translation = value as { text: string; translationModel: string; confidenceScore: number; createdAt: string };
        const contentEvent: PostTranslationUpdatedEventData = { postId, language, translation };
        for (const userId of recipientIds) {
          this.io.to(ROOMS.feed(userId)).emit(SERVER_EVENTS.POST_TRANSLATION_UPDATED, contentEvent);
        }
      }

    } catch (err: unknown) {
      log.error('handleTranslationCompleted failed', err, { postId, textObjectIndex });
    }
  }

  /**
   * Champs `translations.<langue>` du post, recomposés depuis les overlays.
   *
   * Rien n'est produit si le `content` est une vraie légende d'auteur : elle
   * reste une source à part entière avec son propre pipeline. Seul l'index
   * dérivé — la concaténation des overlays — devient un assemblage.
   *
   * L'état des overlays utilisé est celui lu en base PLUS les traductions de
   * cet événement : exactement ce que l'écriture est en train de produire.
   */
  private derivedContentFields(params: {
    content: string | null;
    storyEffects: unknown;
    textObjectIndex: number;
    translations: Record<string, string>;
    languages: string[];
  }): Record<string, Prisma.InputJsonValue> {
    const { content, storyEffects, textObjectIndex, translations, languages } = params;

    // A7b — l'énumération v3/v1 est la MÊME que celle du trigger : le contrat
    // de l'index plat `textObjectIndex` tient d'un bout à l'autre du pipeline.
    const textObjects: unknown[] = [...(storyTranslatableTexts(storyEffects) ?? [])];
    if (!isContentDerivedFromTextObjects(content, textObjects)) return {};

    const target = textObjects[textObjectIndex] as Record<string, unknown> | undefined;
    if (!target) return {};
    textObjects[textObjectIndex] = {
      ...target,
      translations: { ...((target.translations ?? {}) as Record<string, unknown>), ...translations },
    };

    const fields: Record<string, Prisma.InputJsonValue> = {};
    const createdAt = new Date().toISOString();
    for (const lang of languages) {
      const composed = composeStoryContentForLanguage(textObjects, lang);
      if (!composed) continue;
      fields[`translations.${lang}`] = {
        text: composed,
        translationModel: 'story-text-objects',
        confidenceScore: 1,
        createdAt,
      };
    }
    return fields;
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
