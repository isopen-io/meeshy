package me.meeshy.app.chat

import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.chat.LocallyHiddenMessages
import me.meeshy.sdk.conversation.LocalMessage
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import me.meeshy.ui.component.bubble.BubbleContent

/**
 * The message-window projection of the conversation screen: how the cached
 * [LocalMessage] stream, the viewer's per-message toggles and the privacy/network
 * posture fold into [ChatUiState.messages]. Pure functions over the inputs — the
 * ViewModel only wires the flows that feed them, so the projection reads (and is
 * testable) without a ViewModel.
 */

internal data class BubbleInputs(
    val result: CacheResult<List<LocalMessage>>,
    val user: MeeshyUser?,
    val ownReactions: Map<String, Set<String>>,
    val showingOriginal: Set<String>,
    val recipientCount: Int,
)

internal fun <T> CacheResult<List<T>>.windowOrNull(): List<T>? = when (this) {
    is CacheResult.Fresh -> value
    is CacheResult.Stale -> value
    is CacheResult.Syncing -> value
    CacheResult.Empty -> emptyList()
}

internal fun ChatUiState.applyResult(
    result: CacheResult<List<LocalMessage>>,
    currentUser: MeeshyUser?,
    ownReactions: Map<String, Set<String>>,
    showingOriginal: Set<String>,
    mediaBaseUrl: String,
    recipientCount: Int,
    hidden: LocallyHiddenMessages,
    starredIds: Set<String>,
    activeLanguageOverride: Map<String, String>,
    showReadReceipts: Boolean,
    isOffline: Boolean,
    bubbleMemo: BubbleMemoCache,
): ChatUiState {
    val updated = when (result) {
        is CacheResult.Fresh -> copy(
            messages = result.value.toBubbles(currentUser, ownReactions, showingOriginal, mediaBaseUrl, recipientCount, hidden, starredIds, activeLanguageOverride, showReadReceipts, isOffline, bubbleMemo),
            ownReactions = ownReactions,
            isSyncing = false,
            showSkeleton = false,
            errorMessage = null,
        )
        is CacheResult.Stale -> copy(
            messages = result.value.toBubbles(currentUser, ownReactions, showingOriginal, mediaBaseUrl, recipientCount, hidden, starredIds, activeLanguageOverride, showReadReceipts, isOffline, bubbleMemo),
            ownReactions = ownReactions,
            isSyncing = true,
            showSkeleton = false,
        )
        is CacheResult.Syncing -> copy(
            messages = result.value?.toBubbles(currentUser, ownReactions, showingOriginal, mediaBaseUrl, recipientCount, hidden, starredIds, activeLanguageOverride, showReadReceipts, isOffline, bubbleMemo)
                ?: messages,
            ownReactions = ownReactions,
            isSyncing = true,
            showSkeleton = result.value == null && messages.isEmpty() && errorMessage == null,
        )
        CacheResult.Empty -> copy(
            messages = emptyList(),
            ownReactions = ownReactions,
            isSyncing = false,
            showSkeleton = errorMessage == null,
        )
    }
    // Standing invariant, not just an open()-time guard (see openPinnedSheet's doc
    // comment "no empty sheet"): if the last pin drains away — peer/self unpin, or
    // the pinned message gets deleted — while the sheet is already open, close it
    // here too. Resetting isPinnedSheetOpen itself (not just hiding the rendering)
    // matters: a later new pin must require an explicit re-open, not silently
    // resurrect a sheet the user already dismissed by running out of content.
    val pinReconciled = if (updated.isPinnedSheetOpen && updated.pinnedMessages.isEmpty()) {
        updated.copy(isPinnedSheetOpen = false)
    } else {
        updated
    }
    // Same standing invariant for the reply-thread overlay: if the focused thread drains
    // to no live reply (every reply deleted) or its parent pages out while the overlay is
    // open, close it — no dead-end empty overlay, and a later new reply requires an
    // explicit re-open rather than silently resurrecting a dismissed overlay.
    return if (pinReconciled.replyThreadParentId != null && pinReconciled.replyThreadOverlay == null) {
        pinReconciled.copy(replyThreadParentId = null)
    } else {
        pinReconciled
    }
}

private fun List<LocalMessage>.toBubbles(
    currentUser: MeeshyUser?,
    ownReactions: Map<String, Set<String>>,
    showingOriginal: Set<String>,
    mediaBaseUrl: String,
    recipientCount: Int,
    hidden: LocallyHiddenMessages,
    starredIds: Set<String>,
    activeLanguageOverride: Map<String, String>,
    showReadReceipts: Boolean,
    isOffline: Boolean,
    bubbleMemo: BubbleMemoCache,
): List<BubbleContent> {
    val visible = MessageOrdering.order(filterNot { hidden.isHidden(it.message.id) }) { local ->
        MessageOrderInput(createdAtMillis = isoToEpochMillisOrNull(local.message.createdAt))
    }
    val groupPositions = MessageGrouping.positions(
        visible.map { local ->
            MessageGroupInput(
                id = local.message.id,
                senderId = local.message.senderId,
                isOutgoing = currentUser?.id != null && local.message.senderId == currentUser.id,
                createdAtMillis = isoToEpochMillisOrNull(local.message.createdAt),
                isSystem = local.message.isSystemMessage,
            )
        },
    )
    // #5189 — drop cache entries for messages no longer in the visible window
    // (hidden, or paged out) before they'd otherwise sit unused forever.
    bubbleMemo.retain(visible.mapTo(mutableSetOf()) { it.message.id })
    return visible.map { local ->
        val position = groupPositions[local.message.id] ?: STANDALONE_GROUP_POSITION
        bubbleMemo.build(
            local = local,
            currentUser = currentUser,
            // iOS : l'identité de l'auteur ferme la suite (pied de la DERNIÈRE bulle).
            showSenderName = position.isLastInGroup,
            ownReactions = ownReactions[local.message.id] ?: emptySet(),
            recipientCount = recipientCount,
            showOriginal = local.message.id in showingOriginal,
            activeLanguageCode = activeLanguageOverride[local.message.id],
            mediaBaseUrl = mediaBaseUrl,
            showReadReceipts = showReadReceipts,
            isOffline = isOffline,
        ).copy(
            isStarred = local.message.id in starredIds,
            isFirstInGroup = position.isFirstInGroup,
            isLastInGroup = position.isLastInGroup,
        )
    }
}

private val STANDALONE_GROUP_POSITION =
    MessageGroupPosition(isFirstInGroup = true, isLastInGroup = true)

/**
 * Project the visible bubbles into the opaque searchable model. Deleted bubbles
 * (placeholder text) and bubbles with no textual body (image/file only) carry no
 * searchable text and are skipped; the stored original is searched alongside the
 * displayed translation so search stays translation-match aware.
 */
internal fun List<BubbleContent>.toSearchable(): List<SearchableMessage> =
    mapNotNull { bubble ->
        if (bubble.isDeleted) return@mapNotNull null
        val texts = listOfNotNull(bubble.text, bubble.originalText).filter { it.isNotBlank() }
        if (texts.isEmpty()) null else SearchableMessage(bubble.messageId, texts)
    }

internal object EmptyContentPreferences : LanguageResolver.ContentLanguagePreferences {
    override val systemLanguage: String? = null
    override val regionalLanguage: String? = null
    override val customDestinationLanguage: String? = null
}
