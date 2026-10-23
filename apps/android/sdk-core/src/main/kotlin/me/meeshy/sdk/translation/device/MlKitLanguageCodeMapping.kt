package me.meeshy.sdk.translation.device

import me.meeshy.sdk.lang.LanguageCodeNormalizer

/** Les codes à 2 lettres que ML Kit Translate sait traduire (`TranslateLanguage`). */
object MlKitLanguageCodeMapping {

    private val SUPPORTED: Set<String> = setOf(
        "af", "ar", "be", "bg", "bn", "ca", "cs", "cy", "da", "de", "el", "en", "eo", "es", "et",
        "fa", "fi", "fr", "ga", "gl", "gu", "he", "hi", "hr", "ht", "hu", "id", "is", "it", "ja",
        "ka", "kn", "ko", "lt", "lv", "mk", "mr", "ms", "mt", "nl", "no", "pl", "pt", "ro", "ru",
        "sk", "sl", "sq", "sv", "sw", "ta", "te", "th", "tl", "tr", "uk", "ur", "vi", "zh",
    )

    /** Le code ML Kit d'une langue Meeshy (`pt-BR` -> `pt`, `fil` -> `tl`), ou `null` si non traduite. */
    fun toMlKit(code: String): String? {
        val two = when (val normalized = LanguageCodeNormalizer.normalize(code) ?: return null) {
            "fil" -> "tl"
            else -> normalized.substringBefore('-').lowercase()
        }
        return two.takeIf { it in SUPPORTED }
    }
}
