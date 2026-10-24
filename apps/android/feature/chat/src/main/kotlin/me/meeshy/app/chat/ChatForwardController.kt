package me.meeshy.app.chat

import androidx.work.WorkManager
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import me.meeshy.sdk.conversation.LocalMessage
import me.meeshy.sdk.conversation.LocalSendState
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ContentExitLaw
import me.meeshy.sdk.model.ForwardRefusalReason
import me.meeshy.sdk.model.MessageEffects
import me.meeshy.sdk.model.contentExitSubject
import me.meeshy.sdk.model.exitOffer
import me.meeshy.sdk.outbox.OutboxFlushWorker
import me.meeshy.sdk.session.SessionRepository

/**
 * The forward-picker of the conversation screen: the sheet's lifecycle ([ChatUiState.forward]),
 * its target list painted cache-first from the conversations already loaded, and the
 * optimistic re-send of the source message into the picked conversation.
 */
internal class ChatForwardController(
    private val scope: CoroutineScope,
    private val state: ChatStateAccess,
    private val conversationId: String,
    private val messages: StateFlow<List<LocalMessage>>,
    private val messageRepository: MessageRepository,
    private val sessionRepository: SessionRepository,
    private val workManager: WorkManager,
) {

    private var allConversations: List<ApiConversation> = emptyList()

    /**
     * sourceMessageId -> target conversation currently being forwarded to.
     * Durable across closeForward()/openForward() (unlike ForwardUiState, which
     * is recreated on open) so a dismiss-and-reopen mid-send can't lose the
     * in-flight guard and let a second forwardTo() double-send the message.
     */
    private val sendingForwards = mutableMapOf<String, String>()

    /**
     * The conversation list changed. A `null` window (nothing loaded yet) keeps the
     * previous list; an open picker repaints its targets either way.
     */
    fun onConversationsLoaded(conversations: List<ApiConversation>?) {
        allConversations = conversations ?: allConversations
        recomputeTargets()
    }

    /**
     * Open the forward-picker sheet for [messageId]. Dismisses the long-press
     * action sheet and paints the eligible targets cache-first from whatever
     * conversation list is already loaded (the collector fills it in live).
     */
    fun open(messageId: String) {
        val refusal = refusalFor(messageId)
        state.update {
            it.copy(
                actionMessageId = null,
                forward = ForwardUiState(
                    sourceMessageId = messageId,
                    sendingConversationId = sendingForwards[messageId],
                    refusal = refusal,
                ),
            )
        }
        recomputeTargets()
    }

    /**
     * The gateway refused the forward (`FORWARD_REFUSAL_CODES`): the same "does not leave
     * Meeshy" card as a local refusal, never a recipient list. An unknown code changes nothing.
     */
    fun onGatewayRefusal(code: String?) {
        val reason = ForwardRefusalReason.fromCode(code) ?: return
        state.update { s -> s.forward?.let { s.copy(forward = it.copy(refusal = reason, sendingConversationId = null)) } ?: s }
    }

    /** What the exit law refuses for the message [messageId], or `null` when it may be forwarded. */
    private fun refusalFor(messageId: String): ForwardRefusalReason? =
        messages.value.firstOrNull { it.message.id == messageId }
            ?.let { ForwardRefusalReason.local(it.message.exitOffer()) }

    fun onQueryChange(query: String) {
        state.update { s -> s.forward?.let { s.copy(forward = it.copy(query = query)) } ?: s }
        recomputeTargets()
    }

    fun close() {
        state.update { it.copy(forward = null) }
    }

    /**
     * Optimistically forward the source message into [targetConversationId]: the
     * original content is re-sent there carrying the `forwardedFrom` refs (the
     * gateway resolves attachments from the original). Only a server-acked source
     * can be forwarded — an unsent bubble has no id the gateway knows. One
     * forward is in flight at a time; an already-forwarded target is inert.
     */
    fun forwardTo(targetConversationId: String) {
        val forward = state.value.forward ?: return
        val sourceMessageId = forward.sourceMessageId
        if (forward.refusal != null) return
        refusalFor(sourceMessageId)?.let { reason ->
            state.update { s -> s.forward?.let { s.copy(forward = it.copy(refusal = reason, targets = emptyList())) } ?: s }
            return
        }
        if (sendingForwards.containsKey(sourceMessageId)) return
        if (targetConversationId in forward.sentConversationIds) return
        val user = sessionRepository.currentUser.value ?: return
        val source = messages.value
            .firstOrNull { it.message.id == sourceMessageId && it.sendState == LocalSendState.SYNCED }
            ?.message ?: return
        // The copy's protection, as the gateway will impose it: a timed flame keeps its
        // flame with a duration bounded by the source, a blurred source (message or piece)
        // hands its blur down. `null` = the law refuses: nothing is sent.
        val copy = ContentExitLaw.forwardedCopyProtection(source.contentExitSubject, null) ?: return
        sendingForwards[sourceMessageId] = targetConversationId
        state.update { s ->
            if (s.forward?.sourceMessageId == sourceMessageId) {
                s.copy(forward = s.forward.copy(sendingConversationId = targetConversationId))
            } else {
                s
            }
        }
        scope.launch {
            try {
                messageRepository.sendOptimistic(
                    conversationId = targetConversationId,
                    content = source.content,
                    originalLanguage = source.originalLanguage ?: LanguageResolver.FALLBACK_LANGUAGE,
                    sender = user,
                    forwardedFromId = source.id,
                    forwardedFromConversationId = conversationId,
                    effects = MessageEffects(flags = copy.effectFlags, ephemeralDuration = copy.ephemeralDuration),
                )
                workManager.enqueue(OutboxFlushWorker.buildRequest())
                sendingForwards.remove(sourceMessageId)
                state.update { s ->
                    if (s.forward?.sourceMessageId == sourceMessageId) {
                        s.copy(
                            forward = s.forward.copy(
                                sendingConversationId = null,
                                sentConversationIds = s.forward.sentConversationIds + targetConversationId,
                            ),
                        )
                    } else {
                        s
                    }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                sendingForwards.remove(sourceMessageId)
                state.update { s ->
                    val forwardUpdate = if (s.forward?.sourceMessageId == sourceMessageId) {
                        s.forward.copy(sendingConversationId = null)
                    } else {
                        s.forward
                    }
                    s.copy(errorMessage = e.message, forward = forwardUpdate)
                }
            }
        }
    }

    private fun recomputeTargets() {
        state.update { s ->
            val forward = s.forward ?: return@update s
            if (forward.refusal != null) return@update s.copy(forward = forward.copy(targets = emptyList()))
            s.copy(
                forward = forward.copy(
                    targets = ForwardTargets.of(
                        conversations = allConversations,
                        sourceConversationId = conversationId,
                        query = forward.query,
                        currentUserId = sessionRepository.currentUser.value?.id,
                    ),
                ),
            )
        }
    }
}
