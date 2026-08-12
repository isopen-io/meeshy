package me.meeshy.app.settings

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.LanguageData
import org.junit.Test

/**
 * Behavioural spec for [RegionalLanguageSelection] — the pure SSOT that projects the
 * regional (secondary content) language picker. It marks the current choice, hides the
 * primary (system) language so a user can never pick their primary as their secondary,
 * and applies a trimmed, case-insensitive search over the full content-language set.
 */
class RegionalLanguageSelectionTest {

    @Test
    fun withNoSelection_nothingIsMarkedAndThereIsNoSelectedLabel() {
        val result = RegionalLanguageSelection.build(regionalCode = null, systemCode = null, query = "")

        assertThat(result.selectedLabel).isNull()
        assertThat(result.options.none { it.isSelected }).isTrue()
        assertThat(result.options).isNotEmpty()
    }

    @Test
    fun aBlankSelection_isTreatedAsNoSelection() {
        val result = RegionalLanguageSelection.build(regionalCode = "   ", systemCode = null, query = "")

        assertThat(result.selectedLabel).isNull()
        assertThat(result.options.none { it.isSelected }).isTrue()
    }

    @Test
    fun theSelectedLanguageIsMarkedAndItsNativeNameIsTheLabel() {
        val result = RegionalLanguageSelection.build(regionalCode = "es", systemCode = null, query = "")

        val spanish = LanguageData.info("es")!!
        assertThat(result.selectedLabel).isEqualTo(spanish.nativeName)
        assertThat(result.options.single { it.code == "es" }.isSelected).isTrue()
        assertThat(result.options.count { it.isSelected }).isEqualTo(1)
    }

    @Test
    fun selectionMatchingIsCaseInsensitiveAndTrimmed() {
        val result = RegionalLanguageSelection.build(regionalCode = " ES ", systemCode = null, query = "")

        assertThat(result.options.single { it.code == "es" }.isSelected).isTrue()
        assertThat(result.selectedLabel).isEqualTo(LanguageData.info("es")!!.nativeName)
    }

    @Test
    fun anUnknownSelectedCode_yieldsNoLabelAndNoMarkedOption() {
        val result = RegionalLanguageSelection.build(regionalCode = "zz", systemCode = null, query = "")

        assertThat(result.selectedLabel).isNull()
        assertThat(result.options.none { it.isSelected }).isTrue()
    }

    @Test
    fun thePrimarySystemLanguageIsExcludedFromTheOptions() {
        val result = RegionalLanguageSelection.build(regionalCode = null, systemCode = "fr", query = "")

        assertThat(result.options.none { it.code == "fr" }).isTrue()
        // every other language remains available
        assertThat(result.options.any { it.code == "en" }).isTrue()
    }

    @Test
    fun primaryExclusionIsCaseInsensitiveAndTrimmed() {
        val result = RegionalLanguageSelection.build(regionalCode = null, systemCode = " FR ", query = "")

        assertThat(result.options.none { it.code == "fr" }).isTrue()
    }

    @Test
    fun aNullPrimary_excludesNothing() {
        val result = RegionalLanguageSelection.build(regionalCode = null, systemCode = null, query = "")

        assertThat(result.options.size).isEqualTo(LanguageData.allLanguages.size)
    }

    @Test
    fun whenTheSelectionEqualsThePrimary_theSelectionStaysVisibleAndMarked() {
        // Data-inconsistency safety: the active choice is never hidden by the primary filter.
        val result = RegionalLanguageSelection.build(regionalCode = "fr", systemCode = "fr", query = "")

        val french = result.options.singleOrNull { it.code == "fr" }
        assertThat(french).isNotNull()
        assertThat(french!!.isSelected).isTrue()
    }

    @Test
    fun anEmptyQuery_returnsEveryOption() {
        val result = RegionalLanguageSelection.build(regionalCode = null, systemCode = null, query = "")

        assertThat(result.options.size).isEqualTo(LanguageData.allLanguages.size)
    }

    @Test
    fun aWhitespaceQuery_isTreatedAsEmpty() {
        val result = RegionalLanguageSelection.build(regionalCode = null, systemCode = null, query = "   ")

        assertThat(result.options.size).isEqualTo(LanguageData.allLanguages.size)
    }

    @Test
    fun theQueryMatchesByEnglishName_caseInsensitively() {
        val result = RegionalLanguageSelection.build(regionalCode = null, systemCode = null, query = "SPAN")

        assertThat(result.options).isNotEmpty()
        assertThat(result.options.all { it.name.contains("Span", ignoreCase = true) }).isTrue()
        assertThat(result.options.any { it.code == "es" }).isTrue()
    }

    @Test
    fun theQueryMatchesByNativeName() {
        val result = RegionalLanguageSelection.build(regionalCode = null, systemCode = null, query = "Deutsch")

        assertThat(result.options.map { it.code }).containsExactly("de")
    }

    @Test
    fun theQueryMatchesByCode() {
        val result = RegionalLanguageSelection.build(regionalCode = null, systemCode = null, query = "ja")

        assertThat(result.options.any { it.code == "ja" }).isTrue()
        assertThat(result.options.all {
            it.code.contains("ja", ignoreCase = true) ||
                it.name.contains("ja", ignoreCase = true) ||
                it.nativeName.contains("ja", ignoreCase = true)
        }).isTrue()
    }

    @Test
    fun aQueryMatchingNothing_returnsAnEmptyList() {
        val result = RegionalLanguageSelection.build(regionalCode = null, systemCode = null, query = "qxz")

        assertThat(result.options).isEmpty()
    }

    @Test
    fun theSelectedLabelSurvivesEvenWhenSearchFiltersTheSelectionOut() {
        // The label reflects the stored choice regardless of the transient search filter.
        val result = RegionalLanguageSelection.build(regionalCode = "es", systemCode = null, query = "german")

        assertThat(result.selectedLabel).isEqualTo(LanguageData.info("es")!!.nativeName)
        assertThat(result.options.none { it.code == "es" }).isTrue()
    }

    @Test
    fun theOptionsSurfaceTheCommonLanguagesFirstInTheirDeclaredOrder() {
        // With no primary hidden and no filter, the picker leads with the common set so
        // the most frequently picked languages are reachable without scrolling.
        val result = RegionalLanguageSelection.build(regionalCode = null, systemCode = null, query = "")

        val leading = result.options.map { it.code }.take(LanguageData.commonLanguageCodes.size)
        assertThat(leading).isEqualTo(LanguageData.commonLanguageCodes)
    }

    @Test
    fun theSelectedLabelResolvesALegacyAliasCode() {
        // "fil" is the BCP-47 spelling of Filipino ("tl"); the label still resolves.
        val result = RegionalLanguageSelection.build(regionalCode = "fil", systemCode = null, query = "")

        assertThat(result.selectedLabel).isEqualTo(LanguageData.info("tl")!!.nativeName)
    }

    @Test
    fun eachOptionCarriesTheFlagAndDisplayNamesFromTheLanguageTable() {
        val result = RegionalLanguageSelection.build(regionalCode = null, systemCode = null, query = "Japanese")

        val option = result.options.single()
        val japanese = LanguageData.info("ja")!!
        assertThat(option.code).isEqualTo(japanese.code)
        assertThat(option.name).isEqualTo(japanese.name)
        assertThat(option.nativeName).isEqualTo(japanese.nativeName)
        assertThat(option.flag).isEqualTo(japanese.flag)
    }
}
