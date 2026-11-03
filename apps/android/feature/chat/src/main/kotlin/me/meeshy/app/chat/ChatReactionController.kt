package me.meeshy.app.chat

import androidx.work.WorkManager
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.model.EmojiCatalog
import me.meeshy.sdk.model.EmojiUsageRanker
import me.meeshy.sdk.model.ReactionAnimationGate
import me.meeshy.sdk.model.ReactionLedger
import me.meeshy.sdk.model.ReactionUpdateEvent
import me.meeshy.sdk.outbox.OutboxFlushWorker
import me.meeshy.sdk.reaction.EmojiUsageStore
import me.meeshy.sdk.reaction.OwnReactionWithdrawal
import me.meeshy.sdk.reaction.OwnReactionWithdrawals
import me.meeshy.sdk.reaction.ReactionRepository
import me.meeshy.sdk.reaction.ReactionRowStore
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.sdk.socket.collectArrived

/**
 * Everything the conversation screen does with reactions: the optimistic add/remove
 * toggle, the quick-reaction strip ranked by the viewer's own usage, the who-reacted
 * sheet, the emoji picker, and the peers' reaction frames folded into the cache.
 *
 * It owns the viewer's own reactions ([ownReactions]) — the map the bubble projection
 * reads to light the viewer's chips — and writes the screen state only through [state].
 * Port of the reaction slice of iOS `ConversationViewModel+MessageActions`.
 */
