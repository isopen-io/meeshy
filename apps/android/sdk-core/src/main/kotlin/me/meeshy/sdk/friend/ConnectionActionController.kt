package me.meeshy.sdk.friend

import androidx.work.WorkManager
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.friend.ConnectionFeedback
import me.meeshy.sdk.model.friend.FriendshipStatus
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.outbox.OutboxFlushWorker
import me.meeshy.sdk.outbox.OutboxIds
import me.meeshy.sdk.outbox.OutboxOutcome
import me.meeshy.sdk.outbox.OutboxRepository
import javax.inject.Inject
import javax.inject.Singleton

/** Wakes the outbox flusher after a mutation is queued (a seam so tests need no WorkManager). */
fun interface OutboxFlushScheduler {
    fun schedule()
}

/** Production [OutboxFlushScheduler]: one network-constrained flush request. */
class WorkManagerOutboxFlushScheduler @Inject constructor(
    private val workManager: WorkManager,
) : OutboxFlushScheduler {
    override fun schedule() {
        workManager.enqueue(OutboxFlushWorker.buildRequest())
    }
}

/**
 * The optimistic mutation owner behind the shared connection chip — port of the
 * gesture half of iOS `ConnectionActionView`. Every gesture follows
 * snapshot -> apply to [FriendshipCache] -> network/outbox -> rollback on failure,
 * and reports its outcome on [feedback] (toast + haptic are the presenter's job).
 *
 * - **send**: queued durably through the `SEND_FRIEND_REQUEST` outbox row (works
 *   offline, the badge reads "En attente" at once); if the queue exhausts the
 *   retry budget the pending state is rolled back and [ConnectionFeedback.RequestSendFailed]
 *   is emitted.
 * - **double tap guard**: one in-flight gesture per user id; a repeated tap is ignored.
 * - **cancel** of a request still queued offline discards the outbox row instead
 *   of calling the network (the iOS "narrow gap" is closed here).
 */
@Singleton
class ConnectionActionController internal constructor(
    private val friendshipCache: FriendshipCache,
    private val friendRepository: FriendRepository,
    private val outboxRepository: OutboxRepository,
    private val flushScheduler: OutboxFlushScheduler,
    private val scope: CoroutineScope,
) {
    @Inject
    constructor(
        friendshipCache: FriendshipCache,
        friendRepository: FriendRepository,
        outboxRepository: OutboxRepository,
        flushScheduler: OutboxFlushScheduler,
    ) : this(
        friendshipCache,
        friendRepository,
        outboxRepository,
        flushScheduler,
        CoroutineScope(SupervisorJob() + Dispatchers.Default),
    )

    private val lock = Any()
    private val inFlight = mutableSetOf<String>()
    private val queuedSends = mutableMapOf<String, QueuedSend>()
    private val _feedback = MutableSharedFlow<ConnectionFeedback>(extraBufferCapacity = 16)

    /** One-shot outcomes (toast + haptic). */
    val feedback: SharedFlow<ConnectionFeedback> = _feedback.asSharedFlow()

    fun isBusy(userId: String): Boolean = synchronized(lock) { userId in inFlight }

    fun send(userId: String): Job? = guarded(userId) {
        if (friendshipCache.status(userId) !is FriendshipStatus.None) return@guarded
        val cmid = OutboxIds.cmid()
        val outcomeWatch = watchOutcome(userId, cmid)
        try {
            val queued = friendRepository.enqueueSendFriendRequest(userId, cmid)
            if (queued == null) {
                outcomeWatch.cancel()
                return@guarded
            }
            synchronized(lock) { queuedSends[userId] = QueuedSend(cmid, outcomeWatch) }
            friendshipCache.didSendRequest(userId, cmid)
            flushScheduler.schedule()
            _feedback.emit(ConnectionFeedback.RequestSent)
        } catch (e: CancellationException) {
            outcomeWatch.cancel()
            throw e
        } catch (e: Exception) {
            outcomeWatch.cancel()
            _feedback.emit(ConnectionFeedback.RequestSendFailed)
        }
    }

    fun accept(userId: String): Job? = guarded(userId) {
        val status = friendshipCache.status(userId) as? FriendshipStatus.PendingReceived ?: return@guarded
        friendshipCache.didAcceptRequest(userId)
        when (friendRepository.respond(status.requestId, accepted = true)) {
            is NetworkResult.Success -> _feedback.emit(ConnectionFeedback.ConnectionAccepted)
            is NetworkResult.Failure -> {
                friendshipCache.rollbackAccept(userId, status.requestId)
                _feedback.emit(ConnectionFeedback.AcceptFailed)
            }
        }
    }

    fun decline(userId: String): Job? = guarded(userId) {
        val status = friendshipCache.status(userId) as? FriendshipStatus.PendingReceived ?: return@guarded
        friendshipCache.didRejectRequest(userId)
        when (friendRepository.respond(status.requestId, accepted = false)) {
            is NetworkResult.Success -> _feedback.emit(ConnectionFeedback.RequestDeclined)
            is NetworkResult.Failure -> {
                friendshipCache.rollbackReject(userId, status.requestId)
                _feedback.emit(ConnectionFeedback.DeclineFailed)
            }
        }
    }

    fun cancel(userId: String): Job? = guarded(userId) {
        val status = friendshipCache.status(userId) as? FriendshipStatus.PendingSent ?: return@guarded
        val queued = synchronized(lock) { queuedSends[userId] }
        friendshipCache.didCancelRequest(userId)
        if (queued != null && queued.cmid == status.requestId) {
            // Still only a placeholder: nothing reached the gateway yet.
            synchronized(lock) { queuedSends.remove(userId) }
            queued.watch.cancel()
            outboxRepository.discard(queued.cmid)
            _feedback.emit(ConnectionFeedback.RequestCancelled)
            return@guarded
        }
        when (friendRepository.deleteRequest(status.requestId)) {
            is NetworkResult.Success -> _feedback.emit(ConnectionFeedback.RequestCancelled)
            is NetworkResult.Failure -> {
                friendshipCache.didSendRequest(userId, status.requestId)
                _feedback.emit(ConnectionFeedback.CancelFailed)
            }
        }
    }

    private class QueuedSend(val cmid: String, val watch: Job)

    private fun watchOutcome(userId: String, cmid: String): Job =
        scope.launch(start = CoroutineStart.UNDISPATCHED) {
            val outcome = outboxRepository.outcomes.first { it.cmid == cmid }
            synchronized(lock) { if (queuedSends[userId]?.cmid == cmid) queuedSends.remove(userId) }
            if (outcome is OutboxOutcome.Exhausted) {
                if (friendshipCache.status(userId) is FriendshipStatus.PendingSent) {
                    friendshipCache.rollbackSendRequest(userId)
                }
                _feedback.emit(ConnectionFeedback.RequestSendFailed)
            }
        }

    private fun guarded(userId: String, block: suspend () -> Unit): Job? {
        if (userId.isBlank()) return null
        val acquired = synchronized(lock) { inFlight.add(userId) }
        if (!acquired) return null
        return scope.launch {
            try {
                block()
            } finally {
                synchronized(lock) { inFlight.remove(userId) }
            }
        }
    }
}
