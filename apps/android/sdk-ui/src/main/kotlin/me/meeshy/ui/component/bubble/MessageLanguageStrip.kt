package me.meeshy.ui.component.bubble

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.LanguageData
import me.meeshy.sdk.model.LanguageInfo

/**
 * One flag chip in a message's translation strip / language explorer.
 *
 * [code] is the normalized (trimmed, lowercase) language code. [info] is the
 * static [LanguageData] metadata (flag, native name, colour) or null when the
 * code matches no known language — the chip still renders with its raw code so
 * an exotic original language is never silently dropped. [isOriginal] marks the
 * message's source language; [isActive] marks the language currently displayed
 * as the bubble's primary text.
 */
@Immutable
public data class LanguageChip(
    val code: String,
    val info: LanguageInfo?,
    val isOriginal: Boolean,
    val isActive: Boolean,
)

/**
 * Prisme Linguistique — projects a message's translation state into the ordered
 * flag strip shown under a translated bubble (and the seed of the per-message
 * language explorer). Port of iOS `BubbleContentBuilder.buildAvailableFlags`,
 * enriched: each entry is a full [LanguageChip] carrying [LanguageData] metadata
 * plus the `isActive` marker, and the active language is kept in the strip (iOS
 * drops it) so the UI can highlight the current selection rather than hide it.
 *
 * The strip surfaces only the languages relevant to the viewer's own
 * configuration — the message's original plus each configured content language
 * (system → regional → custom) that actually has content — never every language
 * the message happens to carry. This mirrors the iOS "max 4, deduplicated" rule
 * and keeps the strip a discrete Prisme indicator, not a language dump.
 */
public object MessageLanguageStrip {

    /**
     * Build the chip strip for a message.
     *
     * @param originalLanguage the message's source language (blank/null → no
     *   original chip is anchored).
     * @param translations the message's available text translations.
     * @param preferences the viewer's configured content-language preferences.
     * @param showingOriginal true when the viewer has toggled the bubble back to
     *   its original text (the original chip becomes active instead of the
     *   preferred translation).
     * @param activeCodeOverride when non-blank, the exact language the viewer has
     *   switched to via a flag tap — it wins over the [showingOriginal] default so
     *   the strip highlights the currently displayed language (including a third
     *   configured language, not just original/preferred). Null falls back to the
     *   [showingOriginal] computation, preserving the read-only default behaviour.
     * @return an ordered, de-duplicated list of chips, or empty when the message
     *   is not translated for this viewer (no preferred-language translation
     *   exists) — in which case there is nothing to explore and no strip shows.
     */
    public fun build(
        originalLanguage: String?,
        translations: List<LanguageResolver.TranslationLike>,
        preferences: LanguageResolver.ContentLanguagePreferences,
        showingOriginal: Boolean,
        activeCodeOverride: String? = null,
    ): List<LanguageChip> {
        val preferred = LanguageResolver.preferredTranslation(translations, preferences)
            ?: return emptyList()
        val original = originalLanguage.normalized()
        val preferredCode = preferred.targetLanguage.normalized()
        val activeCode = activeCodeOverride.normalized()
            ?: if (showingOriginal) original else preferredCode

        val codes = LinkedHashSet<String>()
        original?.let(codes::add)
        for (language in LanguageResolver.preferredContentLanguages(preferences)) {
            val code = language.normalized() ?: continue
            if (code == original || hasContent(code, translations)) codes.add(code)
        }

        return codes.map { code ->
            LanguageChip(
                code = code,
                info = LanguageData.info(code),
                isOriginal = code == original,
                isActive = code == activeCode,
            )
        }
    }

    private fun hasContent(
        code: String,
        translations: List<LanguageResolver.TranslationLike>,
    ): Boolean = translations.any {
        it.targetLanguage.normalized() == code && it.translatedContent.isNotBlank()
    }

    private fun String?.normalized(): String? =
        this?.trim()?.lowercase()?.takeIf { it.isNotEmpty() }
}
