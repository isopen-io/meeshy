import type { TranslationEvent } from '@meeshy/shared/types/socketio-events';

/**
 * L'UNIQUE constructeur de la charge utile `message:translation`.
 *
 * Le contrat déclaré est `TranslationEvent` — `{ messageId, translations: [...] }` —
 * et les deux clients le prennent au mot : le web n'applique une traduction que
 * s'il trouve `data.translation` ou `data.translations`
 * (`TranslationService.handleTranslationEvent`, sinon `return`), et iOS décode
 * `TranslationEvent` dont `translations` n'est PAS optionnel (un décodage qui
 * échoue est un événement perdu, en silence).
 *
 * Or la charge utile était construite DEUX fois dans `MeeshySocketIOManager`, et
 * une seule des deux respectait ce contrat :
 *
 *  · `_handleTextTranslationReady` (retour ZMQ de NLLB) émettait bien un
 *    `TranslationEvent` ;
 *  · le chemin CACHE de `_handleTranslationRequest` — la réponse à un
 *    `translation:request` explicite — émettait
 *    `{ messageId, translatedText, targetLanguage, confidenceScore }` :
 *    aucun tableau `translations`, et le texte sous un nom
 *    (`translatedText`) que `TranslationData` n'a jamais porté
 *    (`translatedContent`).
 *
 * Conséquence exacte : « traduire ce message » ne faisait RIEN quand la
 * traduction demandée était déjà en cache, c'est-à-dire sur le chemin censé
 * être instantané. Elle ne fonctionnait que sur cache MISS, où c'est le retour
 * ZMQ — l'autre constructeur, le correct — qui répondait. Le Prisme
 * Linguistique devenait fonction de l'état du cache serveur.
 *
 * Un constructeur unique est donc la correction, pas un détail de style : deux
 * copies d'une même charge utile ont dérivé exactement comme le cycle 8 l'avait
 * déjà constaté sur le corps REST des liens de partage.
 *
 * `id` est délibérément UNIQUE par émission (`now`), comme le repli du chemin
 * ZMQ : le web déduplique sur `${messageId}_${translation.id}` et ne purge ce
 * registre qu'au centième événement. Un id stable ferait avaler la réponse à
 * une demande explicite de l'utilisateur sous prétexte qu'une émission
 * antérieure portait la même identité — un bouton « traduire » qui ne répond
 * pas, ce qui est précisément le symptôme qu'on ferme ici.
 */
export interface TranslationEventSource {
  readonly messageId: string;
  readonly targetLanguage: string;
  readonly translatedText: string;
  readonly sourceLanguage?: string | null;
  readonly translationModel?: string | null;
  readonly confidenceScore?: number | null;
  /** `true` quand la traduction sort du cache serveur, `false` au retour de NLLB. */
  readonly cached: boolean;
  /** Identité de la ligne quand elle existe (retour ZMQ) ; sinon un id est fabriqué. */
  readonly translationId?: string | null;
  /** Injectés pour rendre la construction testable sans horloge réelle. */
  readonly now?: number;
}

const DEFAULT_SOURCE_LANGUAGE = 'auto';
const DEFAULT_MODEL = 'medium';
const DEFAULT_CONFIDENCE = 0.85;

export function buildTranslationEvent(source: TranslationEventSource): TranslationEvent {
  const {
    messageId,
    targetLanguage,
    translatedText,
    sourceLanguage,
    translationModel,
    confidenceScore,
    cached,
    translationId,
    now = Date.now(),
  } = source;

  const resolvedSourceLanguage = sourceLanguage || DEFAULT_SOURCE_LANGUAGE;

  return {
    messageId,
    translations: [
      {
        id: translationId || `${messageId}_${targetLanguage}_${now}`,
        messageId,
        sourceLanguage: resolvedSourceLanguage,
        targetLanguage,
        translatedContent: translatedText,
        translationModel: translationModel || DEFAULT_MODEL,
        cacheKey: `${messageId}_${resolvedSourceLanguage}_${targetLanguage}`,
        cached,
        confidenceScore: confidenceScore ?? DEFAULT_CONFIDENCE,
        createdAt: new Date(now),
      },
    ],
  };
}
