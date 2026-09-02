package me.meeshy.sdk.friend

import androidx.room.withTransaction
import kotlinx.coroutines.flow.first
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.FriendRequestDao
import me.meeshy.core.database.dao.SyncMetaDao
import me.meeshy.core.database.entity.FriendRequestEntity
import me.meeshy.core.database.entity.SyncMetaEntity
import me.meeshy.sdk.cache.SystemCacheClock
import me.meeshy.sdk.model.FriendRequest
import me.meeshy.sdk.net.MeeshyApi
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Room-backed cold-start cache for the Requests tab's received and sent
 * friend-request lists — the sibling of [FriendListRepository] for the two
 * pending-request rosters it does not cover.
 *
 * [ContactsViewModel] paints [cachedReceived]/[cachedSent] before any network
 * call (ARCHITECTURE.md §4: cache-first, network-second), then writes the
 * authoritative gateway response back through via [persistReceived]/
 * [persistSent] so the next cold launch replays it. A `null` snapshot is a
 * **cold** cache (never synced); an empty list is a **synced-but-empty**
 * roster — the two are distinguished by `sync_meta` per direction so the UI
 * shows a skeleton only on the former.
 */
@Singleton
class FriendRequestListRepository @Inject constructor(
    private val database: MeeshyDatabase,
    private val friendRequestDao: FriendRequestDao,
    private val syncMetaDao: SyncMetaDao,
) {

    suspend fun cachedReceived(): List<FriendRequest>? = cachedSnapshot(DIRECTION_RECEIVED, RESOURCE_KEY_RECEIVED)

    suspend fun cachedSent(): List<FriendRequest>? = cachedSnapshot(DIRECTION_SENT, RESOURCE_KEY_SENT)

    suspend fun persistReceived(requests: List<FriendRequest>) =
        persist(DIRECTION_RECEIVED, RESOURCE_KEY_RECEIVED, requests)

    suspend fun persistSent(requests: List<FriendRequest>) =
        persist(DIRECTION_SENT, RESOURCE_KEY_SENT, requests)

    private suspend fun cachedSnapshot(direction: String, resourceKey: String): List<FriendRequest>? {
        val rows = friendRequestDao.observeAll(direction).first()
        val syncedAt = syncMetaDao.observe(resourceKey).first()
        if (rows.isEmpty() && syncedAt == null) return null
        return rows.map { MeeshyApi.json.decodeFromString<FriendRequest>(it.payload) }
    }

    private suspend fun persist(direction: String, resourceKey: String, requests: List<FriendRequest>) {
        val now = SystemCacheClock.nowMillis()
        val rows = requests.mapIndexed { index, request ->
            FriendRequestEntity(
                id = request.id,
                direction = direction,
                payload = MeeshyApi.json.encodeToString(request),
                sortIndex = index,
                cachedAt = now,
            )
        }
        database.withTransaction {
            if (rows.isEmpty()) {
                friendRequestDao.clear(direction)
            } else {
                friendRequestDao.upsertAll(rows)
                friendRequestDao.deleteNotIn(direction, rows.map { it.id })
            }
            syncMetaDao.upsert(SyncMetaEntity(resourceKey, now))
        }
    }

    internal companion object {
        const val DIRECTION_RECEIVED: String = "received"
        const val DIRECTION_SENT: String = "sent"
        const val RESOURCE_KEY_RECEIVED: String = "friend_requests_received"
        const val RESOURCE_KEY_SENT: String = "friend_requests_sent"
    }
}
