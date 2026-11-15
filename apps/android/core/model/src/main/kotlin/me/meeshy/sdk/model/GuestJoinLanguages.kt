package me.meeshy.sdk.model

import java.util.Locale

/**
 * The languages a guest can pick when joining through a share link, listed by
 * their own name (autonym) — a language is always shown in itself, never
 * translated. Mirrors iOS `JoinFlowLanguages` (same 14 codes, same order).
 */
object GuestJoinLanguages {
    const val FALLBACK: String = "fr"

    val codes: List<String> = listOf(
        "fr", "en", "es", "de", "it", "pt", "nl", "pl", "tr", "ru", "ar", "zh", "ja", "ko",
    )

    /** `Locale(code).getDisplayLanguage(Locale(code))`, first letter upper-cased ("español" → "Español"). */
    fun endonym(code: String): String {
        val locale = Locale(code)
        val name = locale.getDisplayLanguage(locale)
        return name.replaceFirstChar { it.titlecase(locale) }
    }

    /** Reduce a BCP-47 / POSIX tag ("pt-BR", "fr_CA", "EN") to its two-letter language code. */
    fun normalize(tag: String): String? {
        val language = tag.trim().substringBefore('-').substringBefore('_').lowercase()
        return language.takeIf { it.length == 2 }
    }

    /** First device language that is offered, else [FALLBACK]. */
    fun defaultFor(deviceLanguages: List<String>): String =
        deviceLanguages.firstNotNullOfOrNull { tag -> normalize(tag)?.takeIf { it in codes } } ?: FALLBACK
}
