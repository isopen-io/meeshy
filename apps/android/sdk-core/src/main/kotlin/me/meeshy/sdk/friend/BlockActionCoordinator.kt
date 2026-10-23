package me.meeshy.sdk.friend

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch
import me.meeshy.sdk.outbox.OutboxOutcome
import me.meeshy.sdk.outbox.OutboxRepository
import javax.inject.Inject
import javax.inject.Singleton

/** A block / unblock gesture that ended definitively without reaching the gateway. */
data class BlockFailure(val userId: String, val wasBlocking: Boolean)

/**
 * Observer of a block that the gateway acknowledged (the negative social signal `block`).
 * Bound as a multibinding so the signal bus can join later; with none, the coordinator is unchanged.
 */
fun interface BlockSucceededObserver {
    fun onBlockSucceeded(userId: String)
}

/**
 * The single entry point for blocking and unblocking — port of the iOS `BlockActionCoordinator`,
 * shared by the profile, the conversations and the blocked list.
 *
 * [setBlocked] captures the previous state, flips the [BlockCache] at once (every surface
 * recomputes), queues the durable `BLOCK_USER` / `UNBLOCK_USER` row and wakes the flusher. The
 * outbox outcome is then watched: a definitive failure (or a failed enqueue) restores the previous
 * state and emits a typed [BlockFailure] on [failures] (toast + error haptic are the presenter's
 * job); a toggle annihilated by the coalescer restores silently.
 *
 * The last gesture wins: an outcome only restores when its gesture is still the latest one for the
 * user, so an opposite request in flight never leaves an inconsistent state.
 */
@Singleton
class BlockActionCoordinator internal constructor(
    private val blockRepository: BlockRepository,
    private val blockCache: BlockCache,
    outboxRepository: OutboxRepository,
    private val flushScheduler: OutboxFlushScheduler,
    private val observers: Set<BlockSucceededObserver>,
    scope: CoroutineScope,
) {
    @Inject
    constructor(
        blockRepository: BlockRepository,
        blockCache: BlockCache,
        outboxRepository: OutboxRepository,
        flushScheduler: OutboxFlushScheduler,
        observers: @JvmSuppressWildcards Set<BlockSucceededObserver>,
    ) : this(
        blockRepository,
        blockCache,
        outboxRepository,
        flushScheduler,
        observers,
        CoroutineScope(SupervisorJob() + Dispatchers.Default),
    )

    private class Gesture(val userId: String, val blocked: Boolean, val previous: Boolean)

    private val lock = Any()
    private val latestByUser = mutableMapOf<String, Gesture>()
    private val byCmid = mutableMapOf<String, Gesture>()
    private val _failures = MutableSharedFlow<BlockFailure>(extraBufferCapacity = 16)

    /** One-shot definitive failures, to be told to the user. */
    val failures: SharedFlow<BlockFailure> = _failures.asSharedFlow()

    init {
        scope.launch(start = CoroutineStart.UNDISPATCHED) {
            outboxRepository.outcomes.collect { outcome ->
                try {
                    handle(outcome)
                } catch (e: CancellationException) {
                    throw e
                } catch (_: Exception) {
                    // an observer must never stop the outcome watch
                }
            }
        }
    }

    suspend fun setBlocked(userId: String, blocked: Boolean) {
        if (userId.isBlank()) return
        val gesture = Gesture(userId, blocked, previous = blockCache.isBlocked(userId))
        synchronized(lock) { latestByUser[userId] = gesture }
        val cmid = try {
            blockRepository.setBlockedDurably(userId, blocked)
        } catch (e: CancellationException) {
            forget(gesture)
            throw e
        } catch (_: Exception) {
            if (forget(gesture)) restoreAndFail(gesture)
            return
        }
        if (cmid == null) {
            forget(gesture)
            return
        }
        synchronized(lock) { byCmid[cmid] = gesture }
        flushScheduler.schedule()
    }

    suspend fun block(userId: String) = setBlocked(userId, blocked = true)

    suspend fun unblock(userId: String) = setBlocked(userId, blocked = false)

    private fun forget(gesture: Gesture): Boolean = synchronized(lock) {
        val isLatest = latestByUser[gesture.userId] === gesture
        if (isLatest) latestByUser.remove(gesture.userId)
        isLatest
    }

    private fun handle(outcome: OutboxOutcome) {
        val gesture = synchronized(lock) { byCmid.remove(outcome.cmid) } ?: return
        val isLatest = forget(gesture)
        when (outcome) {
            is OutboxOutcome.Succeeded -> if (gesture.blocked) observers.forEach { it.onBlockSucceeded(gesture.userId) }
            is OutboxOutcome.Exhausted -> if (isLatest) restoreAndFail(gesture)
            is OutboxOutcome.Cancelled -> if (isLatest) blockCache.setBlocked(gesture.userId, gesture.previous)
            is OutboxOutcome.Superseded -> Unit
        }
    }

    private fun restoreAndFail(gesture: Gesture) {
        blockCache.setBlocked(gesture.userId, gesture.previous)
        _failures.tryEmit(BlockFailure(gesture.userId, wasBlocking = gesture.blocked))
    }
}
