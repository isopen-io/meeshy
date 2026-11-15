package me.meeshy.sdk.lang

import me.meeshy.sdk.model.LanguageData

/**
 * Normalises a raw language identifier to a Meeshy-supported code.
 *
 * Faithful port of:
 *  - packages/shared/utils/language-normalize.ts → normalizeLanguageCode (TS source of truth)
 *  - MeeshyUser.normalizeLanguageCode (packages/MeeshySDK/.../Auth/AuthModels.swift, iOS mirror)
 *
 * Accepts the locale identifiers that reach the app cross-platform — `"fr"`, `"FR"`,
 * `"fr-FR"`, `"fr_FR"` (iOS `Locale.current`), `"en-US"` (web `Accept-Language`),
 * `"zh-Hant-HK"` — and reduces them to the canonical 2-/3-letter code the translation
 * pipeline keys on (NLLB targets, `MessageTranslation.targetLanguage`).
 *
 * Rules (mirrored exactly across the three platforms):
 *  - A supported code (2 **or** 3 letters, e.g. `"bas"`, `"ewo"`) is returned verbatim —
 *    never truncated (`"bas"` → `"ba"` = Bashkir would break the Prisme Linguistique).
 *  - An ISO 639-2/639-3 code with no direct Meeshy entry is reduced to its ISO 639-1 via
 *    the EXPLICIT [ISO_639_3_TO_1] table (`"eng"` → `"en"`, `"swe"` → `"sv"`), never by
 *    blind prefix truncation (`"swe"` ≠ `"sw"` Swahili; `"fil"` is rejected, not `"fi"`).
 *    The reduced target is re-validated against [LanguageData.supportedCodeSet].
 *  - A deprecated ISO 639-1 alias (`iw`/`in`/`ji`, emitted by the JVM's own
 *    `Locale.getLanguage()`) is reduced via the EXPLICIT [LEGACY_ISO_639_1] table
 *    (`iw` -> `he`, `in` -> `id`), likewise re-validated (`ji` -> `yi`, absent, -> `null`).
 *  - Returns `null` for invalid input (blank, < 2 alphabetic chars, non-letters, or a
 *    3-letter code absent from the table). The caller decides its own fallback
 *    (`"fr"` for [LanguageResolver.resolveUserLanguage], omission for lists).
 *
 * Any change here MUST touch the TS + Swift mirrors to preserve cross-platform symmetry.
 */
object LanguageCodeNormalizer {

    /**
     * ISO 639-2/639-3 → ISO 639-1 reduction (mirror of `ISO_639_3_TO_1` in
     * language-normalize.ts and `iso639ReductionMap` in AuthModels.swift). Covers both the
     * 639-2/T (terminology) and 639-2/B (bibliographic) variants that differ (`deu`/`ger`,
     * `fra`/`fre`, `ces`/`cze`, `zho`/`chi`…). A 3-letter code absent here is rejected —
     * never truncated.
     */
    private val ISO_639_3_TO_1: Map<String, String> = mapOf(
        "afr" to "af", "amh" to "am", "ara" to "ar", "ben" to "bn", "bul" to "bg",
        "ces" to "cs", "cze" to "cs", "dan" to "da", "deu" to "de", "ger" to "de",
        "ell" to "el", "gre" to "el", "eng" to "en", "ewe" to "ee", "fas" to "fa", "per" to "fa",
        "fin" to "fi", "fra" to "fr", "fre" to "fr", "hau" to "ha", "heb" to "he", "hin" to "hi",
        "hrv" to "hr", "hun" to "hu", "hye" to "hy", "arm" to "hy", "ibo" to "ig", "ind" to "id",
        "ita" to "it", "jpn" to "ja", "kin" to "rw", "kor" to "ko", "lin" to "ln", "lit" to "lt",
        "lug" to "lg", "mlg" to "mg", "msa" to "ms", "may" to "ms", "nld" to "nl", "dut" to "nl",
        "nor" to "no", "nya" to "ny", "orm" to "om", "pol" to "pl", "por" to "pt", "ron" to "ro",
        "rum" to "ro", "run" to "rn", "rus" to "ru", "sna" to "sn", "som" to "so", "spa" to "es",
        "swa" to "sw", "swe" to "sv", "tha" to "th", "tir" to "ti", "tur" to "tr", "ukr" to "uk",
        "urd" to "ur", "vie" to "vi", "wol" to "wo", "xho" to "xh", "yor" to "yo", "zho" to "zh",
        "chi" to "zh", "zul" to "zu",
    )

