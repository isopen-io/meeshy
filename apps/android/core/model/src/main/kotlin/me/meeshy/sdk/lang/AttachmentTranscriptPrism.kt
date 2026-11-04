package me.meeshy.sdk.lang

import me.meeshy.sdk.model.ApiAttachmentTranscription
import me.meeshy.sdk.model.ApiAttachmentTranslation
import me.meeshy.sdk.model.EffectiveAudioTrack

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

    /**
     * **Ce qu'un vocal sert, d'UNE descente** : le texte, la piste jouée et la langue des segments partent ensemble, de
     * sorte qu'aucune surface ne peut montrer un karaoké en langue B sous une voix en langue A. Sans bascule
     * ([manualOverride] nul ou blanc) ce sont exactement [served] et [playedTrack]. Avec une bascule, la langue est élue
     * par [EffectiveAudioTrack.resolve] : l'origine de CETTE pièce (sa transcription) vaut l'original, une langue sans
     * piste retombe sur l'original, jamais sur la première traduction ; la transcription d'une piste blanche laisse le
     * texte d'origine, sans les horodatages d'une autre voix.
     */
    fun servedVoice(
        transcription: ApiAttachmentTranscription?,
        translations: Map<String, ApiAttachmentTranslation>?,
        preferences: LanguageResolver.ContentLanguagePreferences,
        manualOverride: String?,
    ): ServedVoice {
        val override = manualOverride?.trim()?.lowercase()?.ifEmpty { null }
        if (override == null) {
            val text = served(transcription, translations, preferences)
            return ServedVoice(
                text = text?.text,
                textLanguage = text?.language,
                isTranslated = text?.isTranslated == true,
                track = playedTrack(transcription, translations, preferences),
                segmentsLanguage = text?.language?.takeIf { text.isTranslated },
            )
        }
        val playable = translations.orEmpty().mapNotNull { (language, entry) ->
            entry.url?.trim()?.ifBlank { null }?.let { url -> language.trim() to entry.copy(url = url) }
        }
        val elected = EffectiveAudioTrack.resolve(
            manualOverride = override,
            originalLanguage = EffectiveAudioTrack.originLanguage(transcription?.language, messageOriginal = ""),
            preferredLanguages = ReaderPrism.resolve(preferences),
            availableLanguages = playable.map { it.first },
        )
        val picked = elected?.let { language -> playable.firstOrNull { it.first.equals(language, ignoreCase = true) } }
        val originalLanguage = transcription?.language?.trim()?.ifBlank { null }
        val originalText = originalText(transcription)
        if (picked == null) {
            return ServedVoice(originalText, originalLanguage.takeIf { originalText != null }, isTranslated = false, track = null, segmentsLanguage = null)
        }
        val (language, entry) = picked
        val track = Track(url = entry.url.orEmpty(), language = language, durationMs = entry.durationMs)
        val translatedText = entry.transcription?.trim()?.ifBlank { null }
            ?: return ServedVoice(originalText, originalLanguage.takeIf { originalText != null }, isTranslated = false, track = track, segmentsLanguage = null)
        return ServedVoice(translatedText, language, isTranslated = true, track = track, segmentsLanguage = language)
    }

    /**
     * Le vocal servi : [text] dans [textLanguage], la voix [track] (`null` ⇒ l'original) et la langue dont les segments
     * décrivent [text] ([segmentsLanguage], `null` ⇒ la transcription d'origine).
     */
    data class ServedVoice(
        val text: String?,
        val textLanguage: String?,
        val isTranslated: Boolean,
        val track: Track?,
        val segmentsLanguage: String?,
    ) {
        /**
         * Les horodatages des segments ne valent que sur la piste qu'ils décrivent : la voix d'origine pour la
         * transcription d'origine, la voix traduite pour sa propre transcription. Ailleurs le karaoké avance à la
         * progression plutôt que d'allumer un mot à contretemps.
         */
        val segmentsDescribeTrack: Boolean
            get() = segmentsLanguage.equals(track?.language, ignoreCase = true)
    }

    /** Le texte d'origine, `transcribedText` d'abord (forme du serveur), `text` ensuite ; un blanc n'en est pas un. */
    fun originalText(transcription: ApiAttachmentTranscription?): String? =
        (transcription?.transcribedText ?: transcription?.text)?.trim()?.ifBlank { null }
}
