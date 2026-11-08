package me.meeshy.app.conversations

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.WorkManager
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.e2ee.EndToEndRegimeLedger
import me.meeshy.sdk.lang.ComposeLanguageDetector
import me.meeshy.sdk.lang.LanguageIdentifying
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.conversationlist.ConversationPreviewIntent
import me.meeshy.sdk.model.conversationlist.ConversationPreviewPhase
import me.meeshy.sdk.outbox.OutboxFlushWorker
import me.meeshy.sdk.session.SessionRepository

/** Une ligne de l'aperçu : le texte est celui que le Prisme du lecteur sert, jamais `translations.first()`. */
@Immutable
data class PeekLine(
    val id: String,
    val senderName: String?,
    val text: String,
    val isMine: Boolean,
    /** Message chiffré que cet appareil ne lit pas : la feuille dit « chiffré », jamais un texte vide. */
    val isSealed: Boolean,
)

@Immutable
data class ConversationPeekUiState(
    val phase: ConversationPreviewPhase = ConversationPreviewPhase.Loading,
    val lines: List<PeekLine> = emptyList(),
    val draft: String = "",
    /** Conversation chiffrée de bout en bout : le composeur simple n'écrit jamais en clair (fail-closed). */
    val composerLocked: Boolean = false,
    val sendFailed: Boolean = false,
) {
    val canSend: Boolean get() = !composerLocked && draft.isNotBlank()
}

/**
 * **L'aperçu d'une conversation ouvert depuis la bannière** (iOS `ConversationView(previewMode: true)`) :
 * les derniers messages (cache d'abord, réseau en revalidation silencieuse — [ConversationPreviewLoader]) au Prisme
 * du lecteur, et un composeur simple dont l'envoi est optimiste et passe par la file hors ligne.
 */
@HiltViewModel
class ConversationPeekViewModel @Inject constructor(
    private val messageRepository: MessageRepository,
    private val sessionRepository: SessionRepository,
    private val workManager: WorkManager,
    private val endToEndRegime: EndToEndRegimeLedger,
) : ViewModel() {

    private val _state = MutableStateFlow(ConversationPeekUiState())
    val state: StateFlow<ConversationPeekUiState> = _state.asStateFlow()

    private val loader = ConversationPreviewLoader(
        scope = viewModelScope,
        source = RepositoryConversationPreviewSource(messageRepository),
        prefs = { sessionRepository.currentUser.value },
        isLocked = { false },
        ownerId = { sessionRepository.currentUser.value?.id },
    )

    private var conversationId: String? = null
    private var observing: Job? = null

    fun open(id: String) {
        if (conversationId == id) return
        conversationId = id
        observing?.cancel()
        _state.value = ConversationPeekUiState(composerLocked = endToEndRegime.isSealed(id))
        observing = viewModelScope.launch {
            loader.states.collect { project(id) }
        }
        viewModelScope.launch { loader.load(id, ConversationPreviewIntent.Open) }
    }

    fun onDraftChange(text: String) = _state.update { it.copy(draft = text, sendFailed = false) }

    fun send() {
        val id = conversationId ?: return
        val current = _state.value
        val user = sessionRepository.currentUser.value ?: return
        if (!current.canSend || endToEndRegime.isSealed(id)) return
        val text = current.draft.trim()
        _state.update { it.copy(draft = "", sendFailed = false) }
        viewModelScope.launch {
            try {
                val language = ComposeLanguageDetector.originalLanguageAtSend(
                    text = text,
                    manual = null,
                    senderLanguage = LanguageResolver.resolveUserLanguage(user),
                    identifier = LanguageIdentifying.Unavailable,
                )
                messageRepository.sendOptimistic(
                    conversationId = id,
                    content = text,
                    originalLanguage = language,
                    sender = user,
                )
                workManager.enqueue(OutboxFlushWorker.buildRequest())
                loader.load(id, ConversationPreviewIntent.Open)
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                _state.update { it.copy(draft = it.draft.ifEmpty { text }, sendFailed = true) }
            }
        }
    }

    private fun project(id: String) {
        val preview = loader.state(id)
        val snapshot = preview.snapshot
        val me = sessionRepository.currentUser.value?.id
        val lines = snapshot?.messages.orEmpty().map { message ->
            PeekLine(
                id = message.id,
                senderName = message.sender?.displayName,
                text = snapshot?.servedText(message).orEmpty(),
                isMine = me != null && message.senderId == me,
                isSealed = message.isCiphertext,
            )
        }
        _state.update { it.copy(phase = preview.phase, lines = lines) }
    }
}
