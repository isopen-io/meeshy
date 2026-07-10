package me.meeshy.ui.component.bubble

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.LanguageData
import me.meeshy.sdk.model.LanguageInfo

/**
 * One language row in the per-message language explorer.
 *
 * [code] is the normalized (trimmed, lowercase) language code, [info] its static
 * [LanguageData] metadata (or null for an exotic code — the row still renders with
 * its raw code so nothing is silently dropped). [preview] is the translated text
 * truncated for the trailing hint, or null when the language has no content yet.
 * [hasContent] marks a language that already carries a non-blank translation;
 * [isTranslating] marks an in-flight on-demand translation; [isSelected] marks the
 * row the viewer has switched the bubble to. [canRetranslate] is true only when
 * content exists and no request is in flight (a refresh is a no-op otherwise).
 */
@Immutable
public data class LanguageExplorerRow(
    val code: String,
    val info: LanguageInfo?,
    val preview: String?,
    val hasContent: Boolean,
    val isTranslating: Boolean,
    val isSelected: Boolean,
    val canRetranslate: Boolean,
)

/**
 * The projected state of a message's language explorer: the original-language
 * banner plus one row per explorable target language.
 *
 * [originalCode] / [originalInfo] describe the source language (null when the
 * message has no declared original). [originalPreview] is the source text shown
 * under the banner — the text content, or the audio transcription when the message
 * carries no text, or empty when neither exists.
 */
@Immutable
public data class MessageLanguageExplorer(
    val originalCode: String?,
    val originalInfo: LanguageInfo?,
    val originalPreview: String,
    val rows: List<LanguageExplorerRow>,
)

/**
 * Prisme Linguistique — projects a message's full translation state into the
 * per-message language explorer (long-press → "Explore languages"). Android's
 * counterpart to iOS `MessageLanguageDetailView`: the exhaustive exploration view,
 * distinct from the discrete [MessageLanguageStrip] preview under the bubble.
 *
 * Where iOS ships a hand-curated 18-language list, Android surfaces the viewer's
 * **configured** content languages first (system → regional → custom, the ones the
 * viewer actually cares about) and then the remaining candidate languages — a
 * coherent, preference-led ordering rather than a fixed table. The projection is a
 * stateless building block: it takes opaque parameters (translations, in-flight
 * codes, the selected code) and encodes no "when to translate" decision — that
 * orchestration stays in the ViewModel.
 */
public object MessageDetailExplorer {

    /**
     * Build the explorer model for a message.
     *
     * @param originalLanguage the message's source language (blank/null → no banner
     *   code, and no language is excluded from the rows).
     * @param content the message's text content (empty for a voice message).
     * @param transcription the audio transcription, used for the banner preview when
     *   [content] is blank.
     * @param translations the message's available text translations.
     * @param preferences the viewer's configured content-language preferences; these
     *   languages lead the row order.
     * @param candidates the languages offered for exploration, in display order,
     *   after the configured ones (defaults to the common-first full table).
     * @param translatingCodes the language codes with an on-demand translation in
     *   flight (normalized on read).
     * @param selectedCode the language the viewer has switched the bubble to, if any.
     * @param previewLength the max length of a row's translated-text preview before
     *   it is ellipsized.
     */
    public fun build(
        originalLanguage: String?,
        content: String,
        transcription: String? = null,
        translations: List<LanguageResolver.TranslationLike>,
        preferences: LanguageResolver.ContentLanguagePreferences,
        candidates: List<LanguageInfo> = LanguageData.allLanguagesCommonFirst,
        translatingCodes: Set<String> = emptySet(),
        selectedCode: String? = null,
        previewLength: Int = 60,
    ): MessageLanguageExplorer {
        val original = originalLanguage.normalized()
        val selected = selectedCode.normalized()
        val inFlight = translatingCodes.mapNotNull { it.normalized() }.toSet()

        val ordered = LinkedHashSet<String>()
        for (language in LanguageResolver.preferredContentLanguages(preferences)) {
            val code = language.normalized() ?: continue
            if (code != original) ordered.add(code)
        }
        for (candidate in candidates) {
            val code = candidate.code.normalized() ?: continue
            if (code != original) ordered.add(code)
        }

        val rows = ordered.map { code ->
            val translated = translations.firstOrNull {
                it.targetLanguage.normalized() == code && it.translatedContent.isNotBlank()
            }?.translatedContent
            val isTranslating = code in inFlight
            LanguageExplorerRow(
                code = code,
                info = LanguageData.info(code),
                preview = translated?.let { truncate(it, previewLength) },
                hasContent = translated != null,
                isTranslating = isTranslating,
                isSelected = code == selected,
                canRetranslate = translated != null && !isTranslating,
            )
        }

        return MessageLanguageExplorer(
            originalCode = original,
            originalInfo = LanguageData.info(original),
            originalPreview = bannerPreview(content, transcription),
            rows = rows,
        )
    }

    private fun bannerPreview(content: String, transcription: String?): String {
        val text = content.trim()
        if (text.isNotEmpty()) return text
        return transcription?.trim().orEmpty()
    }

    private fun truncate(text: String, max: Int): String =
        if (text.length <= max) text else text.take(max) + "…"

    private fun String?.normalized(): String? =
        this?.trim()?.lowercase()?.takeIf { it.isNotEmpty() }
}
