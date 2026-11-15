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
 *     Never fall back to translations.first. The descent itself lives in
 *     [PrismTranslationResolver] / [ReaderPrism] (single source); [preferredContentLanguages]
 *     keeps its "fr" fallback for COMPOSITION defaults only, never for what is read.
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
     * A backwards-compatible FAÇADE over the single Prisme descent
     * ([PrismTranslationResolver], fed by the strict [ReaderPrism] — ranks 1 to 4, no "fr"
     * fallback): it keeps the historical signature and returns the matching row itself.
     *
     * Rule 1 in action: when no translation targets a preferred language, this returns null —
     * the caller MUST then render the original content, never an arbitrary translation.
     * Rule 3: pass [originalLanguage] whenever the caller knows it — the original language
     * then competes at its own RANK (a French message read by `["fr", "en"]` stays French even
     * when an English translation exists). Left `null` (unknown), the original never competes,
     * which is the historical behaviour of callers that do not carry it yet.
     */
    fun <T : TranslationLike> preferredTranslation(
        translations: List<T>,
        prefs: ContentLanguagePreferences,
        originalLanguage: String? = null,
    ): T? = PrismTranslationResolver.resolve(
        originalLanguage = originalLanguage,
        candidates = translations.map { PrismCandidate(language = it.targetLanguage, value = it) },
        preferredLanguages = ReaderPrism.resolve(prefs),
        isServable = { it.translatedContent.isNotBlank() },
    )?.value

    private fun String?.cleaned(): String? = this?.trim()?.takeIf { it.isNotEmpty() }
}
