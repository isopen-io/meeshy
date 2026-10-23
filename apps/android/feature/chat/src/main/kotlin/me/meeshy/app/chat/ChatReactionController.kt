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
import me.meeshy.sdk.model.ReactionUpdateEvent
import me.meeshy.sdk.outbox.OutboxFlushWorker
import me.meeshy.sdk.reaction.EmojiUsageStore
import me.meeshy.sdk.reaction.ReactionRepository
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.MessageSocketManager

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
            messageSocketManager.reactionAdded.collect { event ->
                applyPeerReactionEvent(event, delta = 1)
            }
        }
        scope.launch {
            messageSocketManager.reactionRemoved.collect { event ->
                applyPeerReactionEvent(event, delta = -1)
            }
        }
    }

    /**
     * Own echoes are skipped — the optimistic toggle already moved the cached
     * summary; replaying the echo would double-count it.
     */
    private suspend fun applyPeerReactionEvent(event: ReactionUpdateEvent, delta: Int) {
        if (event.conversationId != conversationId) return
        if (event.userId == sessionRepository.currentUser.value?.id) return
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

    fun openEmojiPicker(messageId: String) {
        state.update { it.copy(emojiPickerMessageId = messageId, actionMessageId = null) }
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
     * picker close.
     */
    fun toggle(messageId: String, emoji: String) {
        val key = "$messageId|$emoji"
        if (!togglesInFlight.add(key)) {
            state.update { it.copy(actionMessageId = null, emojiPickerMessageId = null) }
            return
        }
        val mine = mutableOwnReactions.value[messageId] ?: emptySet()
        val isAdding = emoji !in mine
        if (isAdding) emojiUsageStore.record(emoji)
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
        state.update {
            it.copy(
                reactionDetails = ReactionDetailsUiState(
                    messageId = messageId,
                    isLoading = true,
                    breakdown = ReactionBreakdown(emptyList()),
                    quickEmojis = emojiUsageStore.top(DETAIL_QUICK_REACTION_COUNT),
                ),
            )
        }
        scope.launch {
            val details = reactionRepository.fetchDetails(messageId).getOrNull()
            if (details != null) {
                mutableOwnReactions.update { it + (messageId to details.userReactions.toSet()) }
            }
            val currentUserId = sessionRepository.currentUser.value?.id.orEmpty()
            val breakdown = details?.let { ReactionBreakdown.of(it, currentUserId) }
                ?: ReactionBreakdown(emptyList())
            state.update { current ->
                val open = current.reactionDetails
                if (open == null || open.messageId != messageId) return@update current
                current.copy(reactionDetails = open.copy(isLoading = false, breakdown = breakdown))
            }
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
