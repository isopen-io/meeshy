package me.meeshy.app.settings

import me.meeshy.sdk.model.LanguageData
import me.meeshy.sdk.model.LanguageInfo

/** A selectable regional (secondary content) language in the picker. */
data class RegionalLanguageOption(
    val code: String,
    val name: String,
    val nativeName: String,
    val flag: String,
    val isSelected: Boolean,
)

/** The projected regional-language picker: the current choice's label plus the option list. */
data class RegionalLanguagePresentation(
    val selectedLabel: String?,
    val options: List<RegionalLanguageOption>,
)

/**
 * Pure SSOT for the regional (secondary content) language picker.
 *
 * The regional language is a Prisme *content* preference (resolved via
 * [me.meeshy.sdk.lang.LanguageResolver]) — distinct from the interface (UI-chrome)
 * language — so its options are the full content-language set, common languages first
 * ([LanguageData.allLanguagesCommonFirst]), not the four interface languages.
 *
 * Coherence rules baked in here (surpassing iOS, whose picker offers the primary too):
 *  - The primary (`systemCode`) language is hidden — a user can never pick their primary
 *    as their secondary — **unless** it is the currently-stored choice, so a data
 *    inconsistency (`regional == system`) never hides the active selection.
 *  - Selection matching is trimmed and case-insensitive; a blank/absent/unknown stored
 *    code yields no label and no marked option (never a crash).
 *  - The search query is trimmed and matches case-insensitively over the English name,
 *    the native name and the code; an empty/whitespace query returns every option.
 *  - [selectedLabel] reflects the stored choice regardless of the transient search filter.
 */
object RegionalLanguageSelection {

    fun build(
        regionalCode: String?,
        systemCode: String?,
        query: String,
    ): RegionalLanguagePresentation {
        val selected = regionalCode.cleaned()
        val primary = systemCode.cleaned()
        val needle = query.trim()
        val options = LanguageData.allLanguagesCommonFirst
            .filter { it.code.notEquiv(primary) || it.code.equiv(selected) }
            .filter { needle.isEmpty() || it.matches(needle) }
            .map { it.toOption(selected) }
        return RegionalLanguagePresentation(
            selectedLabel = LanguageData.info(selected)?.nativeName,
            options = options,
        )
    }

    private fun LanguageInfo.toOption(selected: String?): RegionalLanguageOption =
        RegionalLanguageOption(
            code = code,
            name = name,
            nativeName = nativeName,
            flag = flag,
            isSelected = code.equiv(selected),
        )

    private fun LanguageInfo.matches(needle: String): Boolean =
        name.contains(needle, ignoreCase = true) ||
            nativeName.contains(needle, ignoreCase = true) ||
            code.contains(needle, ignoreCase = true)

    private fun String.equiv(other: String?): Boolean =
        other != null && equals(other, ignoreCase = true)

    private fun String.notEquiv(other: String?): Boolean = !equiv(other)

    private fun String?.cleaned(): String? = this?.trim()?.takeIf { it.isNotEmpty() }
}
