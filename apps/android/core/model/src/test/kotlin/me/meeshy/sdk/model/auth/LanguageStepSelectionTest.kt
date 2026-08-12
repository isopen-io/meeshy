package me.meeshy.sdk.model.auth

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.LanguageData
import org.junit.Test

/**
 * Behavioural spec for the pure content-language step core
 * ([LanguageSlot] + [LanguageSelectionState] + [LanguageStepSelection]) backing the
 * registration wizard's Step 6 (system + regional language selection with a live
 * translation preview).
 *
 * Parity source: iOS `StepLanguageView`
 * (`apps/ios/Meeshy/Features/Auth/Onboarding/OnboardingStepViews.swift`) over
 * `RegistrationViewModel.systemLanguage` / `.regionalLanguage`:
 *   - `languages = LanguageSelector.defaultLanguages` = `LanguageData.allLanguagesCommonFirst`
 *     mapped to (id = code, name = nativeName, flag);
 *   - `filteredLanguages`: empty search → the whole list, else a case-insensitive
 *     `name.contains || id.contains` match;
 *   - the two summary cards render `"<flag> <name>"` for the selected code, falling
 *     back to the raw code when unresolved;
 *   - a card is `isSelected` when the currently-edited slot's code equals its id, and
 *     tapping it writes the code into that slot (`systemLanguage`/`regionalLanguage`);
 *   - `translatedExample` maps `systemLanguage` to a canned preview sentence (11 arms
 *     + a French default).
 *
 * SOTA note: iOS scatters the filter, the summary-label fallback, the slot-aware
 * selection write, and the preview switch across a SwiftUI `View` body and its
 * `@State editingTarget`. Android lifts every decision into one framework-free SSOT
 * that *reuses* the `LanguageData` catalogue, so the picker composable is a thin
 * caller and every branch is JVM-testable.
 *
 * Expectations are hand-written literals, independent of how production derives them.
 */
class LanguageStepSelectionTest {

    // --- pickerLanguages: the searchable list, reusing the SSOT ---

    @Test
    fun pickerLanguages_isTheCommonFirstCatalogue() {
        assertThat(LanguageStepSelection.pickerLanguages)
            .isEqualTo(LanguageData.allLanguagesCommonFirst)
    }

    @Test
    fun pickerLanguages_leadsWithFrench_theFirstCommonCode() {
        assertThat(LanguageStepSelection.pickerLanguages.first().code).isEqualTo("fr")
    }

    // --- filter: empty query returns everything ---

    @Test
    fun filter_emptyQuery_returnsTheFullList() {
        assertThat(LanguageStepSelection.filter(""))
            .isEqualTo(LanguageStepSelection.pickerLanguages)
    }

    @Test
    fun filter_matchesByNativeName_caseInsensitively() {
        val result = LanguageStepSelection.filter("DEUTSCH")
        assertThat(result.map { it.code }).contains("de")
        assertThat(result.all {
            it.nativeName.lowercase().contains("deutsch") || it.code.lowercase().contains("deutsch")
        }).isTrue()
    }

    @Test
    fun filter_matchesByCode() {
        val result = LanguageStepSelection.filter("ja")
        assertThat(result.map { it.code }).contains("ja")
    }

    @Test
    fun filter_noMatch_returnsEmpty() {
        assertThat(LanguageStepSelection.filter("zzzznotalanguage")).isEmpty()
    }

    @Test
    fun filter_matchOnCodeAndName_doesNotDuplicate() {
        // "fr" matches French by code; ensure no entry is emitted twice.
        val result = LanguageStepSelection.filter("fr")
        assertThat(result).containsNoDuplicates()
    }

    // --- summaryLabel: flag + native name, raw-code fallback ---

    @Test
    fun summaryLabel_knownCode_isFlagAndNativeName() {
        val info = LanguageData.info("fr")!!
        assertThat(LanguageStepSelection.summaryLabel("fr"))
            .isEqualTo("${info.flag} ${info.nativeName}")
    }

    @Test
    fun summaryLabel_unknownCode_fallsBackToRawCode() {
        assertThat(LanguageStepSelection.summaryLabel("qx")).isEqualTo("qx")
    }

    @Test
    fun summaryLabel_blankCode_fallsBackToRawInput() {
        assertThat(LanguageStepSelection.summaryLabel("")).isEqualTo("")
    }

    // --- selectedLanguageName: for the preview description ---

    @Test
    fun selectedLanguageName_knownCode_isNativeName() {
        assertThat(LanguageStepSelection.selectedLanguageName("es"))
            .isEqualTo(LanguageData.info("es")!!.nativeName)
    }

    @Test
    fun selectedLanguageName_unknownCode_fallsBackToRawCode() {
        assertThat(LanguageStepSelection.selectedLanguageName("qx")).isEqualTo("qx")
    }

    // --- translationPreview: the live preview sentence ---

    @Test
    fun translationPreview_french() {
        assertThat(LanguageStepSelection.translationPreview("fr"))
            .isEqualTo("Salut! Comment ca va aujourd'hui?")
    }

