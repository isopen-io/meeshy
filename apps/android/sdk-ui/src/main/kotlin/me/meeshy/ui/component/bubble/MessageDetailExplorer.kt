package me.meeshy.ui.component.bubble

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.LanguageData
import me.meeshy.sdk.model.LanguageExplorerOrder
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
    /** Pourquoi la dernière demande a échoué, ou `null` : la ligne le dit au lieu de rester muette. */
    val failure: RowFailure? = null,
    /** La transcription de la piste vocale traduite de cette langue, ou `null` : la ligne dit qu'une voix existe. */
    val audioPreview: String? = null,
    /** Une piste vocale existe déjà dans cette langue (jouable sans nouvelle demande). */
    val hasAudio: Boolean = false,
)

/** La traduction affichée en carte sous la bannière (avec sa croix « Fermer la traduction »). */
@Immutable
public data class SelectedTranslation(
    val code: String,
    val info: LanguageInfo?,
    val text: String,
    val isAudio: Boolean,
)

/** Ce que toucher une ligne fait : la sélectionner, demander la voix par pièce, demander le texte, ou rien (déjà en cours). */
public sealed interface LanguageExplorerRowAction {
    public data object Select : LanguageExplorerRowAction
    public data class RequestAudio(val attachmentId: String) : LanguageExplorerRowAction
    public data object RequestText : LanguageExplorerRowAction
    public data object None : LanguageExplorerRowAction

    public companion object {
        /** Même ordre qu'iOS : contenu texte ou piste vocale prête = sélection ; sinon un vocal se traduit par pièce, un texte par message. */
        public fun of(row: LanguageExplorerRow, audioAttachmentId: String?): LanguageExplorerRowAction = when {
            row.isTranslating -> None
            row.hasContent || row.hasAudio -> Select
            audioAttachmentId != null -> RequestAudio(audioAttachmentId)
            else -> RequestText
        }
    }
}

/** Ce que la ligne d'une langue dit d'une demande qui n'a rien rendu. */
public enum class RowFailure {
    /** Chiffrée de bout en bout : la traduction passe par l'appareil, jamais par le serveur. */
    SERVER_REFUSED,

    /** La demande est partie et n'a rien rendu. */
    FAILED,
}

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
    /** La traduction retenue pour la bulle, rendue en carte, ou `null`. */
    val selected: SelectedTranslation? = null,
    /** Le bandeau porte la transcription d'un vocal (pas un texte). */
    val originalIsTranscription: Boolean = false,
    /** La pièce vocale dont on demande la traduction, ou `null` : un message sans voix se traduit par son texte. */
    val audioAttachmentId: String? = null,
)

/**
 * Prisme Linguistique — projects a message's full translation state into the
 * per-message language explorer (long-press → "Explore languages"). Android's
 * counterpart to iOS `MessageLanguageDetailView`: the exhaustive exploration view,
 * distinct from the discrete [MessageLanguageStrip] preview under the bubble.
 *
 * Where iOS ships a hand-curated 18-language list, Android surfaces the viewer's
 * **configured** content languages first, then the remaining candidates — the order is
 * the pure [LanguageExplorerOrder] law (core:model). The projection is a
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
        failures: Map<String, RowFailure> = emptyMap(),
        previewLength: Int = 60,
        audioTranslations: Map<String, String> = emptyMap(),
        audioAttachmentId: String? = null,
    ): MessageLanguageExplorer {
        val original = originalLanguage.normalized()
        val selected = selectedCode.normalized()
        val inFlight = translatingCodes.mapNotNull { it.normalized() }.toSet()

        val audio = audioTranslations.entries
            .mapNotNull { (code, text) -> code.normalized()?.let { it to text } }
            .toMap()
        val ordered = LanguageExplorerOrder.of(originalLanguage, preferences, candidates)

        val rows = ordered.map { code ->
            val translated = translations.firstOrNull {
                it.targetLanguage.normalized() == code && it.translatedContent.isNotBlank()
            }?.translatedContent
            val isTranslating = code in inFlight
            val hasAudio = code in audio
            val audioText = audio[code]?.trim()?.takeIf { it.isNotEmpty() }
            LanguageExplorerRow(
                code = code,
                info = LanguageData.info(code),
                preview = translated?.let { truncate(it, previewLength) },
                hasContent = translated != null,
                isTranslating = isTranslating,
                isSelected = code == selected,
                canRetranslate = translated != null && !isTranslating,
                failure = failures[code].takeIf { !isTranslating && translated == null && !hasAudio },
                audioPreview = audioText?.let { truncate(it, previewLength) },
                hasAudio = hasAudio,
            )
        }

        val selectedText = selected?.let { code ->
            val text = translations.firstOrNull {
                it.targetLanguage.normalized() == code && it.translatedContent.isNotBlank()
            }?.translatedContent
            val spoken = audio[code]?.trim()?.takeIf { it.isNotEmpty() }
            (text ?: spoken)?.let { SelectedTranslation(code, LanguageData.info(code), it, isAudio = text == null) }
        }

        return MessageLanguageExplorer(
            originalCode = original,
            originalInfo = LanguageData.info(original),
            originalPreview = bannerPreview(content, transcription),
            rows = rows,
            selected = selectedText,
            originalIsTranscription = content.isBlank() && !transcription.isNullOrBlank(),
            audioAttachmentId = audioAttachmentId,
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
