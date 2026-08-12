package me.meeshy.sdk.friend

import me.meeshy.sdk.model.friend.BlockedUser
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.BlockApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxMutation
import me.meeshy.sdk.outbox.OutboxRepository
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Block / unblock and blocked-user listing — port of the iOS `BlockService`.
 *
 * [listBlocked] hydrates the [BlockCache] SSOT from the authoritative network
 * list. [setBlockedDurably] is the write path (ARCHITECTURE.md §5; ADR-006): it
 * flips the cache optimistically and enqueues a durable `BLOCK_USER`/`UNBLOCK_USER`
 * mutation that survives offline + process death, instead of an online-first REST
 * call that a dropped connection would silently lose. The `OutboxFlushWorker`
 * delivers it (rolling the cache back on a hard exhaust) and the coalescer
 * collapses a block+unblock pair. Surpasses iOS, whose block/unblock is online-only.
 */
@Singleton
class BlockRepository @Inject constructor(
    private val blockApi: BlockApi,
    private val blockCache: BlockCache,
    private val outboxRepository: OutboxRepository,
) {
    suspend fun listBlocked(): NetworkResult<List<BlockedUser>> =
        apiCall { blockApi.listBlocked() }
            .also { if (it is NetworkResult.Success) blockCache.hydrate(it.data) }

    /**
     * Optimistically sets a user's block state and queues its durable delivery.
     * The [BlockCache] flips immediately (every relationship surface re-resolves)
     * and a `BLOCK_USER` (when [blocked]) or `UNBLOCK_USER` mutation joins the
     * dedicated block lane. A blank id is inert (returns `null`, no cache change).
     *
     * @return the queued row's `cmid`, or `null` when the enqueue annihilated a
     *   pending opposite mutation (the toggle cancelled itself) — the caller uses
     *   a non-`null` result to decide whether to wake the flush worker.
     */
    suspend fun setBlockedDurably(userId: String, blocked: Boolean): String? {
        if (userId.isBlank()) return null
        blockCache.setBlocked(userId, blocked)
        return outboxRepository.enqueue(
            OutboxMutation(
                kind = if (blocked) OutboxKind.BLOCK_USER else OutboxKind.UNBLOCK_USER,
                lane = OutboxLanes.BLOCK,
                targetId = userId,
                payload = "",
            ),
        )
    }
}
