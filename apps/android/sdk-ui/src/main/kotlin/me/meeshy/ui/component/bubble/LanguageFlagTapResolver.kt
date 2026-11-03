package me.meeshy.ui.component.bubble

import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.BubbleFlagTap

/**
 * Pure resolver for a tap on a language-flag chip. The chat bubble follows iOS
 * `BubbleLanguageFlagController.handleTap` ([resolveBubble] : switch primary, open or close
 * the secondary panel, request the missing translation — the divergence of the single-primary
 * model is closed, directive #11570). Feed posts, comments and stories keep the single-primary
 * [resolve], which switches the displayed language.
 *
 * The resolver is stateless and content-agnostic: given the tapped code, the code
 * currently displayed (the active code), the source language, and the available
 * text translations, it returns the state transition the ViewModel must apply. It
 * lives in `:sdk-ui` as a building block shared by every language-strip surface
 * (chat bubbles, feed posts, stories) — one flag-tap rule, no re-implementation.
 */
public object LanguageFlagTapResolver {

    /** The transition a tap on a language chip produces. */
    public sealed interface Result {
        /** Switch the active display language to [code] (normalized). */
        public data class Activate(val code: String) : Result

        /** Revert to the default Prisme resolution — clear any active override. */
        public data object Revert : Result

        /**
         * The tapped language has no content yet — request an on-demand translation
         * into [targetLanguage] (normalized). Only reached when a surface renders
         * translatable chips (e.g. the language explorer); a read-only, content-only
         * strip never surfaces a content-less language, so callers of such a strip
         * treat this as inert.
         */
        public data class RequestTranslation(val targetLanguage: String) : Result

        /** The tap is inert (blank/absent code) — no state change. */
        public data object None : Result
    }

    /**
     * Resolve a flag tap.
     *
     * @param tappedCode the language code of the tapped chip.
     * @param activeCode the currently displayed language code (null when showing the
     *   default Prisme resolution with no explicit override).
     * @param originalLanguage the source language.
     * @param translations the available text translations.
     */
    public fun resolve(
        tappedCode: String,
        activeCode: String?,
        originalLanguage: String?,
        translations: List<LanguageResolver.TranslationLike>,
    ): Result {
        val tapped = tappedCode.normalized() ?: return Result.None
        val original = originalLanguage.normalized()
        val hasContent = tapped == original || translations.any {
            it.targetLanguage.normalized() == tapped && it.translatedContent.isNotBlank()
        }
        if (!hasContent) return Result.RequestTranslation(tapped)
        if (tapped == activeCode.normalized()) return Result.Revert
        return Result.Activate(tapped)
    }

    /**
     * The bubble's flag tap (iOS parity): the transition of the primary text and of the secondary panel.
     * [preferredCode] is the Prisme primary language, [translations] the available text translations.
     */
    public fun resolveBubble(
        tappedCode: String,
        activeCode: String?,
        secondaryCode: String?,
        originalLanguage: String?,
        preferredCode: String?,
        translations: List<LanguageResolver.TranslationLike>,
    ): BubbleFlagTap.Outcome = BubbleFlagTap.handleTap(
        code = tappedCode,
        current = BubbleFlagTap.Context(activeCode = activeCode, secondaryCode = secondaryCode),
        originalLanguage = originalLanguage,
        preferredCode = preferredCode,
        contentCodes = translations.filter { it.translatedContent.isNotBlank() }.map { it.targetLanguage }.toSet(),
    )

    private fun String?.normalized(): String? =
        this?.trim()?.lowercase()?.takeIf { it.isNotEmpty() }
}
