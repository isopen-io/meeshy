package me.meeshy.app.chat

import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.LanguageData
import me.meeshy.ui.component.audio.AudioFullscreenSource
import me.meeshy.ui.component.audio.AudioFullscreenTranscriptPort
import me.meeshy.ui.component.bubble.BubbleContent

/**
 * Ce que le fil donne au plein écran audio pour changer de langue : la bascule d'une piste (le MÊME canal que les drapeaux de la
 * bulle, `ChatViewModel.selectAudioLanguage`), les pièces d'un message et le mode de chiffrement de la conversation.
 */
internal data class ChatAudioFullscreenLanguages(
    val onAudioLanguage: (messageId: String, code: String) -> Unit,
    val attachmentsOf: (messageId: String) -> List<ApiMessageAttachment>,
    val encryptionMode: String?,
)

/**
 * **Le port de transcription et de langues du plein écran audio du fil.** La transcription vient du [transcription] (le modèle
 * Hilt de l'écran) ; les langues passent par le fil : choisir une pastille écrit sur le canal de langue du message, d'où le
 * texte, le karaoké et la voix suivent UNE langue, et la feuille « Traduire l'audio » est celle des messages
 * ([AudioTranslationInputs]), qui refuse d'elle-même un vocal protégé ou une conversation chiffrée.
 *
 * Une conversation chiffrée de bout en bout n'offre aucune transcription : le serveur ne lit pas le clair, et rien ne part de
 * l'appareil (fail-closed).
 */
internal class ChatAudioFullscreenTranscripts(
    private val transcription: AudioFullscreenTranscriptPort,
    private val languages: ChatAudioFullscreenLanguages?,
    private val isEndToEnd: Boolean,
    private val readerLanguages: () -> List<String>,
    private val thread: () -> List<BubbleContent>,
    private val onOpenLanguages: (AudioFullscreenSource) -> Unit,
) : AudioFullscreenTranscriptPort by transcription {

    override fun offersTranscription(source: AudioFullscreenSource): Boolean =
        !isEndToEnd && transcription.offersTranscription(source)

    override fun offersLanguages(source: AudioFullscreenSource): Boolean = sheetInput(source.carrierId) != null

    override fun selectLanguage(source: AudioFullscreenSource, code: String) {
        languages?.onAudioLanguage?.invoke(source.carrierId, code)
    }

    override fun openLanguages(source: AudioFullscreenSource) = onOpenLanguages(source)

    /** L'entrée de la feuille « Traduire l'audio » du message [messageId] ; `null` : rien de traduisible (aucun vocal, ou un vocal protégé). */
    fun sheetInput(messageId: String): AudioTranslationSheetInput? {
        val hosting = languages ?: return null
        val bubble = thread().firstOrNull { it.messageId == messageId } ?: return null
        return AudioTranslationInputs.of(
            bubble = bubble,
            attachments = hosting.attachmentsOf(messageId),
            explorerLanguages = readerLanguages() + LanguageData.allLanguages.map { it.code },
            conversationEncryptionMode = hosting.encryptionMode,
            conversationShownSealed = isEndToEnd,
        )
    }
}
