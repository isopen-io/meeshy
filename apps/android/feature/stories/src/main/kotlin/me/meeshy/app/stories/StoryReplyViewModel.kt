package me.meeshy.app.stories

import androidx.compose.runtime.Immutable
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
import me.meeshy.sdk.e2ee.EndToEndRegimeLedger
import me.meeshy.sdk.lang.ComposeLanguageDetector
import me.meeshy.sdk.lang.LanguageIdentifying
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.EndToEndRegime
import me.meeshy.sdk.model.story.StoryReplyRules
import me.meeshy.sdk.outbox.OutboxFlushWorker
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.session.asCoroutineContext
import me.meeshy.sdk.session.SessionRepository
import javax.inject.Inject

/** [ENCRYPTED] : la directe avec l'auteur est chiffrée de bout en bout, que cet appareil ne sait pas écrire (#13015) — refusée AVANT l'envoi, dite, jamais « envoyée ». */
enum class StoryReplyPhase { IDLE, SENDING, SENT, FAILED, ENCRYPTED }

@Immutable
data class StoryReplyUiState(
    val text: String = "",
    val phase: StoryReplyPhase = StoryReplyPhase.IDLE,
)

/**
 * « Répondre » à une story (iOS `ReplyContext.story` + `Router.navigateToStoryReply`, #13501) : une réponse
 * PRIVÉE, écrite dans une feuille qui montre la story citée, qui part dans la conversation directe avec
 * l'auteur — la même que celle du bouton Message d'un profil — avec `storyReplyToId`, que la passerelle
 * sert en citation et que les bulles rendent en carte de story. Optimiste : le champ se vide au départ et
 * retrouve son texte si le départ échoue. Rien n'est gardé sur l'appareil au-delà de la feuille : aucun
 * brouillon ne peut passer d'un compte à l'autre.
 */
@HiltViewModel
class StoryReplyViewModel @Inject constructor(
    private val conversationRepository: ConversationRepository,
    private val messageRepository: MessageRepository,
    private val sessionRepository: SessionRepository,
    private val workManager: WorkManager,
    private val accountFence: AccountFence? = null,
    private val endToEndRegime: EndToEndRegimeLedger = EndToEndRegimeLedger.None,
) : ViewModel() {

    private val _state = MutableStateFlow(StoryReplyUiState())
    val state: StateFlow<StoryReplyUiState> = _state.asStateFlow()

    fun onTextChange(text: String) = _state.update { it.copy(text = text) }

    fun consumeOutcome() = _state.update { it.copy(phase = StoryReplyPhase.IDLE) }

    fun send(storyId: String, authorId: String) {
        val current = _state.value
        val user = sessionRepository.currentUser.value ?: return
        if (!StoryReplyRules.canSend(canReply = true, isSending = current.phase == StoryReplyPhase.SENDING, text = current.text)) return
        val text = current.text.trim()
        _state.update { it.copy(text = "", phase = StoryReplyPhase.SENDING) }
        // The reply belongs to the account of the gesture: opening the conversation may outlast a sign-out, and the
        // words of A must never be queued, nor shown, under B (#13558).
        val gesture = accountFence?.ticket()
        viewModelScope.launch(gesture.asCoroutineContext()) {
            try {
                val conversation = when (val direct = conversationRepository.directConversationWith(authorId)) {
                    is DirectConversationResolution.Found -> direct.conversation
                    is DirectConversationResolution.Created -> direct.conversation
                    else -> null
                }
                if (conversation == null) {
                    fail(text)
                    return@launch
                }
                val conversationId = conversation.id
                // Fail closed (#13621): the outbox would withhold this plaintext anyway, but the sheet must not say « sent ».
                if (EndToEndRegime.isEndToEnd(conversation.encryptionMode) || endToEndRegime.isSealed(conversationId)) {
                    _state.update { it.copy(text = it.text.ifEmpty { text }, phase = StoryReplyPhase.ENCRYPTED) }
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
                    storyReplyToId = storyId,
                )
                workManager.enqueue(OutboxFlushWorker.buildRequest())
                _state.update { it.copy(phase = StoryReplyPhase.SENT) }
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                fail(text)
            }
        }
    }

    private fun fail(text: String) = _state.update {
        it.copy(text = it.text.ifEmpty { text }, phase = StoryReplyPhase.FAILED)
    }
}
