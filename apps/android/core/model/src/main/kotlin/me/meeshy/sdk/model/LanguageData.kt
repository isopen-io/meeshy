package me.meeshy.sdk.model

import java.util.IllformedLocaleException
import java.util.Locale

/** Static metadata for a language — port of LanguageInfo (LanguageData.swift). */
data class LanguageInfo(
    val code: String,
    val name: String,
    val nativeName: String,
    val flag: String,
    val colorHex: String,
)

/**
 * Static language tables — port of LanguageData (LanguageData.swift) and of its
 * `autonym(for:)` / `colorHex(for:)` helpers (LanguageData+Autonym.swift).
 */
object LanguageData {

    /**
     * All translation-target languages — the 83 codes of iOS `LanguageData.allLanguages`,
     * in the same canonical order. `nativeName` is the language written in its own
     * script and orthography ("Français", "한국어", "العربية"), never a transliteration.
     * The Cameroon block at the end is transcription-only (no NLLB-200 mapping, no TTS).
     */
    val allLanguages: List<LanguageInfo> = listOf(
        // Romance
        LanguageInfo("fr", "French", "Français", "🇫🇷", "3B82F6"),
        LanguageInfo("es", "Spanish", "Español", "🇪🇸", "EF4444"),
        LanguageInfo("it", "Italian", "Italiano", "🇮🇹", "22C55E"),
        LanguageInfo("pt", "Portuguese", "Português", "🇧🇷", "16A34A"),
        LanguageInfo("ro", "Romanian", "Română", "🇷🇴", "2563EB"),
        LanguageInfo("ca", "Catalan", "Català", "🏴", "EAB308"),
        // Germanic
        LanguageInfo("en", "English", "English", "🇬🇧", "6366F1"),
        LanguageInfo("de", "German", "Deutsch", "🇩🇪", "F59E0B"),
        LanguageInfo("nl", "Dutch", "Nederlands", "🇳🇱", "F97316"),
        LanguageInfo("sv", "Swedish", "Svenska", "🇸🇪", "0EA5E9"),
        LanguageInfo("da", "Danish", "Dansk", "🇩🇰", "DC2626"),
        LanguageInfo("no", "Norwegian", "Norsk", "🇳🇴", "1D4ED8"),
        LanguageInfo("af", "Afrikaans", "Afrikaans", "🇿🇦", "059669"),
        // Slavic
        LanguageInfo("ru", "Russian", "Русский", "🇷🇺", "DC2626"),
        LanguageInfo("uk", "Ukrainian", "Українська", "🇺🇦", "FBBF24"),
        LanguageInfo("pl", "Polish", "Polski", "🇵🇱", "E11D48"),
        LanguageInfo("cs", "Czech", "Čeština", "🇨🇿", "1E40AF"),
        LanguageInfo("sk", "Slovak", "Slovenčina", "🇸🇰", "1E3A8A"),
        LanguageInfo("bg", "Bulgarian", "Български", "🇧🇬", "15803D"),
        LanguageInfo("hr", "Croatian", "Hrvatski", "🇭🇷", "B91C1C"),
        LanguageInfo("sr", "Serbian", "Српски", "🇷🇸", "9F1239"),
        LanguageInfo("sl", "Slovenian", "Slovenščina", "🇸🇮", "0369A1"),
        // Baltic
        LanguageInfo("lt", "Lithuanian", "Lietuvių", "🇱🇹", "CA8A04"),
        LanguageInfo("lv", "Latvian", "Latviešu", "🇱🇻", "7C2D12"),
        // Finno-Ugric
        LanguageInfo("fi", "Finnish", "Suomi", "🇫🇮", "2563EB"),
        LanguageInfo("hu", "Hungarian", "Magyar", "🇭🇺", "B45309"),
        LanguageInfo("et", "Estonian", "Eesti", "🇪🇪", "0284C7"),
        // Hellenic
        LanguageInfo("el", "Greek", "Ελληνικά", "🇬🇷", "1D4ED8"),
        // Turkic
        LanguageInfo("tr", "Turkish", "Türkçe", "🇹🇷", "EF4444"),
        LanguageInfo("az", "Azerbaijani", "Azərbaycan", "🇦🇿", "0891B2"),
        LanguageInfo("kk", "Kazakh", "Қазақша", "🇰🇿", "0EA5E9"),
        LanguageInfo("uz", "Uzbek", "O'zbek", "🇺🇿", "0D9488"),
        // Semitic
        LanguageInfo("ar", "Arabic", "العربية", "🇸🇦", "15803D"),
        LanguageInfo("he", "Hebrew", "עברית", "🇮🇱", "1D4ED8"),
        LanguageInfo("am", "Amharic", "አማርኛ", "🇪🇹", "16A34A"),
        // Indo-Aryan
        LanguageInfo("hi", "Hindi", "हिन्दी", "🇮🇳", "F97316"),
        LanguageInfo("bn", "Bengali", "বাংলা", "🇧🇩", "059669"),
        LanguageInfo("ur", "Urdu", "اردو", "🇵🇰", "16A34A"),
        LanguageInfo("ne", "Nepali", "नेपाली", "🇳🇵", "DC2626"),
        LanguageInfo("ta", "Tamil", "தமிழ்", "🇮🇳", "D97706"),
        // Iranian
        LanguageInfo("fa", "Persian", "فارسی", "🇮🇷", "059669"),
        // Caucasian
        LanguageInfo("ka", "Georgian", "ქართული", "🇬🇪", "B91C1C"),
        LanguageInfo("hy", "Armenian", "Հայերեն", "🇦🇲", "EA580C"),
        // East Asian
        LanguageInfo("zh", "Chinese", "中文", "🇨🇳", "DC2626"),
        LanguageInfo("ja", "Japanese", "日本語", "🇯🇵", "E11D48"),
        LanguageInfo("ko", "Korean", "한국어", "🇰🇷", "1E40AF"),
        // Southeast Asian
        LanguageInfo("th", "Thai", "ไทย", "🇹🇭", "7C3AED"),
        LanguageInfo("vi", "Vietnamese", "Tiếng Việt", "🇻🇳", "DC2626"),
        LanguageInfo("id", "Indonesian", "Bahasa Indonesia", "🇮🇩", "EF4444"),
        LanguageInfo("ms", "Malay", "Bahasa Melayu", "🇲🇾", "1D4ED8"),
        LanguageInfo("tl", "Filipino", "Filipino", "🇵🇭", "2563EB"),
        LanguageInfo("my", "Burmese", "မြန်မာဘာသာ", "🇲🇲", "CA8A04"),
        LanguageInfo("km", "Khmer", "ភាសាខ្មែរ", "🇰🇭", "1E3A8A"),
        LanguageInfo("lo", "Lao", "ລາວ", "🇱🇦", "B91C1C"),
        // West African
        LanguageInfo("yo", "Yoruba", "Yorùbá", "🇳🇬", "16A34A"),
        LanguageInfo("ig", "Igbo", "Igbo", "🇳🇬", "15803D"),
        LanguageInfo("ha", "Hausa", "Hausa", "🇳🇬", "059669"),
        LanguageInfo("wo", "Wolof", "Wolof", "🇸🇳", "0D9488"),
        LanguageInfo("bm", "Bambara", "Bamanankan", "🇲🇱", "CA8A04"),
        LanguageInfo("ff", "Fulah", "Fulfulde", "🇸🇳", "0891B2"),
        LanguageInfo("tw", "Twi", "Twi", "🇬🇭", "D97706"),
        LanguageInfo("ee", "Ewe", "Eʋegbe", "🇬🇭", "B45309"),
        LanguageInfo("ak", "Akan", "Akan", "🇬🇭", "EA580C"),
        // Central African / Cameroon
        LanguageInfo("ln", "Lingala", "Lingála", "🇨🇩", "2563EB"),
        LanguageInfo("bas", "Bassa", "Ɓàsàa", "🇨🇲", "DC2626"),
        LanguageInfo("byv", "Medumba", "Mədùmbà", "🇨🇲", "16A34A"),
        LanguageInfo("dua", "Douala", "Duálá", "🇨🇲", "F59E0B"),
        LanguageInfo("ewo", "Ewondo", "Ewondo", "🇨🇲", "7C3AED"),
        LanguageInfo("fan", "Fang", "Fang", "🇨🇲", "0EA5E9"),
        // East & Southern African
        LanguageInfo("sw", "Swahili", "Kiswahili", "🇰🇪", "0D9488"),
        LanguageInfo("zu", "Zulu", "isiZulu", "🇿🇦", "1E40AF"),
        LanguageInfo("xh", "Xhosa", "isiXhosa", "🇿🇦", "0369A1"),
        LanguageInfo("sn", "Shona", "chiShona", "🇿🇼", "15803D"),
        LanguageInfo("rw", "Kinyarwanda", "Ikinyarwanda", "🇷🇼", "0EA5E9"),
        LanguageInfo("rn", "Kirundi", "Ikirundi", "🇧🇮", "DC2626"),
        LanguageInfo("lg", "Luganda", "Luganda", "🇺🇬", "CA8A04"),
        LanguageInfo("so", "Somali", "Soomaali", "🇸🇴", "2563EB"),
        LanguageInfo("mg", "Malagasy", "Malagasy", "🇲🇬", "16A34A"),
        LanguageInfo("om", "Oromo", "Afaan Oromoo", "🇪🇹", "DC2626"),
        LanguageInfo("ti", "Tigrinya", "ትግርኛ", "🇪🇷", "3B82F6"),
        LanguageInfo("ny", "Chichewa", "Chinyanja", "🇲🇼", "DC2626"),
        // Cameroon (transcription only: no NLLB-200 mapping, no TTS)
        LanguageInfo("ksf", "Bafia", "Rikpa", "🇨🇲", "16A34A"),
        LanguageInfo("nnh", "Ngiemboon", "Ngiemboon", "🇨🇲", "16A34A"),
    )

