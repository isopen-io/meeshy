import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { normalizeLanguageForDedup } from '@meeshy/shared/utils/language-normalize';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { detectContentLanguage } from '../../utils/content-language';
import { guardedTimeout } from '../../utils/guarded-timer';
import { ZMQSingleton } from '../ZmqSingleton';
import { translationTargetId } from '../zmq-translation/utils/zmq-helpers';
import { resolveServerTargetLanguages } from '../message-translation/serverTargetLanguages';

const log = enhancedLogger.child({ module: 'PostService' });

/**
 * `$runCommandRaw` n'est pas sur le client typé de ce schéma : l'écriture passe
 * par une commande brute pour poser un chemin de champ CALCULÉ
 * (`translations.<langue>`), que `prisma.post.update` ne sait pas exprimer.
 * Le `targetLanguage` est validé contre `/^[a-z]{2,5}$/` AVANT d'y entrer.
 */
const rawCommand = (prisma: PrismaClient) =>
  (command: unknown): Promise<unknown> =>
    (prisma as unknown as { $runCommandRaw: (cmd: unknown) => Promise<unknown> }).$runCommandRaw(command);

export type StoryContentTranslationParams = {
  readonly prisma: PrismaClient;
  readonly postId: string;
  readonly content: string;
  readonly authorId: string;
  /**
   * Une source EXPLICITE (la langue choisie en éditant un post) passe avant le
   * détecteur heuristique, qui ne devine qu'à partir de motifs de mots.
   */
  readonly sourceLanguageOverride?: string;
  /**
   * Les langues RÉELLES de l'audience de l'auteur. Passée en paramètre plutôt
   * que relue ici : c'est `PostService` qui détient cette résolution, et les
   * deux pipelines de story (contenu et `textObjects`) la partagent.
   */
  readonly resolveAudienceLanguages: (authorId: string) => Promise<string[]>;
};

/**
 * Traduit le CONTENU d'une story vers les langues de l'audience de son auteur,
 * et persiste chaque résultat dans `Post.translations.<langue>` au fur et à
 * mesure qu'il revient du bus ZMQ.
 *
 * Extrait de `PostService` (#16751) : le suivi des langues attendues porte sa
 * propre doctrine, et le fichier d'origine est hors budget de taille — on
 * extrait d'abord, on ajoute ensuite.
 */
