package me.meeshy.app.chat

import androidx.compose.runtime.staticCompositionLocalOf
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.launch
import me.meeshy.sdk.attachment.TranscriptionRequestTracker
import me.meeshy.sdk.model.MessageTranscriptionFiche.Request
import me.meeshy.ui.component.bubble.BubbleAudio
import me.meeshy.ui.component.bubble.BubbleCallbacks
import me.meeshy.ui.component.bubble.BubbleContent

/** Ce que le fil demande au suivi des transcriptions : l'état d'un vocal, et la demande « Transcrire » (iOS `onRequestTranscription`). */
internal interface ChatTranscriptionRequests {
    fun stateOf(messageId: String, audio: BubbleAudio): Flow<Request>

    fun request(messageId: String, audio: BubbleAudio)

    /** « Re-transcrire » : la transcription d'un vocal déjà transcrit est redemandée de force. Inerte tant que l'hôte ne la sert pas. */
    fun retranscribe(messageId: String, audio: BubbleAudio) {}
}

/** Les demandes de transcription du fil, fournies par l'écran de conversation ; `null` hors d'un fil (aperçus, rendus de test). */
internal val LocalChatTranscriptionRequests = staticCompositionLocalOf<ChatTranscriptionRequests?> { null }

/**
 * Le pont Hilt entre les bulles du fil et le [TranscriptionRequestTracker] singleton : le même état que la fiche, donc un
 * « Transcription… » qui ne se contredit pas d'un écran à l'autre. Il ne tient rien lui-même.
 */
@HiltViewModel
internal class ChatTranscriptionRequestsViewModel @Inject constructor(
    private val tracker: TranscriptionRequestTracker,
) : ViewModel(), ChatTranscriptionRequests {

    override fun stateOf(messageId: String, audio: BubbleAudio): Flow<Request> = tracker.observe(messageId, audio.attachmentId)

    override fun request(messageId: String, audio: BubbleAudio) {
        viewModelScope.launch { tracker.request(messageId, audio.attachmentId) }
    }

    override fun retranscribe(messageId: String, audio: BubbleAudio) {
        viewModelScope.launch { tracker.retranscribe(messageId, audio.attachmentId) }
    }
}

/** Les gestes de transcription d'une bulle, routés vers le suivi ; sans suivi la bulle n'offre aucune demande. */
internal fun BubbleCallbacks.withTranscriptionRequests(requests: ChatTranscriptionRequests?, bubble: BubbleContent): BubbleCallbacks =
    if (requests == null) {
        this
    } else {
        copy(
            onRequestTranscription = { audio -> requests.request(bubble.messageId, audio) },
            onRetranscribe = { audio -> requests.retranscribe(bubble.messageId, audio) },
            transcriptionRequest = { audio -> requests.stateOf(bubble.messageId, audio) },
        )
    }
