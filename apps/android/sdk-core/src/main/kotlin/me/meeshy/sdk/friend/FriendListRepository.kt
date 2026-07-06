package me.meeshy.sdk.friend

import androidx.room.withTransaction
import kotlinx.coroutines.flow.first
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.FriendDao
import me.meeshy.core.database.dao.SyncMetaDao
import me.meeshy.core.database.entity.FriendEntity
import me.meeshy.core.database.entity.SyncMetaEntity
import me.meeshy.sdk.cache.SystemCacheClock
import me.meeshy.sdk.model.FriendRequestUser
import me.meeshy.sdk.net.MeeshyApi
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Room-backed cold-start cache for the Contacts (accepted-friend) list —
 * the Android analogue of the iOS `CacheCoordinator.friends`.
 *
 * The friend graph itself is owned by [ContactsListViewModel] (assembled from the
 * accepted friend requests via the pure `ContactList`); this repository only
 * **persists** that assembled roster and **replays** it on the next cold launch so
 * the tab paints instantly before any network call (ARCHITECTURE.md §4:
 * cache-first, network-second). It deliberately holds no network dependency and no
 * assembly logic — the list is written through by the ViewModel on every
 * successful load and read back verbatim, ordering included.
 *
 * A [cachedSnapshot] of `null` is a **cold** cache (never synced); an empty list
 * is a **synced-but-empty** roster (a real "you have no friends yet"). The two are
 * distinguished by `sync_meta` so the UI shows a skeleton only on the former.
 */
@Singleton
class FriendListRepository @Inject constructor(
    private val database: MeeshyDatabase,
    private val friendDao: FriendDao,
    private val syncMetaDao: SyncMetaDao,
) {

    /**
     * The last-persisted friend roster for instant cold-start paint, or `null`
     * when the cache has never been synced (cold). Preserves the exact order the
     * roster was persisted in (the DAO orders by `sortIndex`).
     */
    suspend fun cachedSnapshot(): List<FriendRequestUser>? {
        val rows = friendDao.observeAll().first()
        val syncedAt = syncMetaDao.observe(RESOURCE_KEY).first()
        if (rows.isEmpty() && syncedAt == null) return null
        return rows.map { MeeshyApi.json.decodeFromString<FriendRequestUser>(it.payload) }
    }

    /**
     * Write the assembled friend roster through to Room so the next cold launch
     * paints from it. Fully replaces the cached set (rows absent from [friends]
     * are dropped) and stamps `sync_meta` — even for an empty roster, so a real
     * empty list reads back as synced-empty rather than cold.
     */
    suspend fun persist(friends: List<FriendRequestUser>) {
        val now = SystemCacheClock.nowMillis()
        val rows = friends.mapIndexed { index, friend ->
            FriendEntity(
                userId = friend.id,
                payload = MeeshyApi.json.encodeToString(friend),
                sortIndex = index,
                cachedAt = now,
            )
        }
        database.withTransaction {
            if (rows.isEmpty()) {
                friendDao.clear()
            } else {
                friendDao.upsertAll(rows)
                friendDao.deleteNotIn(rows.map { it.userId })
            }
            syncMetaDao.upsert(SyncMetaEntity(RESOURCE_KEY, now))
        }
    }

    internal companion object {
        const val RESOURCE_KEY: String = "friends_list"
    }
}
