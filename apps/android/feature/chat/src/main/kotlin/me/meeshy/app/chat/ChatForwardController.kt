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
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ContentExitLaw
import me.meeshy.sdk.model.ForwardRefusalReason
import me.meeshy.sdk.model.MessageEffects
import me.meeshy.sdk.model.contentExitSubject
import me.meeshy.sdk.model.exitOffer
import me.meeshy.sdk.model.share.OutgoingShare
import me.meeshy.sdk.model.share.ShareDelivery
import me.meeshy.sdk.model.share.ShareDestination
import me.meeshy.sdk.model.share.ShareFailure
import me.meeshy.sdk.model.share.ShareLimits
import me.meeshy.sdk.model.share.ShareOutgoingBuilder
import me.meeshy.sdk.model.share.ShareOutgoingResult
import me.meeshy.sdk.model.share.SharePlanner
import me.meeshy.sdk.model.share.ShareSubject
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
    /** The blocklist: a direct conversation with a blocked person is never a recipient. */
    private val blockedUserIds: () -> Set<String> = { emptySet() },
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
    fun open(messageId: String) = open(listOf(messageId))

    /**
     * Opens the picker for a whole selection ([messageIds] in thread order, #13294). Only the
     * messages the exit law lets out are carried; when none does, the refusal card of the first
     * one is shown. The first carried message is the picker's source, the rest travel with it.
     */
    fun open(messageIds: List<String>) {
        val carried = messageIds.filter { refusalFor(it) == null }
        val messageId = carried.firstOrNull() ?: messageIds.first()
        val refusal = if (carried.isEmpty()) refusalFor(messageId) else null
        state.update {
            it.copy(
                actionMessageId = null,
                forward = ForwardUiState(
                    sourceMessageId = messageId,
                    additionalSourceMessageIds = carried.drop(1),
                    sendingConversationId = sendingForwards[messageId],
                    refusal = refusal,
                ),
            )
        }
        updateForward { replan(it) }
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
        val synced = messages.value.filter { it.sendState == LocalSendState.SYNCED }.map { it.message }
        val sources = (listOf(sourceMessageId) + forward.additionalSourceMessageIds)
            .mapNotNull { id -> synced.firstOrNull { it.id == id } }
        if (sources.isEmpty()) return
        // Each copy's protection, as the gateway will impose it: a timed flame keeps its
        // flame with a duration bounded by the source, a blurred source (message or piece)
        // hands its blur down. `null` = the law refuses that message: it is not sent.
        val copies = sources.mapNotNull { source ->
            ContentExitLaw.forwardedCopyProtection(source.contentExitSubject, null)?.let { source to it }
        }
        if (copies.isEmpty()) return
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
                copies.forEach { (source, copy) ->
                    messageRepository.sendOptimistic(
                        conversationId = targetConversationId,
                        content = source.content,
                        originalLanguage = source.originalLanguage ?: LanguageResolver.FALLBACK_LANGUAGE,
                        sender = user,
                        forwardedFromId = source.id,
                        forwardedFromConversationId = conversationId,
                        effects = MessageEffects(flags = copy.effectFlags, ephemeralDuration = copy.ephemeralDuration),
                    )
                }
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

    // --- The single share sheet (#13469): tick recipients, then Send ---------------------------

    /** The synced source messages of the open sheet, in thread order. */
    private fun sources(forward: ForwardUiState): List<ApiMessage> {
        val synced = messages.value.filter { it.sendState == LocalSendState.SYNCED }.map { it.message }
        return (listOf(forward.sourceMessageId) + forward.additionalSourceMessageIds).mapNotNull { id -> synced.firstOrNull { it.id == id } }
    }

    private fun subject(forward: ForwardUiState) = ShareSubject.Messages(sources(forward), conversationId)

    private fun replan(forward: ForwardUiState): ForwardUiState {
        val destinations = forward.selectedConversationIds.map { ShareDestination("conv:$it") }
        val plan = SharePlanner.plan(subject(forward).entry(), destinations)
        val bound = plan.flameMaxDurationSeconds
        val chosen = forward.chosenDurationSeconds?.let { if (bound != null) minOf(it, bound) else it }
        return forward.copy(plan = plan, chosenDurationSeconds = chosen ?: bound)
    }

    /** Ticks or unticks a recipient row; a row already served is inert, a failed one can be retried. */
    fun toggleRecipient(targetConversationId: String) = updateForward { forward ->
        val delivery = forward.deliveries[targetConversationId]
        if (delivery != null && delivery !is ShareDelivery.Failed) return@updateForward forward
        val selected = forward.selectedConversationIds
        replan(
            forward.copy(
                selectedConversationIds = if (targetConversationId in selected) selected - targetConversationId else selected + targetConversationId,
            ),
        )
    }

    fun onCaptionChange(text: String) = updateForward { it.copy(caption = text.take(ShareLimits.MAX_CAPTION_LENGTH)) }

    fun onDurationChange(seconds: Int) = updateForward { forward ->
        val bound = forward.plan?.flameMaxDurationSeconds
        forward.copy(chosenDurationSeconds = if (bound != null) minOf(seconds, bound) else seconds)
    }

    /**
     * Sends to every ticked recipient not yet served. Each row flips to « sending » at once (the
     * optimistic feedback); every copy is a local bubble in its target plus a durable outbox entry,
     * so the share survives going offline and closing the sheet. A failure flips only its own row.
     */
    fun sendSelection() {
        val forward = state.value.forward ?: return
        if (forward.refusal != null || forward.plan?.canSend != true) return
        val user = sessionRepository.currentUser.value ?: return
        val pending = forward.selectedConversationIds.filter { id -> forward.deliveries[id].let { it == null || it is ShareDelivery.Failed } }
        if (pending.isEmpty()) return
        val sourceId = forward.sourceMessageId
        val built = ShareOutgoingBuilder.build(subject(forward), emptySet(), forward.caption, forward.chosenDurationSeconds)
        if (built is ShareOutgoingResult.Refused) {
            pending.forEach { markDelivery(sourceId, it, ShareDelivery.Failed(built.failure)) }
            return
        }
        val outgoing = (built as ShareOutgoingResult.Ready).messages
        pending.forEach { markDelivery(sourceId, it, ShareDelivery.Sending) }
        scope.launch {
            pending.forEach { target -> markDelivery(sourceId, target, deliver(outgoing, target, user)) }
            workManager.enqueue(OutboxFlushWorker.buildRequest())
        }
    }

    private suspend fun deliver(outgoing: List<OutgoingShare>, target: String, user: me.meeshy.sdk.model.MeeshyUser): ShareDelivery = try {
        outgoing.forEach { post ->
            messageRepository.sendOptimistic(
                conversationId = target,
                content = post.content,
                originalLanguage = post.originalLanguage ?: user.systemLanguage?.takeIf { it.isNotBlank() } ?: LanguageResolver.FALLBACK_LANGUAGE,
                sender = user,
                forwardedFromId = post.forwardedFromId,
                forwardedFromConversationId = post.forwardedFromConversationId,
                effects = MessageEffects(flags = post.effectFlags, ephemeralDuration = post.ephemeralDuration),
            )
        }
        ShareDelivery.Sent
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        ShareDelivery.Failed(ShareFailure.GENERIC)
    }

    private fun markDelivery(sourceId: String, target: String, delivery: ShareDelivery) = updateForward { forward ->
        if (forward.sourceMessageId != sourceId) return@updateForward forward
        forward.copy(
            deliveries = forward.deliveries + (target to delivery),
            sentConversationIds = if (delivery == ShareDelivery.Sent) forward.sentConversationIds + target else forward.sentConversationIds,
        )
    }

    private fun updateForward(transform: (ForwardUiState) -> ForwardUiState) {
        state.update { s -> s.forward?.let { s.copy(forward = transform(it)) } ?: s }
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
                        blockedUserIds = blockedUserIds(),
                    ),
                ),
            )
        }
    }
}
