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
import me.meeshy.sdk.model.ForwardRefusalReason
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.MessageEffects
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
 * The single share sheet of the conversation screen (#13469): its lifecycle ([ChatUiState.forward]),
 * its recipients painted cache-first from the conversations already loaded, and the optimistic,
 * durable re-send of the source messages into every ticked recipient.
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
     * Shares in flight, keyed by [shareKey] (source message → target). Durable across
     * close()/open() (unlike [ForwardUiState], recreated on open), so dismissing and reopening
     * the sheet mid-send can neither lose the guard nor let a second Send duplicate the copy.
     */
    private val inFlight = mutableSetOf<Pair<String, String>>()

    /**
     * How many messages of a share already left for a target ([shareKey]) when it failed part
     * way: a retry posts only the rest, never the copy that already reached the outbox twice.
     */
    private val alreadyPosted = mutableMapOf<Pair<String, String>, Int>()

    private fun shareKey(sourceId: String, target: String) = sourceId to target

    private companion object {
        /** Refusals the plan states in « Ce qui part » (and the builder never posts). */
        val WITHDRAWN_BY_THE_PLAN = setOf(ForwardRefusalReason.VIEW_ONCE, ForwardRefusalReason.AFTER_READ)
    }

    /**
     * The conversation list changed. A `null` window (nothing loaded yet) keeps the
     * previous list; an open picker repaints its targets either way.
     */
    fun onConversationsLoaded(conversations: List<ApiConversation>?) {
        allConversations = conversations ?: allConversations
        recomputeTargets()
    }

    /** Opens the share sheet for [messageId], dismissing the long-press action sheet. */
    fun open(messageId: String) = open(listOf(messageId))

    /**
     * Opens the sheet for a whole selection ([messageIds] in thread order, #13294). The first
     * message the exit law lets out is the sheet's source; when none does, the refusal card of the
     * first one is shown. A view-once or after-read message of the selection stays listed so the
     * plan withdraws it and « Ce qui part » says why (it never leaves); a sealed or deleted one is
     * dropped. A share of this source still in flight shows its rows as « sending ».
     */
    fun open(messageIds: List<String>) {
        val refusals = messageIds.associateWith { refusalFor(it) }
        val messageId = messageIds.firstOrNull { refusals[it] == null } ?: messageIds.first()
        val refusal = if (refusals.values.all { it != null }) refusals[messageId] else null
        val additional = messageIds.filter { id ->
            id != messageId && refusals[id].let { it == null || it in WITHDRAWN_BY_THE_PLAN }
        }
        val sending = inFlight.filter { it.first == messageId }.map { it.second }
        state.update {
            it.copy(
                actionMessageId = null,
                forward = ForwardUiState(
                    sourceMessageId = messageId,
                    additionalSourceMessageIds = additional,
                    refusal = refusal,
                    deliveries = sending.associateWith { ShareDelivery.Sending },
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
        state.update { s -> s.forward?.let { s.copy(forward = it.copy(refusal = reason)) } ?: s }
    }

    /**
     * What the exit law refuses for the message [messageId], or `null` when it may be forwarded.
     * Fail-closed on the conversation's regime: in an end-to-end conversation nothing is copied
     * by the gateway, so nothing is offered — even a message served without its cipher flag.
     * A message deleted meanwhile is no longer available.
     */
    private fun refusalFor(messageId: String): ForwardRefusalReason? {
        val message = messages.value.firstOrNull { it.message.id == messageId }?.message ?: return null
        if (!message.deletedAt.isNullOrBlank()) return ForwardRefusalReason.SOURCE_UNAVAILABLE
        return ForwardRefusalReason.local(message.exitOffer(conversationIsEncrypted = state.value.isEndToEnd))
    }

    fun onQueryChange(query: String) {
        state.update { s -> s.forward?.let { s.copy(forward = it.copy(query = query)) } ?: s }
        recomputeTargets()
    }

    fun close() {
        state.update { it.copy(forward = null) }
    }

    // --- The single share sheet (#13469): tick recipients, then Send ---------------------------

    /** The synced source messages of the open sheet, in thread order. */
    private fun sources(forward: ForwardUiState): List<ApiMessage> {
        val synced = messages.value.filter { it.sendState == LocalSendState.SYNCED }.map { it.message }
        return (listOf(forward.sourceMessageId) + forward.additionalSourceMessageIds)
            .mapNotNull { id -> synced.firstOrNull { it.id == id && it.deletedAt.isNullOrBlank() } }
    }

    private fun subject(forward: ForwardUiState) =
        ShareSubject.Messages(sources(forward), conversationId, conversationIsEncrypted = state.value.isEndToEnd)

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
     * so the share survives going offline and closing the sheet. A failure flips only its own row,
     * and its retry posts only what had not left yet. The exit law is read again at the tap: a
     * source deleted or sealed meanwhile shows the refusal card and nothing leaves.
     */
    fun sendSelection() {
        val forward = state.value.forward ?: return
        if (forward.refusal != null || forward.plan?.canSend != true) return
        val sourceId = forward.sourceMessageId
        refusalFor(sourceId)?.let { reason ->
            updateForward { it.copy(refusal = reason, targets = emptyList()) }
            return
        }
        val user = sessionRepository.currentUser.value ?: return
        val pending = forward.selectedConversationIds.filter { id ->
            shareKey(sourceId, id) !in inFlight && forward.deliveries[id].let { it == null || it is ShareDelivery.Failed }
        }
        if (pending.isEmpty()) return
        val built = ShareOutgoingBuilder.build(subject(forward), emptySet(), forward.caption, forward.chosenDurationSeconds)
        if (built is ShareOutgoingResult.Refused) {
            pending.forEach { markDelivery(sourceId, it, ShareDelivery.Failed(built.failure)) }
            return
        }
        val outgoing = (built as ShareOutgoingResult.Ready).messages
        pending.forEach { target ->
            inFlight += shareKey(sourceId, target)
            markDelivery(sourceId, target, ShareDelivery.Sending)
        }
        scope.launch {
            pending.forEach { target ->
                val delivery = deliver(outgoing, shareKey(sourceId, target), target, user)
                inFlight -= shareKey(sourceId, target)
                markDelivery(sourceId, target, delivery)
            }
            workManager.enqueue(OutboxFlushWorker.buildRequest())
        }
    }

    private suspend fun deliver(outgoing: List<OutgoingShare>, key: Pair<String, String>, target: String, user: MeeshyUser): ShareDelivery = try {
        outgoing.drop(alreadyPosted[key] ?: 0).forEach { post ->
            messageRepository.sendOptimistic(
                conversationId = target,
                content = post.content,
                originalLanguage = post.originalLanguage ?: user.systemLanguage?.takeIf { it.isNotBlank() } ?: LanguageResolver.FALLBACK_LANGUAGE,
                sender = user,
                forwardedFromId = post.forwardedFromId,
                forwardedFromConversationId = post.forwardedFromConversationId,
                effects = MessageEffects(flags = post.effectFlags, ephemeralDuration = post.ephemeralDuration),
            )
            alreadyPosted[key] = (alreadyPosted[key] ?: 0) + 1
        }
        alreadyPosted -= key
        ShareDelivery.Sent
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        ShareDelivery.Failed(ShareFailure.GENERIC)
    }

    private fun markDelivery(sourceId: String, target: String, delivery: ShareDelivery) = updateForward { forward ->
        if (forward.sourceMessageId != sourceId) return@updateForward forward
        forward.copy(deliveries = forward.deliveries + (target to delivery))
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
