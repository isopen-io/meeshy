package me.meeshy.sdk.conversation

import androidx.room.withTransaction
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.ConversationDao
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ConversationReorderItem
import me.meeshy.sdk.model.UserPreferencesConversationUpdatedSocketData
import me.meeshy.sdk.model.applyRemote
import me.meeshy.sdk.model.reorderedTo
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.session.commitOrWrite

/**
 * The read side of the per-USER conversation preferences changed on ANOTHER device: the broadcasts of the gateway,
 * written onto the cached rows. The arbitration lives in the pure folds of `:core:model` ([applyRemote],
 * [reorderedTo]); this class is only the I/O around them, so every drop rule is JVM-covered without a database.
 *
 * Both write on [ApiConversation.preferences] rather than on `userPreferences[0]`, for the reason the optimistic path
 * writes there: it is the override `resolvedPreferences` reads FIRST, so the list re-buckets on the Room emission
 * without waiting for a refetch, and the next REST sync — the server's own truth — replaces the whole row payload and
 * clears the override. A conversation not cached is skipped (the next list refresh catches up — the same silent drop
 * iOS makes).
 */
internal class RemoteConversationPreferences(
    private val database: MeeshyDatabase,
    private val conversationDao: ConversationDao,
    private val fence: AccountFence?,
) {

    /**
     * A conversation-scope `user:preferences-updated` (issue #4127). `false` means nothing was written: the
     * conversation is not cached, or the event lost the version arbitration.
     */
    suspend fun applyUpdated(event: UserPreferencesConversationUpdatedSocketData): Boolean {
        val ticket = fence?.currentTicket()
        return fence.commitOrWrite(ticket) {
            database.withTransaction {
                val row = conversationDao.find(event.conversationId) ?: return@withTransaction false
                val conversation = MeeshyApi.json.decodeFromString<ApiConversation>(row.payload)
                val next = conversation.resolvedPreferences.applyRemote(event) ?: return@withTransaction false
                conversationDao.upsertAll(
                    listOf(
                        row.copy(
                            payload = MeeshyApi.json.encodeToString(conversation.copy(preferences = next)),
                        ),
                    ),
                )
                true
            }
        } ?: false
    }

    /**
     * #18915 (AND-04) — `user:preferences-reordered`: the order a drag set on another device. The order is not
     * versioned ([reorderedTo] moves it and leaves `version` untouched). Returns how many rows changed.
     */
    suspend fun applyReordered(updates: List<ConversationReorderItem>): Int {
        if (updates.isEmpty()) return 0
        val ticket = fence?.currentTicket()
        return fence.commitOrWrite(ticket) {
            database.withTransaction {
                val rows = updates.mapNotNull { update ->
                    val row = conversationDao.find(update.conversationId) ?: return@mapNotNull null
                    val conversation = MeeshyApi.json.decodeFromString<ApiConversation>(row.payload)
                    val next = conversation.resolvedPreferences.reorderedTo(update.orderInCategory) ?: return@mapNotNull null
                    row.copy(payload = MeeshyApi.json.encodeToString(conversation.copy(preferences = next)))
                }
                if (rows.isNotEmpty()) conversationDao.upsertAll(rows)
                rows.size
            }
        } ?: 0
    }
}
