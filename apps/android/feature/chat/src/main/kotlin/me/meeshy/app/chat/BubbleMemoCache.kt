package me.meeshy.app.chat

import me.meeshy.sdk.conversation.LocalMessage
import me.meeshy.sdk.conversation.LocalSendState
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.component.bubble.BubbleContentBuilder

/**
 * Per-message memoization for [BubbleContentBuilder.build] (#5189).
 * `ChatViewModel`'s combine chain re-emits the ENTIRE message list on any
 * Room write in the conversation (a reaction, a translation arriving, a read
 * receipt) and on every connectivity transition — `toBubbles`
 * (`ChatViewModel.kt`) re-lists ALL messages on every such emission, but a
 * bubble's own Prisme resolution ([BubbleContentBuilder.build]) only needs
 * to re-run when ITS OWN inputs actually changed, never a sibling's.
 *
 * Keyed by message id: [build] returns the cached [BubbleContent] whenever
 * the exact [Signature] of inputs that fed that ONE message is unchanged,
 * and only calls [BubbleContentBuilder.build] on a miss.
 *
 * `isOffline` is folded into the signature only when it can actually change
 * the built bubble — an OUTGOING message still `SENDING`/`FAILED`
 * ([BubbleContentBuilder.build]'s `SendLifecycleResolver` branch,
 * `isOutgoing && (isPending || isFailed)`). A settled or received message's
 * bubble never reads `isOffline`, so a connectivity flip folds to a constant
 * for it and never evicts its cache entry — a network blip must not replay
 * construction for the whole list.
 */
internal class BubbleMemoCache {

    private data class Signature(
        val local: LocalMessage,
        val currentUser: MeeshyUser?,
        val showSenderName: Boolean,
        val ownReactions: Set<String>,
        val recipientCount: Int,
        val showOriginal: Boolean,
        val activeLanguageCode: String?,
        val mediaBaseUrl: String,
        val showReadReceipts: Boolean,
        val offlineIfMaterial: Boolean,
    )

    private var entries: Map<String, Pair<Signature, BubbleContent>> = emptyMap()

    /** How many times [BubbleContentBuilder.build] actually ran — test-only witness (#5189). */
    var buildInvocations: Int = 0
        private set

    fun build(
        local: LocalMessage,
        currentUser: MeeshyUser?,
        showSenderName: Boolean,
        ownReactions: Set<String>,
        recipientCount: Int,
        showOriginal: Boolean,
        activeLanguageCode: String?,
        mediaBaseUrl: String,
        showReadReceipts: Boolean,
        isOffline: Boolean,
    ): BubbleContent {
        val isOutgoing = currentUser?.id != null && local.message.senderId == currentUser.id
        val isPending = local.sendState == LocalSendState.SENDING
        val isFailed = local.sendState == LocalSendState.FAILED
        val offlineMatters = isOutgoing && (isPending || isFailed)
        val signature = Signature(
            local = local,
            currentUser = currentUser,
            showSenderName = showSenderName,
            ownReactions = ownReactions,
            recipientCount = recipientCount,
            showOriginal = showOriginal,
            activeLanguageCode = activeLanguageCode,
            mediaBaseUrl = mediaBaseUrl,
            showReadReceipts = showReadReceipts,
            offlineIfMaterial = if (offlineMatters) isOffline else false,
        )
        val messageId = local.message.id
        val cached = entries[messageId]
        if (cached != null && cached.first == signature) return cached.second

        buildInvocations += 1
        val built = BubbleContentBuilder.build(
            message = local.message,
            currentUserId = currentUser?.id,
            preferences = currentUser ?: EmptyContentPreferences,
            showSenderName = showSenderName,
            isPending = isPending,
            isFailed = isFailed,
            ownReactions = ownReactions,
            showOriginal = showOriginal,
            activeLanguageCode = activeLanguageCode,
            mediaBaseUrl = mediaBaseUrl,
            recipientCount = recipientCount,
            showReadReceipts = showReadReceipts,
            isOffline = isOffline,
        )
        entries = entries + (messageId to (signature to built))
        return built
    }

    /**
     * Drops entries for messages no longer in the visible window (hidden, or
     * paged out) — keeps the cache bounded to what [ChatViewModel] currently
     * renders rather than growing for the life of the screen.
     */
    fun retain(liveMessageIds: Set<String>) {
        entries = entries.filterKeys { it in liveMessageIds }
    }
}
