package me.meeshy.sdk.friend

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.merge
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.FriendRequestUser
import me.meeshy.sdk.model.friend.ConnectionFeedback
import me.meeshy.sdk.model.friend.FriendshipStatus
import me.meeshy.sdk.outbox.OutboxIds
import me.meeshy.sdk.outbox.OutboxOutcome
import me.meeshy.sdk.outbox.OutboxRepository
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The single entry point for the four connection gestures — connect, accept, reject, cancel —
 * used by Discover, Requests and the contact card (port of the iOS `RequestsViewModel`,
 * `DiscoverViewModel` and `ContactCardViewModel` action halves).
 *
 * Every gesture is accepted by the UI without the network: the [FriendshipCache] flips at
 * once, the roster persisted by [FriendListRepository] follows (an accepted friend appears at
 * its head BEFORE any network return), the mutation is queued in the outbox and the flusher is
 * woken. Delivery happens in FIFO order on the friend lane when the network is back, and a
 * definitive failure restores the previous state and emits the typed failure on [feedback].
 *
 * - **connect** / **cancel** reuse the durable `SEND_FRIEND_REQUEST` path of [ConnectionActionController];
 * - **accept** / **reject** queue a `RESPOND_FRIEND_REQUEST` row keyed by the request id;
 * - **double tap guard**: an action already in flight for the same user id is ignored, and
 *   [busyUserIds] lets the screens disable the matching buttons.
 */
@Singleton
class FriendConnectionCoordinator internal constructor(
    private val friendshipCache: FriendshipCache,
    private val friendRepository: FriendRepository,
    private val friendListRepository: FriendListRepository,
    private val friendRequestListRepository: FriendRequestListRepository,
    private val outboxRepository: OutboxRepository,
    private val flushScheduler: OutboxFlushScheduler,
    private val connectionController: ConnectionActionController,
    private val scope: CoroutineScope,
) {
    @Inject
    constructor(
        friendshipCache: FriendshipCache,
        friendRepository: FriendRepository,
        friendListRepository: FriendListRepository,
        friendRequestListRepository: FriendRequestListRepository,
        outboxRepository: OutboxRepository,
        flushScheduler: OutboxFlushScheduler,
        connectionController: ConnectionActionController,
    ) : this(
        friendshipCache,
        friendRepository,
        friendListRepository,
        friendRequestListRepository,
        outboxRepository,
        flushScheduler,
        connectionController,
        CoroutineScope(SupervisorJob() + Dispatchers.Default),
    )

    private val _busy = MutableStateFlow<Set<String>>(emptySet())
    private val _feedback = MutableSharedFlow<ConnectionFeedback>(extraBufferCapacity = 16)

    /** User ids with an action in flight — disable their buttons. */
    val busyUserIds: StateFlow<Set<String>> = _busy.asStateFlow()

    /** One-shot outcomes (toast + haptic), from every gesture. */
    val feedback: Flow<ConnectionFeedback> = merge(_feedback, connectionController.feedback)

    fun connect(userId: String): Job? = guarded(userId) { connectionController.send(userId)?.join() }

    fun cancel(userId: String): Job? = guarded(userId) { connectionController.cancel(userId)?.join() }

    /**
     * Accepts the request received from [userId]. [profile] is the sender as the screen shows
     * it; without it, the cached received list is asked. The friend is injected at the head of
     * the persisted roster when known.
     */
    fun accept(userId: String, profile: FriendRequestUser? = null): Job? = guarded(userId) {
        respond(userId, accepted = true, profile = profile)
    }

    fun reject(userId: String): Job? = guarded(userId) { respond(userId, accepted = false, profile = null) }

    private suspend fun respond(userId: String, accepted: Boolean, profile: FriendRequestUser?) {
        val status = friendshipCache.status(userId) as? FriendshipStatus.PendingReceived ?: return
        val requestId = status.requestId
        val cmid = OutboxIds.cmid()
        val watch = watchOutcome(cmid, userId, requestId, accepted)
        try {
            if (accepted) {
                friendshipCache.didAcceptRequest(userId)
                injectIntoRoster(userId, requestId, profile)
            } else {
                friendshipCache.didRejectRequest(userId)
            }
            val queued = friendRepository.enqueueRespondFriendRequest(requestId, userId, accepted, cmid)
            if (queued == null) {
                watch.cancel()
                restore(userId, requestId, accepted)
                _feedback.emit(failure(accepted))
                return
            }
            flushScheduler.schedule()
            _feedback.emit(if (accepted) ConnectionFeedback.ConnectionAccepted else ConnectionFeedback.RequestDeclined)
        } catch (e: CancellationException) {
            watch.cancel()
            throw e
        } catch (e: Exception) {
            watch.cancel()
            restore(userId, requestId, accepted)
            _feedback.emit(failure(accepted))
        }
    }

    private suspend fun injectIntoRoster(userId: String, requestId: String, profile: FriendRequestUser?) {
        val friend = profile ?: runCatching {
            friendRequestListRepository.cachedReceived()
                ?.firstOrNull { it.id == requestId || it.senderId == userId }
                ?.sender
        }.getOrNull()
        friend ?: return
        runCatching { friendListRepository.insertAtHead(friend) }
    }

    private suspend fun restore(userId: String, requestId: String, accepted: Boolean) {
        if (accepted) {
            if (friendshipCache.status(userId) is FriendshipStatus.Friend) {
                friendshipCache.rollbackAccept(userId, requestId)
            }
            runCatching { friendListRepository.remove(userId) }
        } else if (friendshipCache.status(userId) is FriendshipStatus.None) {
            friendshipCache.rollbackReject(userId, requestId)
        }
    }

    private fun watchOutcome(cmid: String, userId: String, requestId: String, accepted: Boolean): Job =
        scope.launch(start = CoroutineStart.UNDISPATCHED) {
            val outcome = outboxRepository.outcomes.first { it.cmid == cmid }
            if (outcome is OutboxOutcome.Exhausted) {
                restore(userId, requestId, accepted)
                _feedback.emit(failure(accepted))
            }
        }

    private fun failure(accepted: Boolean): ConnectionFeedback =
        if (accepted) ConnectionFeedback.AcceptFailed else ConnectionFeedback.DeclineFailed

    private fun guarded(userId: String, block: suspend () -> Unit): Job? {
        if (userId.isBlank()) return null
        var acquired = false
        _busy.update { current ->
            acquired = userId !in current
            if (acquired) current + userId else current
        }
        if (!acquired) return null
        return scope.launch {
            try {
                block()
            } finally {
                _busy.update { it - userId }
            }
        }
    }
}