internal class ChatReactionController(
    private val scope: CoroutineScope,
    private val state: ChatStateAccess,
    private val conversationId: String,
    private val messageRepository: MessageRepository,
    private val reactionRepository: ReactionRepository,
    private val sessionRepository: SessionRepository,
    private val emojiUsageStore: EmojiUsageStore,
    private val messageSocketManager: MessageSocketManager,
    private val workManager: WorkManager,
    private val ownReactionWithdrawals: OwnReactionWithdrawals,
    private val animationGate: ReactionAnimationGate = ReactionAnimationGate.Shared,
    private val rowStore: ReactionRowStore? = null,
) {

    private val mutableOwnReactions = MutableStateFlow<Map<String, Set<String>>>(emptyMap())

    /** messageId -> the emojis the viewer has put on it, optimistic until the outbox confirms. */
    val ownReactions: StateFlow<Map<String, Set<String>>> = mutableOwnReactions.asStateFlow()

    /** `messageId|emoji` pairs whose toggle is still being persisted — see [toggle]. */
    private val togglesInFlight = mutableSetOf<String>()

    /** Starts the strip ranking and the peers' reaction collectors on the screen scope. */
    fun start() {
        scope.launch {
            emojiUsageStore.usage.collect { usage ->
                val ordered = EmojiUsageRanker.topEmojis(
                    usage = usage,
                    defaults = EmojiCatalog.defaultQuickReactions,
                    count = QUICK_REACTION_COUNT,
                )
                state.update { it.copy(quickReactions = ordered) }
            }
        }
        scope.launch {
            messageSocketManager.reactionAdded.collectArrived { event ->
                applyPeerReactionEvent(event, delta = 1)
            }
        }
        scope.launch {
            messageSocketManager.reactionRemoved.collectArrived { event ->
                applyPeerReactionEvent(event, delta = -1)
            }
        }
        scope.launch {
            ownReactionWithdrawals.withdrawals.collect(::applyWithdrawal)
        }
    }

    /**
     * #13803 — the outbox gave a reaction up (refused in clear for an end-to-end conversation, retries spent) and already
     * took its chip back in the cached summary: the viewer's own mark follows, here and in the open who-reacted sheet. A
     * message this screen never reacted to has no mark to take back.
     */
    private fun applyWithdrawal(withdrawal: OwnReactionWithdrawal) {
        val mine = mutableOwnReactions.value[withdrawal.messageId] ?: return
        val restored = if (withdrawal.stillMine) mine + withdrawal.emoji else mine - withdrawal.emoji
        mutableOwnReactions.update { it + (withdrawal.messageId to restored) }
        applySelfToOpenDetails(withdrawal.messageId, withdrawal.emoji, present = withdrawal.stillMine)
    }

    /**
     * The echo lands in the persisted rows first (who reacted, offline): my own add already has its optimistic row,
     * so it never counts twice; the same echo coming from ANOTHER device of mine finds no row and moves the summary
     * once. A peer's echo moves the summary as before.
     */
    private suspend fun applyPeerReactionEvent(event: ReactionUpdateEvent, delta: Int) {
        if (event.conversationId != conversationId) return
        val me = sessionRepository.currentUser.value?.id
        val rowsMoved = rowStore?.record(
            messageId = event.messageId,
            emoji = event.emoji,
            adding = delta > 0,
            participantId = event.participantId,
            ownerUserId = event.userId,
            currentUserId = me,
            aggregate = event.aggregation?.let { ReactionLedger.Aggregate(it.count, it.participantIds) },
        ) ?: false
        if (event.userId == me) {
            if (rowsMoved) messageRepository.applyReactionDelta(event.messageId, event.emoji, delta)
            return
        }
        if (delta > 0) animationGate.markAdded(event.messageId, event.emoji)
        messageRepository.applyReactionDelta(event.messageId, event.emoji, delta)
    }

    /**
     * Refreshes the viewer's own reactions on [messageId] from the server detail —
     * run when its action sheet opens so the quick bar lights the right chips. A failed
     * fetch leaves the optimistic picture untouched.
     */
    fun refreshOwnReactions(messageId: String) {
        scope.launch {
            val details = reactionRepository.fetchDetails(messageId).getOrNull() ?: return@launch
            mutableOwnReactions.update { it + (messageId to details.userReactions.toSet()) }
        }
    }

    /** #13790 — an end-to-end conversation carries reactions as encrypted signals this device cannot seal: no picker opens. */
    fun openEmojiPicker(messageId: String) {
        val picked = messageId.takeUnless { state.value.isEndToEnd }
        state.update { it.copy(emojiPickerMessageId = picked, actionMessageId = null) }
    }

    fun dismissEmojiPicker() {
        state.update { it.copy(emojiPickerMessageId = null) }
    }

    /**
     * Optimistically adds (or removes) [emoji] on [messageId]: the viewer's chip flips at
     * once, the toggle is persisted through the outbox, and a refusal or a failure
     * rolls the chip back to the snapshot taken before the tap (a failure also surfaces
     * through [ChatUiState.errorMessage]).
     *
     * One toggle per `message + emoji` is in flight at a time: a second tap while the first
     * is still being persisted is inert, so a burst of taps can never send two mutations
     * that race each other's rollback snapshot. Either way the action sheet and the
     * picker close. In an end-to-end conversation (#13790) the toggle has no effect at all:
     * the reaction would leave in clear, which the gateway refuses.
     */
    fun toggle(messageId: String, emoji: String) {
        val key = "$messageId|$emoji"
        if (state.value.isEndToEnd || !togglesInFlight.add(key)) {
            state.update { it.copy(actionMessageId = null, emojiPickerMessageId = null) }
            return
        }
        val mine = mutableOwnReactions.value[messageId] ?: emptySet()
        val isAdding = emoji !in mine
        if (isAdding) {
            emojiUsageStore.record(emoji)
            animationGate.markAdded(messageId, emoji)
        }
        mutableOwnReactions.update { it + (messageId to if (isAdding) mine + emoji else mine - emoji) }
        applySelfToOpenDetails(messageId, emoji, present = isAdding)
        state.update { it.copy(actionMessageId = null, emojiPickerMessageId = null) }
        scope.launch {
            try {
                if (messageRepository.toggleReactionOptimistic(messageId, emoji, isAdding)) {
                    workManager.enqueue(OutboxFlushWorker.buildRequest())
                } else {
                    mutableOwnReactions.update { it + (messageId to mine) }
                    applySelfToOpenDetails(messageId, emoji, present = !isAdding)
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                mutableOwnReactions.update { it + (messageId to mine) }
                applySelfToOpenDetails(messageId, emoji, present = !isAdding)
                state.update { it.copy(errorMessage = e.message) }
            } finally {
                togglesInFlight.remove(key)
            }
        }
    }

    /**
     * Quick-strip add from the who-reacted sheet: puts [emoji] on [messageId] unless the viewer
     * already has it (the strip adds, it never takes a reaction back). The usage is recorded by
     * [toggle], so the strip re-ranks.
     */
    fun addFromDetails(messageId: String, emoji: String) {
        if (emoji in (mutableOwnReactions.value[messageId] ?: emptySet())) return
        toggle(messageId, emoji)
    }

    /** Mirrors the viewer's toggle into the open who-reacted sheet so its tabs and counts move at once. */
    private fun applySelfToOpenDetails(messageId: String, emoji: String, present: Boolean) {
        val me = sessionRepository.currentUser.value ?: return
        val name = me.displayName?.takeIf { it.isNotBlank() } ?: me.username
        state.update { current ->
            val open = current.reactionDetails?.takeIf { it.messageId == messageId } ?: return@update current
            val breakdown = open.breakdown.withSelfReaction(emoji, me.id, name, present)
            current.copy(
                reactionDetails = open.copy(
                    breakdown = breakdown,
                    selectedTabIndex = open.selectedTabIndex.coerceIn(0, (breakdown.tabs.size - 1).coerceAtLeast(0)),
                    quickEmojis = emojiUsageStore.top(DETAIL_QUICK_REACTION_COUNT),
                ),
            )
        }
    }

    /**
     * Open the who-reacted sheet for [messageId]. Shows immediately (cache-first:
     * the sheet appears with an empty, loading breakdown) then fills in the
     * reactor list from a fresh detail fetch. A failed fetch leaves the sheet
     * on an empty (non-loading) breakdown rather than crashing. Reuses the
     * fetch to refresh [ownReactions] too. See [ReactionBreakdown].
     */
    fun openDetails(messageId: String) {
        val cachedBreakdown = ReactionBreakdown(emptyList())
        state.update {
            it.copy(
                reactionDetails = ReactionDetailsUiState(
                    messageId = messageId,
                    isLoading = true,
                    breakdown = cachedBreakdown,
                    quickEmojis = emojiUsageStore.top(DETAIL_QUICK_REACTION_COUNT),
                ),
            )
        }
        scope.launch {
            val currentUser = sessionRepository.currentUser.value?.id.orEmpty()
            val persisted = rowStore?.rows(messageId)?.takeIf { it.isNotEmpty() }
                ?.let { ReactionBreakdown.fromRows(it, currentUser) }
            if (persisted != null) showPersisted(messageId, persisted)
            val details = reactionRepository.fetchDetails(messageId).getOrNull()
            if (details != null) {
                mutableOwnReactions.update { it + (messageId to details.userReactions.toSet()) }
            }
            val currentUserId = sessionRepository.currentUser.value?.id.orEmpty()
            val breakdown = details?.let { ReactionBreakdown.of(it, currentUserId) }
                ?: persisted
                ?: ReactionBreakdown(emptyList())
            state.update { current ->
                val open = current.reactionDetails
                if (open == null || open.messageId != messageId) return@update current
                current.copy(reactionDetails = open.copy(isLoading = false, breakdown = breakdown))
            }
        }
    }

    /** The persisted rows paint the open sheet at once, while the server detail is still on its way. */
    private fun showPersisted(messageId: String, breakdown: ReactionBreakdown) {
        state.update { current ->
            val open = current.reactionDetails?.takeIf { it.messageId == messageId } ?: return@update current
            current.copy(reactionDetails = open.copy(breakdown = breakdown))
        }
    }

    /** Select a tab in the open who-reacted sheet; an out-of-range index is inert. */
    fun selectTab(index: Int) {
        state.update { it.copy(reactionDetails = it.reactionDetails?.withSelectedTab(index)) }
    }

    /** Dismiss the who-reacted sheet. */
    fun closeDetails() {
        state.update { it.copy(reactionDetails = null) }
    }

    private companion object {
        val QUICK_REACTION_COUNT: Int = EmojiCatalog.defaultQuickReactions.size
        const val DETAIL_QUICK_REACTION_COUNT = 12
    }
}
