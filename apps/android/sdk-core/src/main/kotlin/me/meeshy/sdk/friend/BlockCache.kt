package me.meeshy.sdk.friend

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import me.meeshy.sdk.model.friend.BlockedUser
import javax.inject.Inject
import javax.inject.Singleton

/**
 * In-memory single source of truth for the current user's blocklist, so every
 * relationship-rendering surface resolves the same block state without
 * re-querying the gateway. Port of the iOS `BlockService.blockedUserIds` +
 * `setBlockedOptimistic`/`isBlocked`, the mirror of [FriendshipCache].
 *
 * A [BlockStatusProvider] binds straight onto [isBlocked], closing the seam the
 * [UserRelationshipResolver] left open. All reads/mutations are `synchronized`
 * (socket frames, optimistic UI and hydration land on different threads) and
 * every mutation bumps [version] so reactive consumers recompute — the Android
 * analogue of the iOS `@Published blockedUserIds`.
 */
@Singleton
class BlockCache @Inject constructor() {

    private val lock = Any()
    private val blockedIds = mutableSetOf<String>()

    private val _version = MutableStateFlow(0)

    /** Monotonic counter bumped on every mutation; drives reactive recomputation. */
    val version: StateFlow<Int> = _version.asStateFlow()

    val blockedCount: Int get() = synchronized(lock) { blockedIds.size }

    /**
     * A defensive snapshot of the blocked-id set — copied under the lock so
     * callers can iterate it without racing a mutation.
     */
    val currentBlockedIds: Set<String> get() = synchronized(lock) { blockedIds.toSet() }

    fun isBlocked(userId: String): Boolean = synchronized(lock) { blockedIds.contains(userId) }

    /**
     * Rebuild the whole blocklist from the authoritative list response. Fully
     * replaces prior state so a stale entry can never survive a refresh; blank
     * ids are skipped.
     */
    fun hydrate(users: List<BlockedUser>) {
        synchronized(lock) {
            blockedIds.clear()
            users.forEach { if (it.id.isNotBlank()) blockedIds.add(it.id) }
        }
        bumpVersion()
    }

    /**
     * Optimistically flip a single user's block state (and the rollback of a
     * failed mutation). A blank id is inert — no state change, no version bump.
     */
    fun setBlocked(userId: String, blocked: Boolean) {
        if (userId.isBlank()) return
        synchronized(lock) {
            if (blocked) blockedIds.add(userId) else blockedIds.remove(userId)
        }
        bumpVersion()
    }

    /** Purge the blocklist so the next session doesn't inherit it (logout). */
    fun clear() {
        synchronized(lock) { blockedIds.clear() }
        bumpVersion()
    }

    private fun bumpVersion() {
        _version.value += 1
    }
}
