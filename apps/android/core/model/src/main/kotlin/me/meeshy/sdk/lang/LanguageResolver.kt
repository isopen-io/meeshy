package me.meeshy.sdk.lang

/**
 * Prisme Linguistique — single source of truth for content-language resolution.
 *
 * Faithful port of:
 *  - packages/shared/utils/conversation-helpers.ts → resolveUserLanguage / resolveUserTranslationLanguages
 *  - MeeshyUser.preferredContentLanguages (packages/MeeshySDK/.../Auth/AuthModels.swift)
 *
 * Critical rules (see /CLAUDE.md "Regles critiques du Prisme"):
 *  1. If no translation matches a preferred language, show the ORIGINAL content (return null).
 *     Never fall back to translations.first.
 *  2. Device locale is the 4th priority (Prisme étendu 2026-05-26) — AFTER the in-app
 *     systemLanguage / regionalLanguage / customDestinationLanguage, BEFORE the "fr" fallback.
 *     It never supplants an in-app preference; it only fills the gap when none is configured.
 *     Unlike the in-app codes (kept verbatim, matched case-insensitively downstream), the
 *     device locale arrives as "fr_FR" / "zh-Hant-HK" and is normalised via
 *     [LanguageCodeNormalizer] before use. Mirrors iOS `MeeshyUser.preferredContentLanguages`.
 *
 * Blank strings are treated as absent to match the TS source of truth (JS falsy "").
 */
object LanguageResolver {

    const val FALLBACK_LANGUAGE: String = "fr"

    /** A user's in-app configured content-language preferences. */
    interface ContentLanguagePreferences {
        val systemLanguage: String?
        val regionalLanguage: String?
        val customDestinationLanguage: String?

        /**
         * OS-level locale (`Locale.getDefault()` / persisted `User.deviceLocale`), 4th priority.
         * Defaults to `null` so existing implementers are unaffected until they provide one.
         */
        val deviceLocale: String? get() = null
    }

    /** A translation produced for a piece of content. */
    interface TranslationLike {
        val targetLanguage: String
        val translatedContent: String
    }

    /**
     * Resolve the single preferred content language.
     * Order: systemLanguage → regionalLanguage → customDestinationLanguage → deviceLocale → "fr".
     */
    fun resolveUserLanguage(prefs: ContentLanguagePreferences): String =
        prefs.systemLanguage.cleaned()
            ?: prefs.regionalLanguage.cleaned()
            ?: prefs.customDestinationLanguage.cleaned()
            ?: LanguageCodeNormalizer.normalize(prefs.deviceLocale)
            ?: FALLBACK_LANGUAGE

    /**
     * Ordered list of preferred content languages, de-duplicated case-insensitively.
     * Order: systemLanguage → regionalLanguage → customDestinationLanguage → deviceLocale.
     * The device locale is normalised (BCP-47 → canonical code) before insertion; the in-app
     * codes are kept verbatim. Falls back to ["fr"] when nothing usable is configured.
     */
    fun preferredContentLanguages(prefs: ContentLanguagePreferences): List<String> {
        val preferred = mutableListOf<String>()
        fun addDistinct(value: String?) {
            if (value == null) return
            if (preferred.none { it.equals(value, ignoreCase = true) }) preferred.add(value)
        }
        addDistinct(prefs.systemLanguage.cleaned())
        addDistinct(prefs.regionalLanguage.cleaned())
        addDistinct(prefs.customDestinationLanguage.cleaned())
        addDistinct(LanguageCodeNormalizer.normalize(prefs.deviceLocale))
        if (preferred.isEmpty()) preferred.add(FALLBACK_LANGUAGE)
        return preferred
    }

    /**
     * Target languages for automatic translation when autoTranslate is ON:
     * systemLanguage (always) + regionalLanguage (if configured).
     */
    fun resolveUserTranslationLanguages(
        systemLanguage: String?,
        regionalLanguage: String?,
    ): List<String> {
        val languages = mutableListOf<String>()
        systemLanguage.cleaned()?.let(languages::add)
        regionalLanguage.cleaned()?.let(languages::add)
        return languages.ifEmpty { listOf(FALLBACK_LANGUAGE) }
    }

    /**
     * Pick the translation to display for the given preferences, or null to show the original.
     *
     * Rule 1 in action: when no translation targets a preferred language, this returns null —
     * the caller MUST then render the original content, never an arbitrary translation.
     */
    fun <T : TranslationLike> preferredTranslation(
        translations: List<T>,
        prefs: ContentLanguagePreferences,
    ): T? {
        if (translations.isEmpty()) return null
        for (language in preferredContentLanguages(prefs)) {
            val match = translations.firstOrNull {
                it.targetLanguage.equals(language, ignoreCase = true) &&
                    it.translatedContent.isNotBlank()
            }
            if (match != null) return match
        }
        return null
    }

    private fun String?.cleaned(): String? = this?.trim()?.takeIf { it.isNotEmpty() }
}