    /**
     * The codes shipped as interface (UI-chrome) languages, in display order. Derived
     * view over [allLanguages] so every language's metadata lives in exactly one place.
     */
    val interfaceLanguageCodes: List<String> = listOf("fr", "en", "es", "de", "it", "ar")

    /** UI-only interface languages, derived from [allLanguages] (no hand-copied drift). */
    val interfaceLanguages: List<LanguageInfo> =
        interfaceLanguageCodes.mapNotNull { code -> allLanguages.firstOrNull { it.code == code } }

    /**
     * The most frequently picked content languages, in the order they should surface at
     * the top of long pickers (onboarding / regional-language picker).
     */
    val commonLanguageCodes: List<String> = listOf(
        "fr", "en", "es", "de", "it", "pt", "ar", "zh", "ja", "ko",
        "ru", "tr", "nl", "pl", "sv", "hi", "th", "vi", "uk", "ro",
    )

    /**
     * [allLanguages] reordered so [commonLanguageCodes] lead in their declared order and
     * every other language follows in canonical order. A permutation — single base,
     * single ordering, nothing dropped or duplicated.
     */
    val allLanguagesCommonFirst: List<LanguageInfo> = run {
        val commonSet = commonLanguageCodes.toSet()
        val common = commonLanguageCodes.mapNotNull { code -> allLanguages.firstOrNull { it.code == code } }
        val rest = allLanguages.filterNot { it.code in commonSet }
        common + rest
    }

