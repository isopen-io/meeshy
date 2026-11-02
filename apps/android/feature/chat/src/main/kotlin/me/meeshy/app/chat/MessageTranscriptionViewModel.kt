package me.meeshy.app.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.filterIsInstance
import kotlinx.coroutines.launch
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.lang.AttachmentTranscriptPrism
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.media.MediaRepository
import me.meeshy.sdk.model.MessageTranscriptionFiche.Request
import me.meeshy.sdk.model.TranscriptionFailedEvent
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.ConversationSocketEventsManager

/**
 * La demande de transcription de la fiche (#13779) : au repos, en cours, en échec. Une transcription lancée arrive par
 * la socket et le cache du fil, une transcription qui existait déjà revient de la requête et entre dans le cache ;
 * `audio:transcription-failed` pour ce message met la demande en échec, réessayable.
 */
@HiltViewModel
class MessageTranscriptionViewModel @Inject constructor(
    private val mediaRepository: MediaRepository,
    private val messageRepository: MessageRepository,
    private val socketEvents: ConversationSocketEventsManager,
    sessionRepository: SessionRepository,
) : ViewModel() {

    private val _request = MutableStateFlow(Request.IDLE)
    val request: StateFlow<Request> = _request.asStateFlow()

    private val user = sessionRepository.currentUser

    val preferences: LanguageResolver.ContentLanguagePreferences
        get() = user.value ?: EmptyContentPreferences

    private var boundMessageId: String? = null
    private var failures: Job? = null

    /** Idempotent pour le même message ; un autre message repart d'une demande au repos. */
    fun bind(messageId: String) {
        if (boundMessageId == messageId && failures?.isActive == true) return
        if (boundMessageId != messageId) _request.value = Request.IDLE
        boundMessageId = messageId
        failures?.cancel()
        failures = viewModelScope.launch {
            socketEvents.events.filterIsInstance<TranscriptionFailedEvent>().collect { event ->
                if (event.messageId == messageId && _request.value == Request.IN_FLIGHT) _request.value = Request.FAILED
            }
        }
    }

    fun unbind() {
        failures?.cancel()
        failures = null
    }

    fun transcribe(messageId: String, attachmentId: String) {
        if (_request.value == Request.IN_FLIGHT) return
        _request.value = Request.IN_FLIGHT
        viewModelScope.launch {
            when (val result = mediaRepository.requestTranscription(attachmentId)) {
                is NetworkResult.Failure -> _request.value = Request.FAILED
                is NetworkResult.Success -> result.data?.let { done ->
                    val text = AttachmentTranscriptPrism.originalText(done) ?: return@let
                    messageRepository.applyTranscription(messageId, attachmentId, text, done.language, done.confidence, done.durationMs?.toLong())
                }
            }
        }
    }
}