    /**
     * Deprecated ISO 639-1 aliases → their current canonical code (mirror of
     * `LEGACY_ISO_639_1` in language-normalize.ts and `legacyISO6391Map` in
     * AuthModels.swift). `iw`/`in`/`ji` are the retired codes for Hebrew,
     * Indonesian and Yiddish. The JVM keeps them for backward compat —
     * `java.util.Locale.getLanguage()` normalises he->iw, id->in, yi->ji — so an
     * Android device (this very platform) on a Hebrew locale emits "iw", which
     * left verbatim matches no `MessageTranslation` (keyed "he") and violates the
     * Prisme Linguistique. Each target is re-validated against the catalogue, so
     * `ji` -> `yi` (absent) falls back to `null` like the TS/iOS mirrors.
     */
    private val LEGACY_ISO_639_1: Map<String, String> = mapOf(
        "iw" to "he", "in" to "id", "ji" to "yi",
    )

    fun normalize(input: String?): String? {
        val trimmed = input?.trim() ?: return null
        if (trimmed.length < 2) return null

        val primary = trimmed.split('-', '_').firstOrNull()?.lowercase() ?: return null
        if (primary.length < 2) return null
        if (!primary.all { it in 'a'..'z' }) return null

        // A supported code (2 or 3 letters) is returned as-is.
        if (primary in LanguageData.supportedCodeSet) return primary

        // ISO 639-2/639-3 with no direct entry: reduce via the explicit table, re-validated.
        if (primary.length > 2) {
            val reduced = ISO_639_3_TO_1[primary]
            return if (reduced != null && reduced in LanguageData.supportedCodeSet) reduced else null
        }

        // Deprecated 2-letter alias (iw/in/ji): reduce via the explicit table,
        // re-validated against the catalogue (mirror of TS/iOS). Without this an
        // Android Hebrew locale ("iw") would never match its "he" translations.
        LEGACY_ISO_639_1[primary]?.let { legacy ->
            return if (legacy in LanguageData.supportedCodeSet) legacy else null
        }

        // Unknown 2-letter code: preserved (historical behaviour; won't match a translation).
        return primary
    }

    /**
     * The canonical key under which two language identifiers are considered THE SAME.
     *
     * Faithful port of `normalizeLanguageForDedup`
     * (`packages/shared/utils/language-normalize.ts`) — `normalize` first, then the
     * primary subtag lowercased, then the raw string lowercased. Unlike [normalize] it
     * is TOTAL: it never returns `null`, because a comparison has to yield something
     * for every token it is handed.
     *
     * Why it exists separately, and why the TS twin is the one mirrored rather than the
     * Swift one: the gateway builds the wire map's KEYS with this exact function
     * (`buildLastMessagePreviewTranslations` → `normalizeLanguageForDedup`). Matching it
     * is what guarantees a reader language canonicalises onto the key that is actually
     * on the wire. [normalize] alone rejects what it does not recognise (`"fil-PH"` →
     * `null`), which would silently drop a comparison instead of making it.
     */
    fun normalizeForDedup(code: String): String {
        normalize(code)?.let { return it }
        val primary = code.trim().split('-', '_').firstOrNull()?.lowercase()
        return if (!primary.isNullOrEmpty()) primary else code.lowercase()
    }
}
