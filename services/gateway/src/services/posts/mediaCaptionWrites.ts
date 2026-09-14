import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { applyMediaText } from './mediaText';
import { MediaCaptionTranslationService } from './MediaCaptionTranslationService';
import { enhancedLogger } from '../../utils/logger-enhanced';

const log = enhancedLogger.child({ module: 'mediaCaptionWrites' });

export type WrittenMediaCaption = { id: string; text: string | null };

/**
 * Écrit `PostMedia.caption` SANS déclencher la traduction (#6280).
 *
 * Séparée du déclenchement pour qu'un appelant repousse
 * `triggerMediaCaptionTranslations` APRÈS le commit de SA transaction
 * (`PostService.updatePost`). `triggerMediaCaptionTranslation` écrit
 * `captionLanguage`/`captionTranslations` via le client global, hors de tout
 * `tx` : l'appeler pendant qu'un `$transaction` tient encore le même document
 * `PostMedia` concurrence son verrou Mongo — ce que `triggerStoryTextTranslation`
 * évite déjà en n'étant jamais appelé depuis l'intérieur d'une transaction.
 */
export function writeMediaCaption(
  postId: string,
  requestedMediaIds: string[] | undefined,
  mediaCaption: Record<string, string> | undefined,
  client: Pick<PrismaClient, 'postMedia'>,
): Promise<WrittenMediaCaption[]> {
  return applyMediaText('caption', postId, requestedMediaIds, mediaCaption, client);
}

/**
 * Déclenche la traduction de chaque légende ÉCRITE — jamais de la carte brute
 * de la requête, qui peut nommer des médias étrangers qu'`applyMediaText` a
 * ignorés. Fire-and-forget, comme le reste du pipeline : la publication
 * n'attend pas le round-trip NLLB. Le `try/catch` couvre un service pas encore
 * initialisé (harnais de test sans `MeeshySocketIOManager`), comme
 * `routes/posts/publication.ts` le fait pour `PostTranslationService`.
 */
export function triggerMediaCaptionTranslations(written: WrittenMediaCaption[]): void {
  for (const { id, text } of written) {
    try {
      MediaCaptionTranslationService.shared.triggerMediaCaptionTranslation(id, text).catch((err: unknown) => {
        log.warn('MediaCaptionTranslation: trigger failed', { mediaId: id, err });
      });
    } catch {
      // MediaCaptionTranslationService pas encore initialisé — rien à déclencher
    }
  }
}
