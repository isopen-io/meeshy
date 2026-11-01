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
import me.meeshy.sdk.conversation.conversationOrNull
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.e2ee.EndToEndRegimeLedger
import me.meeshy.sdk.lang.ComposeLanguageDetector
import me.meeshy.sdk.lang.LanguageIdentifying
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.mention.MentionAutocomplete
import me.meeshy.sdk.mention.MentionAutocompleteState
import me.meeshy.sdk.mention.MentionContacts
import me.meeshy.sdk.mention.MentionSearch
import me.meeshy.sdk.model.MentionCandidate
import me.meeshy.sdk.model.mention.MentionContext
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
    mentionSearch: MentionSearch = MentionSearch.None,
    mentionContacts: MentionContacts = MentionContacts.None,
) : ViewModel() {

    private val _state = MutableStateFlow(StoryReplyUiState())
    val state: StateFlow<StoryReplyUiState> = _state.asStateFlow()

    /** The « @ » list of the reply (#14053): cached contacts at once, the quoted story's suggestions (`contextType=post`) by the law. */
    private val mentions = MentionAutocomplete(
        scope = viewModelScope,
        search = mentionSearch,
        contacts = mentionContacts,
        selfId = { sessionRepository.currentUser.value?.id },
    )
    val mention: StateFlow<MentionAutocompleteState> = mentions.state

    /** The story the sheet quotes: the context the network is asked about for the « @ » list. */
    fun attachStory(storyId: String) = mentions.bind(MentionContext.post(storyId))

    fun onTextChange(text: String) {
        _state.update { it.copy(text = text) }
        mentions.onTextChange(text)
    }

    /** Puts the picked person's handle in place of the `@fragment` being typed, and closes the list. */
    fun onMentionSelected(candidate: MentionCandidate) {
        val text = mentions.select(candidate, _state.value.text)
        _state.update { it.copy(text = text) }
    }

    fun consumeOutcome() = _state.update { it.copy(phase = StoryReplyPhase.IDLE) }

    fun send(storyId: String, authorId: String) {
        val current = _state.value
        val user = sessionRepository.currentUser.value ?: return
        if (!StoryReplyRules.canSend(canReply = true, isSending = current.phase == StoryReplyPhase.SENDING, text = current.text)) return
        val text = current.text.trim()
        _state.update { it.copy(text = "", phase = StoryReplyPhase.SENDING) }
        mentions.reset()
        // The reply belongs to the account of the gesture: opening the conversation may outlast a sign-out, and the
        // words of A must never be queued, nor shown, under B (#13558).
        val gesture = accountFence?.ticket()
        viewModelScope.launch(gesture.asCoroutineContext()) {
            try {
                val resolution = conversationRepository.directConversationWith(authorId)
                val conversation = resolution.conversationOrNull
                if (conversation == null) {
                    fail(text)
                    return@launch
                }
                val conversationId = conversation.id
                // Fail closed (#13621): the outbox would withhold this plaintext anyway, but the sheet must not say « sent ».
                if (endToEndRegime.isSealed(conversationId)) {
                    refuseEncrypted(text)
                    return@launch
                }
                // A cached direct may lag: with no mode known, ask the server (a read that carries no words) before any queueing.
                val mode = knownMode(resolution, conversationId)
                if (mode == null) {
                    fail(text)
                    return@launch
                }
                if (EndToEndRegime.isEndToEnd(mode.value)) {
                    refuseEncrypted(text)
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

    private fun refuseEncrypted(text: String) = _state.update {
        it.copy(text = it.text.ifEmpty { text }, phase = StoryReplyPhase.ENCRYPTED)
    }

    /** The conversation's mode when it is known (null inside [KnownMode] = clear), or null when it cannot be learned now. */
    private suspend fun knownMode(resolution: DirectConversationResolution, conversationId: String): KnownMode? {
        val served = resolution.conversationOrNull ?: return null
        val cachedOnly = resolution is DirectConversationResolution.Found && resolution.fromCache
        if (!cachedOnly || !served.encryptionMode.isNullOrBlank()) return KnownMode(served.encryptionMode)
        val fresh = (conversationRepository.getById(conversationId) as? NetworkResult.Success)?.data ?: return null
        conversationRepository.rememberServed(fresh)
        return KnownMode(fresh.encryptionMode)
    }

    private data class KnownMode(val value: String?)

    private fun fail(text: String) = _state.update {
        it.copy(text = it.text.ifEmpty { text }, phase = StoryReplyPhase.FAILED)
    }
}