export async function translateStoryContent(params: StoryContentTranslationParams): Promise<void> {
  const { postId, content, sourceLanguageOverride, authorId } = params;
  try {
    // An explicit source (e.g. the language chosen when editing a post) wins
    // over the heuristic detector, which only guesses from word patterns.
    const sourceLanguage = sourceLanguageOverride ?? detectContentLanguage(content);

    // 1. Résoudre les langues cibles depuis les contacts de l'auteur, hors
    // la langue source elle-même — même garde que le sibling
    // `triggerStoryTextObjectTranslation`. Sans elle, un auteur écrivant
    // dans une langue déjà parlée par (une partie de) son audience
    // déclenche un aller-retour NLLB source→source qui réécrit
    // `translations.<source>` avec une paraphrase de l'original au lieu de
    // le laisser intact. Une langue sans code NLLB-200 (#3659) ne se demande
    // ni ne s'attend : le jeu des langues attendues ne se viderait sinon
    // jamais, et l'écouteur resterait monté jusqu'au délai de 60 s.
    const allTargetLanguages = await params.resolveAudienceLanguages(authorId);
    const targetLanguages = resolveServerTargetLanguages(sourceLanguage, allTargetLanguages);

    if (targetLanguages.length === 0) {
      log.info('StoryTranslation: no target languages', { postId });
      return;
    }

    // 2. Obtenir le client ZMQ
    const zmqClient = ZMQSingleton.getInstanceSync();
    if (!zmqClient) {
      log.warn('StoryTranslation: ZMQ client not available', { postId });
      return;
    }

    const storyMessageId = translationTargetId('story', postId);

    log.info('StoryTranslation: sending ZMQ request', { postId, sourceLanguage, targetLanguages });

    // 3. Listener pour recevoir les résultats un par un
    //
    // Le suivi porte sur l'ENSEMBLE des langues encore attendues, jamais sur
    // un compteur d'événements (#16751). Le bus relaie les doublons par
    // conception — `ZmqTranslationClient.setupEventForwarding` émet la forme
    // scopée INCONDITIONNELLEMENT, et le deadman de `sendTranslationRequest`
    // redemande les langues manquantes sous le MÊME taskId — si bien qu'un
    // compteur atteignait sa cible une langue trop tôt et retirait
    // l'écouteur avant la dernière : `Post.translations.<langue>` n'était
    // jamais écrit, et son lecteur voyait la story dans la langue de
    // l'auteur pour toujours. Un `Set` dont on RETIRE la langue servie est
    // insensible au doublon, et insensible de même à un événement portant
    // une langue que cette story n'a pas demandée.
    //
    // Les deux côtés de la comparaison passent par la MÊME canonicalisation,
    // `normalizeLanguageForDedup` — la SSOT dont `resolveServerTargetLanguages`
    // ci-dessus sort déjà `targetLanguages`. Sans forme commune, une langue
    // servie ne se reconnaîtrait pas dans le jeu des langues attendues ; et
    // `resolveServerTargetLanguages` ne dédoublonne pas sa sortie, donc le
    // `Set` est aussi ce qui aligne le jeu attendu sur ce que
    // `ZmqRequestSender` demande réellement au translator (il dédoublonne).
    const outstandingLanguages = new Set(targetLanguages.map(normalizeLanguageForDedup));
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    // Subscribe to the per-messageId scoped event instead of the global
    // `translationCompleted`. Avoids O(active_stories × global_events) filter
    // overhead — previously every translation across the entire gateway
    // (messages, comments, etc.) fanned out to every active story listener
    // which then filtered by messageId. With 100 active stories and 1000
    // messages/min that was ~100k listener invocations/min.
    const scopedEvent = `translationCompleted:${storyMessageId}`;

    const removeListener = () => {
      zmqClient.off(scopedEvent, handleResult);
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
    };

    const handleResult = async (event: { taskId: string; result: { messageId: string; translatedText: string; confidenceScore?: number; translatorModel?: string }; targetLanguage: string; metadata: Record<string, unknown> }) => {
      // The scoped event guarantees messageId match, but keep the guard for
      // defense in depth (the event payload is reused).
      if (event.result.messageId !== storyMessageId) return;

      // Reject malformed `targetLanguage` before interpolating into the
      // raw Mongo `$set` field path. A value like `"a.b.$inject"` would
      // otherwise let a compromised translator write arbitrary fields.
      if (!/^[a-z]{2,5}$/.test(event.targetLanguage)) {
        log.warn('StoryTranslation: rejected malformed targetLanguage', { postId, targetLanguage: event.targetLanguage });
        return;
      }

      try {
        await rawCommand(params.prisma)({
          update: 'Post',
          updates: [{
            q: { _id: { $oid: postId }, originalLanguage: { $ne: event.targetLanguage } },
            u: { $set: { [`translations.${event.targetLanguage}`]: {
              text: event.result.translatedText,
              translationModel: event.result.translatorModel ?? 'nllb',
              confidenceScore: event.result.confidenceScore ?? 1,
              createdAt: new Date().toISOString(),
            }}},
          }],
        });

        log.info('StoryTranslation: saved', { postId, lang: event.targetLanguage });
      } catch (err) {
        log.warn('StoryTranslation: save failed', { err, postId });
      }

      outstandingLanguages.delete(normalizeLanguageForDedup(event.targetLanguage));
      if (outstandingLanguages.size === 0) {
        log.info('StoryTranslation: all languages received, removing listener', { postId });
        removeListener();
      }
    };

    zmqClient.on(scopedEvent, handleResult);

    // 4. Envoyer la requête ZMQ
    try {
      await zmqClient.translateToMultipleLanguages(
        content,
        sourceLanguage,
        targetLanguages,
        storyMessageId,
        `story_context:${postId}`,
      );
    } catch (sendError) {
      removeListener();
      throw sendError;
    }

    // 5. Cleanup du listener après timeout (fallback si certaines langues échouent)
    timeoutHandle = guardedTimeout({ name: 'story-translation-timeout', afterMs: 60_000, logger: log, run: () => {
      if (outstandingLanguages.size > 0) {
        // Nommer les langues manquantes, pas leur nombre : c'est la langue
        // qui dit quel lecteur verra l'original, et un compte ne le dit pas.
        log.warn('StoryTranslation: timeout, removing listener', {
          postId,
          missingLanguages: [...outstandingLanguages],
        });
      }
      removeListener();
    } });

  } catch (error) {
    log.warn('StoryTranslation failed', { err: error, postId });
  }
}
