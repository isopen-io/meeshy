package me.meeshy.sdk.lang

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.PluralCategory.FEW
import me.meeshy.sdk.lang.PluralCategory.MANY
import me.meeshy.sdk.lang.PluralCategory.ONE
import me.meeshy.sdk.lang.PluralCategory.OTHER
import me.meeshy.sdk.lang.PluralCategory.TWO
import me.meeshy.sdk.lang.PluralCategory.ZERO
import org.junit.Test

/**
 * Behavioural spec for [CldrPluralCategories] — the categories a `<plurals>` resource
 * must carry for a language to render every count natively. It is the pure law behind
 * the localization guard of `:app`: a plural that lacks one of its language's quantities
 * silently falls back to `other` (or crashes a lookup on a stricter runtime), which is
 * exactly the kind of drift a CI gate must catch.
 */
class CldrPluralCategoriesTest {

    @Test
    fun required_arabic_carriesAllSixCategories() {
        assertThat(CldrPluralCategories.required("ar"))
            .containsExactly(ZERO, ONE, TWO, FEW, MANY, OTHER)
            .inOrder()
    }

    @Test
    fun required_french_spanishAndPortuguese_addManyToOneAndOther() {
        listOf("fr", "es", "pt").forEach { language ->
            assertThat(CldrPluralCategories.required(language))
                .containsExactly(ONE, MANY, OTHER)
                .inOrder()
        }
    }

    @Test
    fun required_englishGermanAndItalian_areOneAndOther() {
        listOf("en", "de", "it").forEach { language ->
            assertThat(CldrPluralCategories.required(language))
                .containsExactly(ONE, OTHER)
                .inOrder()
        }
    }

    @Test
    fun required_slavicAndBalticLanguages_carryFewAndMany() {
        listOf("ru", "uk", "pl", "cs", "lt").forEach { language ->
            assertThat(CldrPluralCategories.required(language))
                .containsExactly(ONE, FEW, MANY, OTHER)
                .inOrder()
        }
    }

    @Test
    fun required_languagesWithoutPluralForms_areOtherOnly() {
        listOf("zh", "ja", "ko", "vi", "th", "id").forEach { language ->
            assertThat(CldrPluralCategories.required(language)).containsExactly(OTHER)
        }
    }

    @Test
    fun required_regionAndScriptSubtags_areReducedToTheLanguage() {
        assertThat(CldrPluralCategories.required("pt-BR"))
            .isEqualTo(CldrPluralCategories.required("pt"))
        assertThat(CldrPluralCategories.required("pt_PT"))
            .isEqualTo(CldrPluralCategories.required("pt"))
        assertThat(CldrPluralCategories.required("zh-Hant-HK")).containsExactly(OTHER)
        assertThat(CldrPluralCategories.required("FR")).containsExactly(ONE, MANY, OTHER).inOrder()
    }

    @Test
    fun required_androidResourceQualifier_isReducedToTheLanguage() {
        assertThat(CldrPluralCategories.required("pt-rBR"))
            .isEqualTo(CldrPluralCategories.required("pt"))
    }

    @Test
    fun required_unknownOrBlankLanguage_isOneAndOther() {
        listOf("xx", "", "  ", "klingon", null).forEach { language ->
            assertThat(CldrPluralCategories.required(language))
                .containsExactly(ONE, OTHER)
                .inOrder()
        }
    }

    @Test
    fun required_threeLetterCode_isReducedThroughTheSharedNormalizer() {
        assertThat(CldrPluralCategories.required("fra"))
            .isEqualTo(CldrPluralCategories.required("fr"))
        assertThat(CldrPluralCategories.required("ara"))
            .isEqualTo(CldrPluralCategories.required("ar"))
    }

    @Test
    fun required_neverOmitsOther_forAnyLanguage() {
        listOf("ar", "fr", "en", "ru", "zh", "xx", "cy", "lv", "sl", "ga").forEach { language ->
            assertThat(CldrPluralCategories.required(language)).contains(OTHER)
        }
    }

    @Test
    fun keyword_isTheCldrNameUsedByAndroidQuantityAttribute() {
        assertThat(PluralCategory.entries.map { it.keyword })
            .containsExactly("zero", "one", "two", "few", "many", "other")
            .inOrder()
    }

    @Test
    fun fromKeyword_resolvesKnownKeywordsAndRejectsOthers() {
        assertThat(PluralCategory.fromKeyword("many")).isEqualTo(MANY)
        assertThat(PluralCategory.fromKeyword(" Other ")).isEqualTo(OTHER)
        assertThat(PluralCategory.fromKeyword("=0")).isNull()
        assertThat(PluralCategory.fromKeyword(null)).isNull()
    }
}