    @Test
    fun translationPreview_spanish() {
        assertThat(LanguageStepSelection.translationPreview("es"))
            .isEqualTo("Hola! Como estas hoy?")
    }

    @Test
    fun translationPreview_german() {
        assertThat(LanguageStepSelection.translationPreview("de"))
            .isEqualTo("Hallo! Wie geht es dir heute?")
    }

    @Test
    fun translationPreview_portuguese() {
        assertThat(LanguageStepSelection.translationPreview("pt"))
            .isEqualTo("Ola! Como voce esta hoje?")
    }

    @Test
    fun translationPreview_arabic() {
        assertThat(LanguageStepSelection.translationPreview("ar"))
            .isEqualTo("مرحبا! كيف حالك اليوم؟")
    }

    @Test
    fun translationPreview_chinese() {
        assertThat(LanguageStepSelection.translationPreview("zh"))
            .isEqualTo("你好！今天你好吗？")
    }

    @Test
    fun translationPreview_japanese() {
        assertThat(LanguageStepSelection.translationPreview("ja"))
            .isEqualTo("こんにちは！元気ですか？")
    }

    @Test
    fun translationPreview_korean() {
        assertThat(LanguageStepSelection.translationPreview("ko"))
            .isEqualTo("안녕하세요! 오늘 어떠세요?")
    }

    @Test
    fun translationPreview_italian() {
        assertThat(LanguageStepSelection.translationPreview("it"))
            .isEqualTo("Ciao! Come stai oggi?")
    }

    @Test
    fun translationPreview_russian() {
        assertThat(LanguageStepSelection.translationPreview("ru"))
            .isEqualTo("Привет! Как у тебя дела сегодня?")
    }

    @Test
    fun translationPreview_turkish() {
        assertThat(LanguageStepSelection.translationPreview("tr"))
            .isEqualTo("Merhaba! Bugun nasilsin?")
    }

    @Test
    fun translationPreview_unknownLanguage_fallsBackToFrench() {
        assertThat(LanguageStepSelection.translationPreview("xx"))
            .isEqualTo("Salut! Comment ca va aujourd'hui?")
    }

    @Test
    fun translationPreview_englishSystem_fallsBackToFrenchDefault() {
        // English is not one of the 11 explicit arms → the French default applies,
        // faithfully porting the iOS `default:` case.
        assertThat(LanguageStepSelection.translationPreview("en"))
            .isEqualTo("Salut! Comment ca va aujourd'hui?")
    }

    // --- isSelected: slot-aware highlight ---

    private fun state(system: String, regional: String) =
        LanguageSelectionState(systemLanguage = system, regionalLanguage = regional)

    @Test
    fun isSelected_systemSlot_matchesSystemLanguage() {
        val s = state(system = "fr", regional = "en")
        assertThat(LanguageStepSelection.isSelected(LanguageSlot.SYSTEM, "fr", s)).isTrue()
        assertThat(LanguageStepSelection.isSelected(LanguageSlot.SYSTEM, "en", s)).isFalse()
    }

    @Test
    fun isSelected_regionalSlot_matchesRegionalLanguage() {
        val s = state(system = "fr", regional = "en")
        assertThat(LanguageStepSelection.isSelected(LanguageSlot.REGIONAL, "en", s)).isTrue()
        assertThat(LanguageStepSelection.isSelected(LanguageSlot.REGIONAL, "fr", s)).isFalse()
    }

    @Test
    fun isSelected_readsOnlyTheEditedSlot() {
        // Same code in both slots must not leak: editing REGIONAL ignores systemLanguage.
        val s = state(system = "es", regional = "fr")
        assertThat(LanguageStepSelection.isSelected(LanguageSlot.REGIONAL, "es", s)).isFalse()
        assertThat(LanguageStepSelection.isSelected(LanguageSlot.SYSTEM, "es", s)).isTrue()
    }

    // --- select: slot-aware write ---

    @Test
    fun select_systemSlot_writesOnlySystemLanguage() {
        val s = state(system = "fr", regional = "en")
        val next = LanguageStepSelection.select(LanguageSlot.SYSTEM, "de", s)
        assertThat(next).isEqualTo(state(system = "de", regional = "en"))
    }

    @Test
    fun select_regionalSlot_writesOnlyRegionalLanguage() {
        val s = state(system = "fr", regional = "en")
        val next = LanguageStepSelection.select(LanguageSlot.REGIONAL, "es", s)
        assertThat(next).isEqualTo(state(system = "fr", regional = "es"))
    }

    @Test
    fun select_reSelectingTheSameCode_isInert() {
        val s = state(system = "fr", regional = "en")
        assertThat(LanguageStepSelection.select(LanguageSlot.SYSTEM, "fr", s)).isEqualTo(s)
    }

    @Test
    fun select_leavesTheInputStateUnmutated() {
        val s = state(system = "fr", regional = "en")
        LanguageStepSelection.select(LanguageSlot.SYSTEM, "de", s)
        assertThat(s).isEqualTo(state(system = "fr", regional = "en"))
    }
}
