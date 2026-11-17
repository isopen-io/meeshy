package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/**
 * Wire payload of `user:preferences-reordered` — the gateway's `UserPreferencesReorderedEventData`, broadcast by
 * `reorderConversationPreferences` (`services/gateway/src/services/conversationPreferencesSync.ts`) to the user's
 * personal room once a drag inside a category has been written: `{ userId, updates: [{ conversationId,
 * orderInCategory }] }`, exactly the rows the gateway wrote (its membership filter bounds them). Twin of iOS
 * `ConversationStoreSocketBridge` → `applyRemoteReorder` (#18915).
 *
 * A drag is broadcast through this event only (unversioned), and the list's REST reads do not serve the order: a
 * reorder made on the web or on the iPhone reaches this device through this event, or not at all.
 */
@Serializable
data class UserPreferencesReorderedSocketData(
    val userId: String,
    val updates: List<ConversationReorderItem> = emptyList(),
) {
    /** The updates of the signed-in account; a frame naming another user, or read with no user signed in, folds nothing. */
    fun updatesFor(currentUserId: String?): List<ConversationReorderItem> =
        if (currentUserId.isNullOrBlank() || userId != currentUserId) emptyList() else updates
}

/**
 * Folds one `orderInCategory` of a reorder broadcast onto the cached preferences — the port of iOS
 * `applyRemoteReorder`. The order sits outside the versioned path (the gateway bumps no version for it, and the
 * broadcast carries none): it applies ungated and leaves [ApiConversationPreferences.version] untouched, so the next
 * `user:preferences-updated` keeps its arbitration ([applyRemote]). `null` when the row already sits at that place —
 * nothing to write.
 */
fun ApiConversationPreferences?.reorderedTo(orderInCategory: Int): ApiConversationPreferences? {
    val local = this ?: ApiConversationPreferences()
    return if (local.orderInCategory == orderInCategory) null else local.copy(orderInCategory = orderInCategory)
}
