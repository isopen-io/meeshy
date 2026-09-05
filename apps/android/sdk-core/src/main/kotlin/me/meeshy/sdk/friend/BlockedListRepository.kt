package me.meeshy.sdk.friend

import androidx.room.withTransaction
import kotlinx.coroutines.flow.first
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.BlockedUserDao
import me.meeshy.core.database.dao.SyncMetaDao
import me.meeshy.core.database.entity.BlockedUserEntity
import me.meeshy.core.database.entity.SyncMetaEntity
import me.meeshy.sdk.cache.SystemCacheClock
import me.meeshy.sdk.model.friend.BlockedUser
import me.meeshy.sdk.net.MeeshyApi
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Room-backed cold-start cache for the Blocked tab's blocklist — the sibling
 * of [FriendListRepository] for the blocked-user roster it does not cover.
 * [BlockCache] tracks only ids (for the resolver); this repository persists
 * the full [BlockedUser] rows so the tab paints instantly before any network
 * call (ARCHITECTURE.md §4: cache-first, network-second).
 *
 * [cachedSnapshot] of `null` is a **cold** cache (never synced); an empty
 * list is a **synced-but-empty** roster (a real "nobody blocked"). The two
 * are distinguished by `sync_meta` so the UI shows a skeleton only on the
 * former.
 */
@Singleton
class BlockedListRepository @Inject constructor(
    private val database: MeeshyDatabase,
    private val blockedUserDao: BlockedUserDao,
    private val syncMetaDao: SyncMetaDao,
) {

    suspend fun cachedSnapshot(): List<BlockedUser>? {
        val rows = blockedUserDao.observeAll().first()
        val syncedAt = syncMetaDao.observe(RESOURCE_KEY).first()
        if (rows.isEmpty() && syncedAt == null) return null
        return rows.map { MeeshyApi.json.decodeFromString<BlockedUser>(it.payload) }
    }

    suspend fun persist(users: List<BlockedUser>) {
        val now = SystemCacheClock.nowMillis()
        val rows = users.mapIndexed { index, user ->
            BlockedUserEntity(
                userId = user.id,
                payload = MeeshyApi.json.encodeToString(user),
                sortIndex = index,
                cachedAt = now,
            )
        }
        database.withTransaction {
            if (rows.isEmpty()) {
                blockedUserDao.clear()
            } else {
                blockedUserDao.upsertAll(rows)
                blockedUserDao.deleteNotIn(rows.map { it.userId })
            }
            syncMetaDao.upsert(SyncMetaEntity(RESOURCE_KEY, now))
        }
    }

    internal companion object {
        const val RESOURCE_KEY: String = "blocked_users"
    }
}
