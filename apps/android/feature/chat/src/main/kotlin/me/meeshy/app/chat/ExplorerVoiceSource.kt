package me.meeshy.app.chat

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.attachment.AudioTranslationRequestTracker
import me.meeshy.sdk.conversation.MessageTranslationsFetcher
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.VoiceQueueProtection

/**
 * Ce que l'explorateur de langues sait de la VOIX d'un message : la pièce dont on demande la traduction, la langue de sa
 * transcription, le texte de cette transcription (bandeau « Original ») et, par langue, la transcription de chaque piste
 * déjà prête. Un vocal protégé (vue unique, flou, éphémère, chiffré) n'offre rien : ni piste ni demande.
 */
@Immutable
internal data class ExplorerVoiceSource(
    val attachmentId: String,
    val sourceLanguage: String?,
    val transcription: String?,
    val tracks: Map<String, String>,
) {
    companion object {
        fun of(message: ApiMessage): ExplorerVoiceSource? {
            val voices = message.attachments.filter { it.mimeType?.startsWith("audio/") == true }
            if (voices.isEmpty() || voices.any { VoiceQueueProtection.ofPiece(it, message) }) return null
            val voice = voices.first()
            val transcript = voice.transcription
            return ExplorerVoiceSource(
                attachmentId = voice.id,
                sourceLanguage = transcript?.language?.trim()?.lowercase()?.ifEmpty { null },
                transcription = (transcript?.text ?: transcript?.transcribedText)?.trim()?.ifEmpty { null },
                tracks = voice.translations.orEmpty()
                    .filterValues { !it.url.isNullOrBlank() }
                    .mapValues { it.value.transcription.orEmpty() },
            )
        }
    }
}

/** La demande de voix par pièce telle que l'explorateur l'attend : vrai quand elle est partie sans échec. */
internal fun AudioTranslationRequestTracker.asExplorerRequest(): suspend (String, String, String, String?) -> Boolean =
    { messageId, attachmentId, language, source -> requestReporting(messageId, attachmentId, language, source) }

/** La lecture de toutes les traductions d'un message, telle que l'explorateur l'attend. */
internal fun MessageTranslationsFetcher.asExplorerFetch(): suspend (String) -> Unit = { messageId -> fetch(messageId) }
