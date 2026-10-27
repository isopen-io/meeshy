package me.meeshy.app.feed

import androidx.compose.runtime.Immutable
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.WorkManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.conversation.DirectConversationResolution
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.lang.ComposeLanguageDetector
import me.meeshy.sdk.lang.LanguageIdentifying
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.StatusEntry
import me.meeshy.sdk.model.mood.MoodSpotlightRules
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.outbox.OutboxFlushWorker
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.status.toStatusEntry
import me.meeshy.sdk.user.UserRepository
import javax.inject.Inject

enum class MoodReplyState { IDLE, SENDING, SENT, FAILED }

sealed interface MoodSpotlightContent {
    data object Loading : MoodSpotlightContent
    data class Mood(val entry: StatusEntry) : MoodSpotlightContent
    data object Unavailable : MoodSpotlightContent
}

@Immutable
data class MoodSpotlightUiState(
    val content: MoodSpotlightContent = MoodSpotlightContent.Loading,
    val author: MeeshyUser? = null,
    val replyText: String = "",
    val replyState: MoodReplyState = MoodReplyState.IDLE,
    val canReply: Boolean = false,
) {
    val entry: StatusEntry? get() = (content as? MoodSpotlightContent.Mood)?.entry
    val canSend: Boolean get() = MoodSpotlightRules.canSend(canReply, replyState == MoodReplyState.SENDING, replyText)
}

/**
 * La page plein écran d'une humeur reçue (iOS `MoodSpotlightViewModel`, #10814) : l'humeur, son
 * auteur et la réponse privée qu'on lui écrit. Cache d'abord (l'humeur du fil s'affiche sans
 * attendre, le réseau revalide en silence) ; la réponse est optimiste — le champ se vide au départ
 * et retrouve son texte si le départ échoue. Elle part en citation de l'humeur dans la
 * conversation directe avec l'auteur, la même que celle du bouton Message d'un profil.
 */
@HiltViewModel
class MoodSpotlightViewModel internal constructor(
    private val postRepository: PostRepository,
    private val userRepository: UserRepository,
    private val conversationRepository: ConversationRepository,
    private val messageRepository: MessageRepository,
    private val sessionRepository: SessionRepository,
    private val workManager: WorkManager,
    private val now: () -> Long,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    @Inject
    constructor(
        postRepository: PostRepository,
        userRepository: UserRepository,
        conversationRepository: ConversationRepository,
        messageRepository: MessageRepository,
        sessionRepository: SessionRepository,
        workManager: WorkManager,
        savedStateHandle: SavedStateHandle,
    ) : this(
        postRepository, userRepository, conversationRepository, messageRepository,
        sessionRepository, workManager, System::currentTimeMillis, savedStateHandle,
    )

    private val statusId: String = savedStateHandle[STATUS_ID_ARG] ?: ""
    private val _state = MutableStateFlow(MoodSpotlightUiState())
    val state: StateFlow<MoodSpotlightUiState> = _state.asStateFlow()
    private var viewRecorded = false

    init {
        viewModelScope.launch { load() }
    }

    fun onReplyChange(text: String) = _state.update { it.copy(replyText = text) }

    fun consumeReplyOutcome() = _state.update { it.copy(replyState = MoodReplyState.IDLE) }

    private suspend fun load() {
        if (statusId.isBlank()) {
            _state.update { it.copy(content = MoodSpotlightContent.Unavailable) }
            return
        }
        postRepository.cachedPost(statusId)?.toStatusEntry()?.takeIf { MoodSpotlightRules.isLive(it, now()) }?.let { present(it) }
        when (val result = postRepository.getPost(statusId)) {
            is NetworkResult.Success -> {
                val fresh = result.data.toStatusEntry()?.takeIf { MoodSpotlightRules.isLive(it, now()) }
                if (fresh == null) {
                    _state.update { it.copy(content = MoodSpotlightContent.Unavailable, canReply = false) }
                    return
                }
                present(fresh)
            }
            is NetworkResult.Failure ->
                if (_state.value.entry == null) _state.update { it.copy(content = MoodSpotlightContent.Unavailable) }
        }
    }

    private suspend fun present(entry: StatusEntry) {
        val me = sessionRepository.currentUserId
        _state.update {
            it.copy(content = MoodSpotlightContent.Mood(entry), canReply = MoodSpotlightRules.canReply(entry, me))
        }
        if (!viewRecorded && entry.userId != me) {
            viewRecorded = true
            postRepository.viewPost(entry.id)
        }
        if (_state.value.author?.id != entry.userId) {
            (userRepository.getProfile(entry.userId) as? NetworkResult.Success)?.let { profile ->
                _state.update { it.copy(author = profile.data) }
            }
        }
    }

    fun sendReply() {
        val current = _state.value
        val entry = current.entry ?: return
        val user = sessionRepository.currentUser.value ?: return
        if (!current.canSend) return
        val text = current.replyText.trim()
        _state.update { it.copy(replyText = "", replyState = MoodReplyState.SENDING) }
        viewModelScope.launch {
            try {
                val conversationId = when (val direct = conversationRepository.directConversationWith(entry.userId)) {
                    is DirectConversationResolution.Found -> direct.conversation.id
                    is DirectConversationResolution.Created -> direct.conversation.id
                    else -> null
                }
                if (conversationId == null) {
                    fail(text)
                    return@launch
                }
                val language = ComposeLanguageDetector.originalLanguageAtSend(
                    text = text,
                    manual = null,
                    senderLanguage = LanguageResolver.resolveUserLanguage(user),
                    identifier = LanguageIdentifying.Unavailable,
                )
                messageRepository.sendOptimistic(
                    conversationId = conversationId,
                    content = text,
                    originalLanguage = language,
                    sender = user,
                    storyReplyToId = entry.id,
                )
                workManager.enqueue(OutboxFlushWorker.buildRequest())
                _state.update { it.copy(replyState = MoodReplyState.SENT) }
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                fail(text)
            }
        }
    }

    private fun fail(text: String) = _state.update {
        it.copy(replyText = it.replyText.ifEmpty { text }, replyState = MoodReplyState.FAILED)
    }

    companion object {
        const val STATUS_ID_ARG = "statusId"
    }
}
