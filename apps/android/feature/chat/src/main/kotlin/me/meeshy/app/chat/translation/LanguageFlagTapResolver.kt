package me.meeshy.app.chat.translation

import me.meeshy.sdk.lang.LanguageResolver

/**
 * Pure resolver for a tap on a message's language-flag chip — Android port of iOS
 * `BubbleLanguageFlagController.handleTap`, adapted to Android's single-primary
 * bubble model. Where iOS opens a stacked inline *secondary* panel for a tapped
 * translation, Android switches the bubble's **primary** displayed language: one
 * coherent view instead of a two-tier text stack (the deliberate "better choice"
 * per the routine's mandate to surpass iOS at the design level).
 *
 * The resolver is stateless: given the tapped code, the code currently displayed
 * (the active code), the message's original language, and its available text
 * translations, it returns the state transition the ViewModel must apply.
 */
object LanguageFlagTapResolver {

    /** The transition a tap on a language chip produces. */
    sealed interface Result {
        /** Switch the message's active display language to [code] (normalized). */
        data class Activate(val code: String) : Result

        /** Revert to the default Prisme resolution — clear any active override. */
        data object Revert : Result

        /**
         * The tapped language has no content yet — request an on-demand translation
         * into [targetLanguage] (normalized). The flag strip never surfaces a
         * content-less language today, so this is reached only from the (follow-on)
         * language explorer; the ViewModel treats it as inert until that slice lands.
         */
        data class RequestTranslation(val targetLanguage: String) : Result

        /** The tap is inert (blank/absent code) — no state change. */
        data object None : Result
    }

    /**
     * Resolve a flag tap.
     *
     * @param tappedCode the language code of the tapped chip.
     * @param activeCode the currently displayed language code (null when the bubble
     *   is showing the default Prisme resolution with no explicit override).
     * @param originalLanguage the message's source language.
     * @param translations the message's available text translations.
     */
    fun resolve(
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

    private fun String?.normalized(): String? =
        this?.trim()?.lowercase()?.takeIf { it.isNotEmpty() }
}
