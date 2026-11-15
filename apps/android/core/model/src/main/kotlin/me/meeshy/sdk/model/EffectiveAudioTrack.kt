package me.meeshy.sdk.model

/**
 * **La langue de PISTE audio effective d'un vocal** — port de `AudioTrackLanguageResolver` d'iOS : la
 * loi unique que la bulle (karaoké) et le moteur (file de lecture) partagent. Sans elle, la bascule
 * du drapeau changerait le texte pendant que le coordinateur rejouerait l'original.
 *
 * 1. Bascule manuelle ([manualOverride]) : la langue d'origine vaut « piste originale » (`null`) ;
 *    une langue sans piste traduite retombe sur l'original.
 * 2. Sinon Prisme : les langues du lecteur DANS L'ORDRE ; la langue d'origine gagne à SON rang (jamais
 *    en court-circuit), la première langue servie par une piste traduite gagne sinon.
 *
 * `null` = piste originale. Aucune seconde descente : la piste suit la langue servie.
 */
public object EffectiveAudioTrack {

    /** Une piste traduite jouable d'un vocal. */
    public data class TranslatedTrack(val language: String, val url: String, val durationMs: Int? = null)

    /** La piste servie : `language == null` ⇒ l'original. */
    public data class Served(val language: String?, val url: String, val durationMs: Int?)

    /** La langue d'origine d'UNE piste : celle de SA transcription quand elle est connue, sinon celle du message. */
    public fun originLanguage(transcriptionLanguage: String?, messageOriginal: String): String {
        val own = transcriptionLanguage?.trim().orEmpty()
        return own.ifEmpty { messageOriginal }
    }

    public fun resolve(
        manualOverride: String?,
        originalLanguage: String,
        preferredLanguages: List<String>,
        availableLanguages: List<String>,
    ): String? {
        val available = availableLanguages.mapTo(HashSet()) { it.lowercase() }
        if (available.isEmpty()) return null
        val original = originalLanguage.lowercase()
        val manual = manualOverride?.lowercase()
        if (manual != null) {
            if (manual == original) return null
            return manual.takeIf { it in available }
        }
        for (language in preferredLanguages) {
            if (language.isEmpty()) continue
            val lower = language.lowercase()
            if (lower == original) return null
            if (lower in available) return lower
        }
        return null
    }

    /** La piste servie par la MÊME descente que [resolve] : URL, durée et langue partent ensemble. */
    public fun served(
        originalUrl: String,
        originalDurationMs: Int?,
        manualOverride: String?,
        originalLanguage: String,
        preferredLanguages: List<String>,
        translated: List<TranslatedTrack>,
    ): Served {
        val language = resolve(manualOverride, originalLanguage, preferredLanguages, translated.map { it.language })
        val track = language?.let { lang -> translated.firstOrNull { it.language.lowercase() == lang } }
            ?: return Served(null, originalUrl, originalDurationMs)
        return Served(
            language = language,
            url = track.url,
            durationMs = track.durationMs?.takeIf { it > 0 } ?: originalDurationMs,
        )
    }
}
