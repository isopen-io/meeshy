package me.meeshy.sdk.model

/** Static metadata for a language — port of LanguageInfo (LanguageData.swift). */
data class LanguageInfo(
    val code: String,
    val name: String,
    val nativeName: String,
    val flag: String,
    val colorHex: String,
)

/** Static language tables — port of LanguageData (LanguageData.swift). */
object LanguageData {

    /** All translation-target languages. */
    val allLanguages: List<LanguageInfo> = listOf(
        // Romance
        LanguageInfo("fr", "French", "Francais", "🇫🇷", "3B82F6"),
        LanguageInfo("es", "Spanish", "Espanol", "🇪🇸", "EF4444"),
        LanguageInfo("it", "Italian", "Italiano", "🇮🇹", "22C55E"),
        LanguageInfo("pt", "Portuguese", "Portugues", "🇧🇷", "16A34A"),
        LanguageInfo("ro", "Romanian", "Romana", "🇷🇴", "2563EB"),
        LanguageInfo("ca", "Catalan", "Catala", "🏴", "EAB308"),
        // Germanic
        LanguageInfo("en", "English", "English", "🇬🇧", "6366F1"),
        LanguageInfo("de", "German", "Deutsch", "🇩🇪", "F59E0B"),
        LanguageInfo("nl", "Dutch", "Nederlands", "🇳🇱", "F97316"),
        LanguageInfo("sv", "Swedish", "Svenska", "🇸🇪", "0EA5E9"),
        LanguageInfo("da", "Danish", "Dansk", "🇩🇰", "DC2626"),
        LanguageInfo("no", "Norwegian", "Norsk", "🇳🇴", "1D4ED8"),
        LanguageInfo("af", "Afrikaans", "Afrikaans", "🇿🇦", "059669"),
        // Slavic
        LanguageInfo("ru", "Russian", "Russkij", "🇷🇺", "DC2626"),
        LanguageInfo("uk", "Ukrainian", "Ukrainska", "🇺🇦", "FBBF24"),
        LanguageInfo("pl", "Polish", "Polski", "🇵🇱", "E11D48"),
        LanguageInfo("cs", "Czech", "Cestina", "🇨🇿", "1E40AF"),
        LanguageInfo("sk", "Slovak", "Slovencina", "🇸🇰", "1E3A8A"),
        LanguageInfo("bg", "Bulgarian", "Balgarski", "🇧🇬", "15803D"),
        LanguageInfo("hr", "Croatian", "Hrvatski", "🇭🇷", "B91C1C"),
        LanguageInfo("sr", "Serbian", "Srpski", "🇷🇸", "9F1239"),
        LanguageInfo("sl", "Slovenian", "Slovenscina", "🇸🇮", "0369A1"),
        // Baltic
        LanguageInfo("lt", "Lithuanian", "Lietuviu", "🇱🇹", "CA8A04"),
        LanguageInfo("lv", "Latvian", "Latviesu", "🇱🇻", "7C2D12"),
        // Finno-Ugric
        LanguageInfo("fi", "Finnish", "Suomi", "🇫🇮", "2563EB"),
        LanguageInfo("hu", "Hungarian", "Magyar", "🇭🇺", "B45309"),
        LanguageInfo("et", "Estonian", "Eesti", "🇪🇪", "0284C7"),
        // Hellenic
        LanguageInfo("el", "Greek", "Ellinika", "🇬🇷", "1D4ED8"),
        // Turkic
        LanguageInfo("tr", "Turkish", "Turkce", "🇹🇷", "EF4444"),
        LanguageInfo("az", "Azerbaijani", "Azerbaycan", "🇦🇿", "0891B2"),
        LanguageInfo("kk", "Kazakh", "Kazaksa", "🇰🇿", "0EA5E9"),
        LanguageInfo("uz", "Uzbek", "O'zbek", "🇺🇿", "0D9488"),
        // Semitic
        LanguageInfo("ar", "Arabic", "al-arabiyyah", "🇸🇦", "15803D"),
        LanguageInfo("he", "Hebrew", "ivrit", "🇮🇱", "1D4ED8"),
        LanguageInfo("am", "Amharic", "amarinya", "🇪🇹", "16A34A"),
        // Indo-Aryan
        LanguageInfo("hi", "Hindi", "hindi", "🇮🇳", "F97316"),
        LanguageInfo("bn", "Bengali", "bangla", "🇧🇩", "059669"),
        LanguageInfo("ur", "Urdu", "urdu", "🇵🇰", "16A34A"),
        LanguageInfo("ne", "Nepali", "nepali", "🇳🇵", "DC2626"),
        LanguageInfo("ta", "Tamil", "tamil", "🇮🇳", "D97706"),
        // Iranian
        LanguageInfo("fa", "Persian", "farsi", "🇮🇷", "059669"),
        // Caucasian
        LanguageInfo("ka", "Georgian", "kartuli", "🇬🇪", "B91C1C"),
        LanguageInfo("hy", "Armenian", "hayeren", "🇦🇲", "EA580C"),
        // East Asian
        LanguageInfo("zh", "Chinese", "zhongwen", "🇨🇳", "DC2626"),
        LanguageInfo("ja", "Japanese", "nihongo", "🇯🇵", "E11D48"),
        LanguageInfo("ko", "Korean", "hangugeo", "🇰🇷", "1E40AF"),
        // Southeast Asian
        LanguageInfo("th", "Thai", "thai", "🇹🇭", "7C3AED"),
        LanguageInfo("vi", "Vietnamese", "Tieng Viet", "🇻🇳", "DC2626"),
        LanguageInfo("id", "Indonesian", "Bahasa Indonesia", "🇮🇩", "EF4444"),
        LanguageInfo("ms", "Malay", "Bahasa Melayu", "🇲🇾", "1D4ED8"),
        LanguageInfo("tl", "Filipino", "Filipino", "🇵🇭", "2563EB"),
        LanguageInfo("my", "Burmese", "myanmar", "🇲🇲", "CA8A04"),
        LanguageInfo("km", "Khmer", "khmer", "🇰🇭", "1E3A8A"),
        LanguageInfo("lo", "Lao", "lao", "🇱🇦", "B91C1C"),
        // West African
        LanguageInfo("yo", "Yoruba", "Yoruba", "🇳🇬", "16A34A"),
        LanguageInfo("ig", "Igbo", "Igbo", "🇳🇬", "15803D"),
        LanguageInfo("ha", "Hausa", "Hausa", "🇳🇬", "059669"),
        LanguageInfo("wo", "Wolof", "Wolof", "🇸🇳", "0D9488"),
        LanguageInfo("bm", "Bambara", "Bamanankan", "🇲🇱", "CA8A04"),
        LanguageInfo("ff", "Fulah", "Fulfulde", "🇸🇳", "0891B2"),
        LanguageInfo("tw", "Twi", "Twi", "🇬🇭", "D97706"),
        LanguageInfo("ee", "Ewe", "Ewegbe", "🇬🇭", "B45309"),
        LanguageInfo("ak", "Akan", "Akan", "🇬🇭", "EA580C"),
        // Central African / Cameroon
        LanguageInfo("ln", "Lingala", "Lingala", "🇨🇩", "2563EB"),
        LanguageInfo("bas", "Bassa", "Basaa", "🇨🇲", "DC2626"),
        LanguageInfo("byv", "Medumba", "Medumba", "🇨🇲", "16A34A"),
        LanguageInfo("dua", "Douala", "Duala", "🇨🇲", "F59E0B"),
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
    )

    /**
     * The codes shipped as interface (UI-chrome) languages, in display order. Derived
     * view over [allLanguages] so every language's metadata lives in exactly one place.
     */
    val interfaceLanguageCodes: List<String> = listOf("fr", "en", "es", "ar")

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
}
