package me.meeshy.sdk.model

/**
 * **Les surfaces SOCIALES qui jouent un audio** — miroir de `SocialAudioSurface` (iOS, #4926). Liste
 * FERMÉE : une septième surface ne compile pas tant qu'elle n'a pas dit si elle transporte des pistes.
 */
public enum class SocialAudioSurface(public val carriesTranslatedTracks: Boolean) {
    /** La carte d'un post audio dans le fil. */
    FEED_POST_CARD(true),

    /** Le détail d'un post audio. */
    POST_DETAIL(true),

    /** Un commentaire audio — sous un post, une story ou un réel. */
    COMMENT(true),

    /** Le réel, dont la piste jouée peut être un audio traduit. */
    REEL(true),

    /** Le plein écran audio, qui porte en plus la liste des puces de langue. */
    AUDIO_FULLSCREEN(true),

    /** La piste sonore d'une republication LEGACY : une URL nue, sans transcription ni piste traduite. */
    REPOST_LEGACY_AUDIO(false),
}

/**
 * **La piste servie d'un audio SOCIAL** — projection de [EffectiveAudioTrack] (la loi du fil) vers le
 * social, miroir de `SocialAudioTrack` (iOS). Aucune boucle réécrite : la piste suit la langue du texte
 * servi, la descente est celle du chat.
 */
public object SocialAudioTrack {

    /** La valeur du plein écran pour « piste originale » (la loi rend `null`). */
    public const val ORIGINAL_SENTINEL: String = "orig"

    /** La langue de la piste servie — `null` ⇒ l'ORIGINAL (jamais `translatedAudios.first`). */
    public fun language(
        surface: SocialAudioSurface,
        manualOverride: String? = null,
        originalLanguage: String,
        preferredLanguages: List<String>,
        translatedAudios: List<MessageTranslatedAudio>,
    ): String? {
        if (!surface.carriesTranslatedTracks) return null
        return EffectiveAudioTrack.resolve(
            manualOverride = manualOverride,
            originalLanguage = originalLanguage,
            preferredLanguages = preferredLanguages,
            availableLanguages = translatedAudios.filter { it.url.isNotEmpty() }.map { it.targetLanguage },
        )
    }

    /**
     * La langue d'ORIGINE d'un audio social : celle de la TRANSCRIPTION (Whisper) avant celle du porteur
     * (le texte du post). `""` = inconnue : elle ne gagne à aucun rang.
     */
    public fun originalLanguage(transcription: MessageTranscription?, carrier: String?): String =
        listOf(transcription?.language, carrier)
            .map { it.orEmpty().trim() }
            .firstOrNull { it.isNotEmpty() }
            .orEmpty()

    /** La même élection, dans la forme du plein écran : la sentinelle [ORIGINAL_SENTINEL] pour l'original. */
    public fun fullscreenSelection(
        manualOverride: String? = null,
        originalLanguage: String,
        preferredLanguages: List<String>,
        translatedAudios: List<MessageTranslatedAudio>,
    ): String = language(
        SocialAudioSurface.AUDIO_FULLSCREEN, manualOverride, originalLanguage, preferredLanguages, translatedAudios,
    ) ?: ORIGINAL_SENTINEL

    /** L'élection à l'OUVERTURE du plein écran : la piste servie est présélectionnée, sans saut visible. */
    public fun openingSelection(
        transcription: MessageTranscription?,
        carrier: String?,
        preferredLanguages: List<String>,
        translatedAudios: List<MessageTranslatedAudio>,
    ): String = fullscreenSelection(
        originalLanguage = originalLanguage(transcription, carrier),
        preferredLanguages = preferredLanguages,
        translatedAudios = translatedAudios,
    )

    /** La piste servie (URL, durée, langue) : l'URL de l'original quand la loi rend `null`. */
    public fun served(
        surface: SocialAudioSurface,
        originalUrl: String,
        originalDurationMs: Int?,
        transcription: MessageTranscription?,
        carrierLanguage: String?,
        preferredLanguages: List<String>,
        translatedAudios: List<MessageTranslatedAudio>,
    ): EffectiveAudioTrack.Served {
        val lang = language(
            surface = surface,
            originalLanguage = originalLanguage(transcription, carrierLanguage),
            preferredLanguages = preferredLanguages,
            translatedAudios = translatedAudios,
        ) ?: return EffectiveAudioTrack.Served(null, originalUrl, originalDurationMs)
        val track = translatedAudios.firstOrNull { it.targetLanguage.lowercase() == lang && it.url.isNotEmpty() }
            ?: return EffectiveAudioTrack.Served(null, originalUrl, originalDurationMs)
        return EffectiveAudioTrack.Served(lang, track.url, track.durationMs.takeIf { it > 0 } ?: originalDurationMs)
    }
}

/**
 * L'URL d'un média audio de post/commentaire telle que le lecteur l'entend : la piste traduite de la
 * langue servie quand elle existe, sinon [ApiPostMedia.fileUrl]. `null` sans fichier. [resolveUrl]
 * absolutise l'URL de l'original ET celle de la piste, pour qu'elles partent ensemble.
 */
public fun ApiPostMedia.servedAudioUrl(
    surface: SocialAudioSurface,
    carrierLanguage: String?,
    preferredLanguages: List<String>,
    resolveUrl: (String) -> String = { it },
): String? {
    val original = fileUrl?.takeIf { it.isNotBlank() } ?: return null
    val tracks = translations.orEmpty().mapNotNull { (language, track) ->
        AttachmentMetadataMapping.translatedAudio(id, language, track)
    }
    val transcriptionLanguage = transcription?.language?.takeIf { it.isNotBlank() }
        ?.let { MessageTranscription(attachmentId = id, language = it) }
    val served = SocialAudioTrack.served(
        surface = surface,
        originalUrl = original,
        originalDurationMs = duration,
        transcription = transcriptionLanguage,
        carrierLanguage = carrierLanguage,
        preferredLanguages = preferredLanguages,
        translatedAudios = tracks,
    )
    return resolveUrl(served.url)
}
