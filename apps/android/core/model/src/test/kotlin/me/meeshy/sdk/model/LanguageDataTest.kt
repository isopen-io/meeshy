package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for [LanguageData] — the single source of truth for per-language
 * flag / native-name / colour metadata (feature-parity §D). Covers the robust lookup
 * ([info]: trim + case-insensitive + alias-aware), the derived interface view, the
 * common-first ordering, and the completeness/uniqueness invariants of the base table.
 */
class LanguageDataTest {

    // ---- base table integrity -------------------------------------------

    @Test
    fun everyLanguageCodeIsUniqueAndLowercase() {
        val codes = LanguageData.allLanguages.map { it.code }
        assertThat(codes).containsNoDuplicates()
        assertThat(codes.all { it == it.lowercase() && it.isNotBlank() }).isTrue()
    }

    @Test
    fun everyLanguageCarriesNonBlankMetadata() {
        assertThat(
            LanguageData.allLanguages.all {
                it.name.isNotBlank() && it.nativeName.isNotBlank() &&
                    it.flag.isNotBlank() && it.colorHex.isNotBlank()
            },
        ).isTrue()
    }

    @Test
    fun catalanIsPresentWithItsMetadata() {
        val catalan = LanguageData.info("ca")
        assertThat(catalan).isNotNull()
        assertThat(catalan!!.name).isEqualTo("Catalan")
        assertThat(catalan.colorHex).isEqualTo("EAB308")
        assertThat(catalan.flag).isNotEmpty()
    }

    // ---- info(): robust lookup ------------------------------------------

    @Test
    fun infoResolvesAnExactCode() {
        assertThat(LanguageData.info("fr")?.name).isEqualTo("French")
    }

    @Test
    fun infoIsCaseInsensitive() {
        assertThat(LanguageData.info("FR")?.code).isEqualTo("fr")
        assertThat(LanguageData.info("Es")?.code).isEqualTo("es")
    }

    @Test
    fun infoTrimsSurroundingWhitespace() {
        assertThat(LanguageData.info("  de  ")?.code).isEqualTo("de")
    }

    @Test
    fun infoResolvesLegacyBcp47AliasFilToFilipino() {
        assertThat(LanguageData.info("fil")?.code).isEqualTo("tl")
        // alias resolution is also case-insensitive
        assertThat(LanguageData.info("FIL")?.code).isEqualTo("tl")
    }

    @Test
    fun infoReturnsNullForAnUnknownCode() {
        assertThat(LanguageData.info("zz")).isNull()
    }

    @Test
    fun infoReturnsNullForBlankOrAbsentInput() {
        assertThat(LanguageData.info(null)).isNull()
        assertThat(LanguageData.info("")).isNull()
        assertThat(LanguageData.info("   ")).isNull()
    }

    // ---- interface (UI-chrome) view -------------------------------------

    @Test
    fun interfaceLanguagesAreTheShippedUiCodesInOrder() {
        assertThat(LanguageData.interfaceLanguages.map { it.code })
            .containsExactly("fr", "en", "es", "ar")
            .inOrder()
    }

    @Test
    fun interfaceLanguagesAreDerivedFromTheBaseTableWithoutDrift() {
        // Each interface entry is the exact same metadata object as in allLanguages —
        // no hand-copied flag/colour that could silently diverge.
        LanguageData.interfaceLanguages.forEach { entry ->
            assertThat(entry).isEqualTo(LanguageData.info(entry.code))
        }
    }

    // ---- common-first ordering ------------------------------------------

    @Test
    fun commonFirstIsAPermutationOfTheFullTableNothingDroppedOrDuplicated() {
        val commonFirstCodes = LanguageData.allLanguagesCommonFirst.map { it.code }
        assertThat(commonFirstCodes).containsNoDuplicates()
        assertThat(commonFirstCodes)
            .containsExactlyElementsIn(LanguageData.allLanguages.map { it.code })
    }

    @Test
    fun commonFirstSurfacesTheCommonCodesFirstInTheirDeclaredOrder() {
        val leading = LanguageData.allLanguagesCommonFirst
            .map { it.code }
            .take(LanguageData.commonLanguageCodes.size)
        assertThat(leading).isEqualTo(LanguageData.commonLanguageCodes)
    }

    @Test
    fun everyCommonCodeExistsInTheBaseTable() {
        LanguageData.commonLanguageCodes.forEach { code ->
            assertThat(LanguageData.info(code)).isNotNull()
        }
    }
}
