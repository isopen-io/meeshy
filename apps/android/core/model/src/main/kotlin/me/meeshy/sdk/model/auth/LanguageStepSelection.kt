package me.meeshy.sdk.model.auth

import me.meeshy.sdk.model.LanguageData
import me.meeshy.sdk.model.LanguageInfo
import me.meeshy.sdk.model.search.SearchTextFolder

/**
 * Which of the two content-language slots the wizard's language step is editing.
 * Port of iOS `StepLanguageView.LanguageTarget`
 * (`apps/ios/Meeshy/Features/Auth/Onboarding/OnboardingStepViews.swift`).
 */
public enum class LanguageSlot { SYSTEM, REGIONAL }

/**
 * Immutable snapshot of the two content-language choices the language step edits —
 * the exact pair iOS exposes as `RegistrationViewModel.systemLanguage` /
 * `.regionalLanguage`.
 */
public data class LanguageSelectionState(
    val systemLanguage: String,
    val regionalLanguage: String,
)

/**
 * Pure decision core behind the registration wizard's Step 6 (system + regional
 * language selection with a live translation preview). Framework-free, JVM-testable,
 * and reuses the [LanguageData] catalogue as the single source of truth — nothing is
 * re-implemented or hand-copied.
 *
 * Parity source: iOS `StepLanguageView` over `RegistrationViewModel`.
 */
public object LanguageStepSelection {

    /**
     * The searchable picker list — every supported language, common codes first.
     * Mirrors iOS `LanguageSelector.defaultLanguages`
     * (`= LanguageData.allLanguagesCommonFirst`), so ordering and metadata never
     * drift from the catalogue.
     */
    public val pickerLanguages: List<LanguageInfo> get() = LanguageData.allLanguagesCommonFirst

    /**
     * iOS `filteredLanguages`: an empty query yields the whole list; otherwise a
     * case- AND accent-insensitive match on the native name OR the code (faithful to
     * iOS, which checks `searchText.isEmpty` untrimmed and matches `name`/`id`). The
     * native names carry their real diacritics ("Français"), so "francais" must still
     * find them ([SearchTextFolder], the port of iOS `.diacriticInsensitive`).
     */
    public fun filter(
        query: String,
        languages: List<LanguageInfo> = pickerLanguages,
    ): List<LanguageInfo> {
        if (query.isEmpty()) return languages
        val needle = SearchTextFolder.fold(query)
        return languages.filter {
            SearchTextFolder.fold(it.nativeName).contains(needle) ||
                SearchTextFolder.fold(it.code).contains(needle)
        }
    }

    /**
     * The summary-card label for a chosen [code]: `"<flag> <nativeName>"` when the
     * code resolves, else the raw code (iOS: `"\(flag ?? "") \(name ?? code)"`, but
     * without the leading-space artifact when nothing resolves).
     */
    public fun summaryLabel(code: String): String {
        val info = LanguageData.info(code) ?: return code
        return "${info.flag} ${info.nativeName}"
    }

    /**
     * The native name of the chosen [code] for the preview description, falling back
     * to the raw code (iOS `selectedSystemLangName`).
     */
    public fun selectedLanguageName(code: String): String =
        LanguageData.info(code)?.nativeName ?: code

    /**
     * The live translation-preview sentence for the chosen system language — a
     * verbatim port of iOS `translatedExample` (11 explicit arms + a French default
     * for every other language, including English).
     */
    public fun translationPreview(systemLanguage: String): String = when (systemLanguage) {
        "fr" -> "Salut! Comment ca va aujourd'hui?"
        "es" -> "Hola! Como estas hoy?"
        "de" -> "Hallo! Wie geht es dir heute?"
        "pt" -> "Ola! Como voce esta hoje?"
        "ar" -> "مرحبا! كيف حالك اليوم؟"
        "zh" -> "你好！今天你好吗？"
        "ja" -> "こんにちは！元気ですか？"
        "ko" -> "안녕하세요! 오늘 어떠세요?"
        "it" -> "Ciao! Come stai oggi?"
        "ru" -> "Привет! Как у тебя дела сегодня?"
        "tr" -> "Merhaba! Bugun nasilsin?"
        else -> "Salut! Comment ca va aujourd'hui?"
    }

    /**
     * Whether a picker card for [candidateCode] is highlighted — true when the
     * currently-edited [slot]'s code in [selection] equals it. Reads only the edited
     * slot (iOS `currentId = editingTarget == .system ? systemLanguage : regionalLanguage`).
     */
    public fun isSelected(
        slot: LanguageSlot,
        candidateCode: String,
        selection: LanguageSelectionState,
    ): Boolean = codeFor(slot, selection) == candidateCode

    /**
     * Applies a tap on [tappedCode] to the edited [slot], returning a new immutable
     * [LanguageSelectionState]; the other slot is untouched (iOS writes
     * `systemLanguage`/`regionalLanguage` depending on `editingTarget`).
     */
    public fun select(
        slot: LanguageSlot,
        tappedCode: String,
        selection: LanguageSelectionState,
    ): LanguageSelectionState = when (slot) {
        LanguageSlot.SYSTEM -> selection.copy(systemLanguage = tappedCode)
        LanguageSlot.REGIONAL -> selection.copy(regionalLanguage = tappedCode)
    }

    private fun codeFor(slot: LanguageSlot, selection: LanguageSelectionState): String =
        when (slot) {
            LanguageSlot.SYSTEM -> selection.systemLanguage
            LanguageSlot.REGIONAL -> selection.regionalLanguage
        }
}
