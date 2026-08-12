package me.meeshy.sdk.model

/**
 * Pure interface-language (app UI chrome) preference logic (feature-parity §L).
 *
 * The preference is the code of one of the supported interface languages, or `null`
 * to follow the device locale ("System"). These helpers are the single source of
 * truth for
 *  - the supported interface-language set ([supportedCodes] / [supportedLanguages]),
 *  - encoding/decoding the choice for durable storage ([storageValue] / [fromStorage]),
 *  - and resolving it to an effective locale tag to force on the app UI, or `null`
 *    to leave the device locale in place ([resolveInterfaceLocaleTag]).
 *
 * Distinct from content-language resolution ([me.meeshy.sdk.lang.LanguageResolver]):
 * this governs the UI chrome the app renders in, not which translation of a message
 * a user reads. Keeping the branchy logic here (off any Composable, off the DataStore
 * seam) keeps it behavioural-test-covered.
 *
 * `null` is the canonical "follow the device locale" (System) value throughout.
 */
public object AppLanguage {

    /** Persisted token for the "follow the device locale" choice. */
    public const val SYSTEM_TOKEN: String = "system"

    /** The interface languages the app ships UI strings for, in display order. */
    public val supportedLanguages: List<LanguageInfo> = LanguageData.interfaceLanguages

    /** The codes of [supportedLanguages] (fr/en/es/ar). */
    public val supportedCodes: List<String> = supportedLanguages.map { it.code }

    /** Whether [code] is one of the supported interface languages (trim/case-insensitive). */
    public fun isSupported(code: String?): Boolean {
        val cleaned = code.normalized() ?: return false
        return supportedCodes.any { it == cleaned }
    }

    /**
     * Decodes a persisted token into the preference: a supported code, or `null` for
     * "System". Trimmed and case-insensitive; the [SYSTEM_TOKEN] literal, blank, absent,
     * or any unsupported/garbage value all decode to `null` (follow the device) — a
     * corrupt/legacy value can never leave the app stuck in an unshippable language.
     */
    public fun fromStorage(raw: String?): String? {
        val cleaned = raw.normalized() ?: return null
        if (cleaned == SYSTEM_TOKEN) return null
        return supportedCodes.firstOrNull { it == cleaned }
    }

    /** Encodes a preference for durable storage; `null`/unsupported (System) → [SYSTEM_TOKEN]. */
    public fun storageValue(code: String?): String =
        code.normalized()?.takeIf { it in supportedCodes } ?: SYSTEM_TOKEN

    /**
     * The locale tag to force on the app UI, or `null` to follow the device locale.
     * A `null` preference (System) or a defensively-unsupported code → `null`.
     */
    public fun resolveInterfaceLocaleTag(code: String?): String? =
        code.normalized()?.takeIf { it in supportedCodes }

    /** The static metadata for a supported interface language, or `null` (System/unsupported). */
    public fun info(code: String?): LanguageInfo? {
        val cleaned = code.normalized() ?: return null
        return supportedLanguages.firstOrNull { it.code == cleaned }
    }

    private fun String?.normalized(): String? =
        this?.trim()?.lowercase()?.takeIf { it.isNotEmpty() }
}
