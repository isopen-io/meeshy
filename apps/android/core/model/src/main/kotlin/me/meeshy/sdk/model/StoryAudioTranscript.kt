package me.meeshy.sdk.model

import me.meeshy.sdk.lang.LanguageCodeNormalizer
import me.meeshy.sdk.lang.PrismCandidate
import me.meeshy.sdk.lang.PrismTranslationResolver

/**
 * Source unique du son PARLÉ d'une story : quelle transcription afficher, quelle variante
 * audio jouer, pour une chaîne de langues. Miroir de `StoryAudioTranscript` (iOS).
 *
 * La transcription n'a pas d'« original déjà affiché » : sans correspondance, la première
 * entrée (langue réellement parlée). L'audio, lui, retombe sur `null` : la piste d'origine
 * continue. La descente est commune ([PrismTranslationResolver]), seul le repli diffère.
 */
object StoryAudioTranscript {

    /** Codes (langue de base) dans lesquels le son peut être lu OU écouté, triés. */
    fun availableLanguages(effects: StoryEffects?): List<String> =
        (effects?.voiceTranscriptions.orEmpty().map { it.language } +
            effects?.backgroundAudioVariants.orEmpty().map { it.language })
            .filter { it.isNotBlank() }
            .map(LanguageCodeNormalizer::normalizeForDedup)
            .toSortedSet()
            .toList()

    fun resolve(effects: StoryEffects?, preferredLanguages: List<String>): StoryVoiceTranscription? {
        val transcripts = effects?.voiceTranscriptions.orEmpty()
        if (transcripts.isEmpty()) return null
        val served = PrismTranslationResolver.resolve(
            originalLanguage = null,
            candidates = transcripts.map { PrismCandidate(it.language, it) },
            preferredLanguages = preferredLanguages,
            isServable = { it.content.isNotBlank() },
        )
        return served?.value ?: transcripts.first()
    }

    /** `null` : aucune variante ne correspond, la piste d'origine reste en place. */
    fun variant(effects: StoryEffects?, preferredLanguages: List<String>): StoryAudioVariant? {
        val variants = effects?.backgroundAudioVariants.orEmpty()
        if (variants.isEmpty()) return null
        return PrismTranslationResolver.resolve(
            originalLanguage = null,
            candidates = variants.map { PrismCandidate(it.language, it) },
            preferredLanguages = preferredLanguages,
            isServable = { it.postMediaId.isNotBlank() },
        )?.value
    }

    fun hasTranscript(effects: StoryEffects?): Boolean =
        effects?.voiceTranscriptions.orEmpty().any { it.content.isNotBlank() }
}
