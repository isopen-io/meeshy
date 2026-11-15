package me.meeshy.sdk.friend

import me.meeshy.sdk.model.friend.BlockedUser
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.BlockApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.net.pagedApiCall
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
 * list, read from the canonical `GET /directory/blocks` by cursor. [setBlockedDurably] is the write path (ARCHITECTURE.md §5; ADR-006): it
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
    /**
     * The whole blocklist, a hundred rows a page by cursor. The gateway bounds a page
     * (it served an unbounded list before #4164), and [BlockCache.hydrate] REPLACES the
     * set: hydrating from a first page of a longer list would silently unblock everyone
     * past it for every relationship surface. So the cache is only touched by a read
     * that completed — a failing page leaves it as it was.
     */
    suspend fun listBlocked(): NetworkResult<List<BlockedUser>> =
        drainByCursor(cap = BLOCKED_FETCH_CAP) { cursor ->
            pagedApiCall { blockApi.listBlocked(cursor = cursor, limit = BLOCKED_PAGE_SIZE) }
                .map { DrainedPage(it.data, it.pagination?.nextCursor, it.pagination?.hasMore == true) }
        }.also { if (it is NetworkResult.Success) blockCache.hydrate(it.data) }

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

    /**
     * Delivers one queued `BLOCK_USER` row: `PUT /directory/blocks/{userId}`. The verb is
     * idempotent, so a replay of a block the gateway already applied (a lost
     * acknowledgement, or a row recorded before the app update and replayed after it)
     * answers the same state and the same status — never the `409` the old `POST` alias
     * raised, which the queue read as a failure and rolled the cache back on.
     */
    suspend fun deliverBlock(userId: String): NetworkResult<Unit> =
        apiCall { blockApi.block(userId) }.map { }

    /**
     * Delivers one queued `UNBLOCK_USER` row: `DELETE /directory/blocks/{userId}`.
     *
     * A `404` from the handler (`User is not in your blocked list`) means the wanted
     * state is already reached — the row was replayed after the gateway applied it — so
     * it is a SUCCESS: read as a failure, the queue would exhaust and roll the cache back
     * to BLOCKED a person the gateway has already unblocked. A router `404` (the route
     * itself is unknown) stays a failure.
     */
    suspend fun deliverUnblock(userId: String): NetworkResult<Unit> {
        val outcome = apiCall { blockApi.unblock(userId) }.map { }
        val alreadyUnblocked = outcome is NetworkResult.Failure &&
            outcome.error.httpStatus == HTTP_NOT_FOUND &&
            !outcome.error.isRouteNotServed()
        return if (alreadyUnblocked) NetworkResult.Success(Unit) else outcome
    }

    companion object {
        private const val HTTP_NOT_FOUND = 404

        /** The most the gateway serves per page of `GET /directory/blocks`. */
        const val BLOCKED_PAGE_SIZE: Int = 100

        /** Safety bound of the read, far above a human blocklist. */
        const val BLOCKED_FETCH_CAP: Int = 1_000
    }
}
