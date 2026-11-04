package me.meeshy.sdk.lang

import me.meeshy.sdk.model.ApiAttachmentTranscription
import me.meeshy.sdk.model.ApiAttachmentTranslation

/**
 * LA TRANSCRIPTION SERVIE d'une pièce audio ou vidéo, selon le Prisme (famille AUDIO du `CLAUDE.md` racine) — le site
 * unique que la ligne sous le lecteur de la bulle et la fiche Transcription lisent. Les langues du lecteur sont
 * parcourues DANS L'ORDRE : la première servie gagne, par la transcription d'origine si elle est déjà dans cette
 * langue, ou par une traduction ; sinon l'original (jamais une traduction prise au hasard).
 */
object AttachmentTranscriptPrism {

    data class Served(val text: String, val language: String?, val isTranslated: Boolean)

    /** La piste vocale élue : l'URL à jouer, la clé de langue servie et sa durée. */
    data class Track(val url: String, val language: String, val durationMs: Int?)

    fun served(
        transcription: ApiAttachmentTranscription?,
        translations: Map<String, ApiAttachmentTranslation>?,
        preferences: LanguageResolver.ContentLanguagePreferences,
    ): Served? {
        val originalText = originalText(transcription)
        val originalLanguage = transcription?.language?.trim()?.ifBlank { null }
        val translated = PrismTranslationResolver.resolve(
            originalLanguage = originalLanguage.takeIf { originalText != null },
            candidates = translations.orEmpty().map { (language, entry) -> PrismCandidate(language, entry.transcription.orEmpty()) },
            preferredLanguages = ReaderPrism.resolve(preferences),
        )
        if (translated != null) return Served(translated.text.trim(), translated.language, isTranslated = true)
        return originalText?.let { Served(it, originalLanguage, isTranslated = false) }
    }

    /**
     * La piste vocale servie : la MÊME descente que [served] (rangs du lecteur dans l'ordre, la langue d'origine à son
     * rang), de sorte que la voix jouée et la ligne de transcription affichée sont toujours dans la même langue.
     * `null` ⇒ jouer la note vocale d'origine. Un appelant qui sert aussi un texte ne joue la piste que si elle est dans
     * la langue de ce texte : une voix d'un autre rang au-dessus d'un texte servi serait pire qu'une traduction absente.
     */
    fun track(
        transcription: ApiAttachmentTranscription?,
        translations: Map<String, ApiAttachmentTranslation>?,
        preferences: LanguageResolver.ContentLanguagePreferences,
    ): Track? {
        val candidates = translations.orEmpty().mapNotNull { (language, entry) ->
            entry.url?.trim()?.ifBlank { null }?.let { PrismCandidate(language, entry.copy(url = it)) }
        }
        val picked = PrismTranslationResolver.resolve(
            originalLanguage = transcription?.language?.trim()?.ifBlank { null },
            candidates = candidates,
            preferredLanguages = ReaderPrism.resolve(preferences),
            isServable = { true },
        ) ?: return null
        return Track(url = picked.value.url.orEmpty(), language = picked.language, durationMs = picked.value.durationMs)
    }

    /**
     * **La piste effectivement JOUÉE** : [track] couplée au texte [served]. La voix n'est servie que si elle est dans la
     * langue du texte servi (ou s'il n'y a aucun texte à contredire) : deux descentes parallèles serviraient « la réunion
     * est déplacée » au-dessus d'une voix espagnole, pire qu'une traduction absente. Site unique de ce couplage — la bulle
     * ET la file du fil l'appellent. `null` ⇒ jouer la note vocale d'origine.
     */
    fun playedTrack(
        transcription: ApiAttachmentTranscription?,
        translations: Map<String, ApiAttachmentTranslation>?,
        preferences: LanguageResolver.ContentLanguagePreferences,
    ): Track? {
        val track = track(transcription, translations, preferences) ?: return null
        val text = served(transcription, translations, preferences) ?: return track
        return track.takeIf { text.isTranslated && text.language.equals(it.language, ignoreCase = true) }
    }

    /** Le texte d'origine, `transcribedText` d'abord (forme du serveur), `text` ensuite ; un blanc n'en est pas un. */
    fun originalText(transcription: ApiAttachmentTranscription?): String? =
        (transcription?.transcribedText ?: transcription?.text)?.trim()?.ifBlank { null }
}