    /**
     * The set of Meeshy-supported codes (lowercase), derived from [allLanguages] so it never
     * drifts from the catalogue. Consumed by [me.meeshy.sdk.lang.LanguageCodeNormalizer] to
     * (a) preserve a supported 2-/3-letter code verbatim and (b) re-validate an ISO 639-3
     * reduction target. Mirror of iOS `LanguageData.supportedCodeSet`.
     */
    val supportedCodeSet: Set<String> = allLanguages.mapTo(HashSet()) { it.code.lowercase() }

    /** Hex (no `#`) of the colour of a language the catalogue does not know. */
    const val NEUTRAL_COLOR_HEX: String = "A3A3C2"

    /** Canonical-code aliases so legacy/BCP-47 spellings resolve (e.g. "fil" → "tl"). */
    private val aliases: Map<String, String> = mapOf("fil" to "tl")

    /**
     * Metadata for [code], or `null` when it is blank/absent or matches no known language.
     * Trimmed and case-insensitive; legacy aliases (e.g. "fil" → "tl") are resolved so
     * callers never need a local `lowercase()` / re-implemented matcher.
     */
    fun info(code: String?): LanguageInfo? {
        val cleaned = code?.trim()?.lowercase()?.takeIf { it.isNotEmpty() } ?: return null
        allLanguages.firstOrNull { it.code == cleaned }?.let { return it }
        val canonical = aliases[cleaned] ?: return null
        return allLanguages.firstOrNull { it.code == canonical }
    }

    /**
     * The name of [code] WRITTEN IN THAT LANGUAGE ("한국어", "العربية", "Français") — a list
     * of spoken languages reads the same for everybody, whatever the interface language.
     *
     * Resolution, mirror of iOS `LanguageData.autonym(for:)`: the catalogue first (exact
     * code, then the base language of a regional tag such as `pt-BR`), then the platform
     * [Locale] for a code the catalogue ignores — written in its own language and
     * capitalised word by word — and finally the code in capitals. A blank or absent code
     * yields an empty name. Never throws.
     */
    fun autonym(code: String?): String {
        val cleaned = code?.trim().orEmpty()
        if (cleaned.isEmpty()) return ""
        val base = baseLanguage(cleaned)
        return info(cleaned)?.nativeName
            ?: info(base)?.nativeName
            ?: localeAutonym(base)
            ?: cleaned.uppercase()
    }

    /**
     * The family colour of [code] (hex, no `#`): the catalogue entry of the exact code,
     * else of its base language (`pt-BR` → `pt`), else [NEUTRAL_COLOR_HEX]. Mirror of iOS
     * `LanguageData.colorHex(for:)` — an unknown language never borrows another one's colour.
     */
    fun colorHex(code: String?): String {
        val cleaned = code?.trim().orEmpty()
        return info(cleaned)?.colorHex
            ?: info(baseLanguage(cleaned))?.colorHex
            ?: NEUTRAL_COLOR_HEX
    }

    /** Lower-cased language subtag of a BCP-47 / POSIX tag (`pt-BR`, `zh_Hant` → `pt`, `zh`). */
    private fun baseLanguage(code: String): String =
        code.lowercase().split('-', '_').first()

    /**
     * The platform's own-language display name of [base], or `null` when the platform does
     * not know it (it then echoes the code back) or when [base] is not a well-formed language.
     */
    private fun localeAutonym(base: String): String? {
        val locale = try {
            Locale.Builder().setLanguage(base).build()
        } catch (ignored: IllformedLocaleException) {
            return null
        }
        val name = locale.getDisplayLanguage(locale)
        if (name.isBlank() || name.equals(base, ignoreCase = true)) return null
        return name.split(' ').joinToString(" ") { word ->
            word.replaceFirstChar { it.titlecase(locale) }
        }
    }
}
