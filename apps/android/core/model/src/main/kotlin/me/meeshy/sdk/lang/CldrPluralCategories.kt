package me.meeshy.sdk.lang

/**
 * One CLDR cardinal plural category — the `quantity` attribute of an Android `<item>`
 * inside a `<plurals>` resource, in CLDR's canonical order ([ZERO] to [OTHER]).
 */
public enum class PluralCategory(public val keyword: String) {
    ZERO("zero"),
    ONE("one"),
    TWO("two"),
    FEW("few"),
    MANY("many"),
    OTHER("other"),
    ;

    public companion object {
        /** The category named [keyword] (trim/case-insensitive), or `null` for anything else (`=0`, garbage). */
        public fun fromKeyword(keyword: String?): PluralCategory? {
            val cleaned = keyword?.trim()?.lowercase() ?: return null
            return entries.firstOrNull { it.keyword == cleaned }
        }
    }
}

/**
 * The plural categories a `<plurals>` resource must carry for a language — the pure law
 * behind the localization guard of `:app` (`LocalizationRules`), so that no count ever
 * falls back to the wrong grammatical form.
 *
 * Source: Unicode CLDR cardinal plural rules. The language is reduced through
 * [LanguageCodeNormalizer] first, so `pt-BR`, `pt_PT`, `pt-rBR` (Android resource
 * qualifier), `FR` and `fra` all resolve to their language; a language absent from the
 * table — or an unparsable tag — gets the Germanic default `one` + `other`.
 *
 * Deliberate choices, fixed by the guard's contract (lot garde-localisation-android):
 *  - French, Spanish and Portuguese require `many` (CLDR: exact millions, "1 million
 *    **de** réponses"); the Android runtime falls back to `other` without it, which
 *    reads wrong for those counts.
 *  - Italian stays at `one` + `other`, like the iOS catalogs it is generated from.
 *    CLDR 42 added `many` to Italian too; raise the requirement here, with the
 *    generator, when the product wants it.
 */
public object CldrPluralCategories {

    private val DEFAULT: List<PluralCategory> = listOf(PluralCategory.ONE, PluralCategory.OTHER)

    private val BY_LANGUAGE: Map<String, List<PluralCategory>> = buildMap {
        fun declare(vararg categories: PluralCategory, languages: List<String>) {
            val ordered = categories.toList()
            languages.forEach { put(it, ordered) }
        }

        declare(
            PluralCategory.OTHER,
            languages = listOf("zh", "ja", "ko", "vi", "th", "id", "ms", "my", "km", "lo", "jv", "yo", "ig", "wo", "bo"),
        )
        declare(
            PluralCategory.ONE, PluralCategory.MANY, PluralCategory.OTHER,
            languages = listOf("fr", "es", "pt", "ca"),
        )
        declare(
            PluralCategory.ONE, PluralCategory.FEW, PluralCategory.OTHER,
            languages = listOf("hr", "sr", "bs", "ro"),
        )
        declare(
            PluralCategory.ONE, PluralCategory.FEW, PluralCategory.MANY, PluralCategory.OTHER,
            languages = listOf("ru", "uk", "be", "pl", "cs", "sk", "lt"),
        )
        declare(
            PluralCategory.ONE, PluralCategory.TWO, PluralCategory.FEW, PluralCategory.OTHER,
            languages = listOf("sl"),
        )
        declare(
            PluralCategory.ZERO, PluralCategory.ONE, PluralCategory.OTHER,
            languages = listOf("lv"),
        )
        declare(
            PluralCategory.ONE, PluralCategory.TWO, PluralCategory.FEW, PluralCategory.MANY, PluralCategory.OTHER,
            languages = listOf("ga", "mt"),
        )
        declare(
            PluralCategory.ZERO, PluralCategory.ONE, PluralCategory.TWO,
            PluralCategory.FEW, PluralCategory.MANY, PluralCategory.OTHER,
            languages = listOf("ar", "cy"),
        )
    }

    /** The categories [languageTag] must provide, in CLDR order; always ends with [PluralCategory.OTHER]. */
    public fun required(languageTag: String?): List<PluralCategory> {
        val language = LanguageCodeNormalizer.normalize(languageTag) ?: return DEFAULT
        return BY_LANGUAGE[language] ?: DEFAULT
    }
}
