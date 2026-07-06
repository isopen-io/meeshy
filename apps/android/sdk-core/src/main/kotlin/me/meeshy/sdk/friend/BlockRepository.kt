package me.meeshy.sdk.friend

import me.meeshy.sdk.model.friend.BlockedUser
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.BlockApi
import me.meeshy.sdk.net.apiCall
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Block / unblock and blocked-user listing — port of the iOS `BlockService`.
 * Keeps the [BlockCache] SSOT in lock-step with the network: a successful list
 * hydrates it, a successful block/unblock flips the single entry. A failed call
 * never touches the cache (the caller keeps its optimistic state or rolls back).
 */
@Singleton
class BlockRepository @Inject constructor(
    private val blockApi: BlockApi,
    private val blockCache: BlockCache,
) {
    suspend fun listBlocked(): NetworkResult<List<BlockedUser>> =
        apiCall { blockApi.listBlocked() }
            .also { if (it is NetworkResult.Success) blockCache.hydrate(it.data) }

    suspend fun block(userId: String): NetworkResult<Unit> =
        apiCall { blockApi.block(userId) }.map { }
            .also { if (it is NetworkResult.Success) blockCache.setBlocked(userId, blocked = true) }

    suspend fun unblock(userId: String): NetworkResult<Unit> =
        apiCall { blockApi.unblock(userId) }
            .also { if (it is NetworkResult.Success) blockCache.setBlocked(userId, blocked = false) }
}
