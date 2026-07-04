package me.meeshy.sdk.friend

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import me.meeshy.sdk.model.FriendRequest
import me.meeshy.sdk.model.friend.FriendshipStatus
import javax.inject.Inject
import javax.inject.Singleton

/**
 * In-memory single source of truth for the current user's friend graph, so
 * every profile-rendering surface resolves the same [FriendshipStatus] without
 * re-querying the gateway. Port of the iOS `FriendshipCache`.
 *
 * Three disjoint stores back it:
 * - accepted [friendIds];
 * - [sentPending] (`receiverId -> requestId`) — requests the current user sent;
 * - [receivedPending] (`senderId -> requestId`) — requests the current user got.
 *
 * All reads and mutations are `synchronized` because socket frames, optimistic
 * UI actions and hydration land on different threads. Every mutation bumps
 * [version] so reactive consumers (`StateFlow`) recompute — the Android analogue
 * of the iOS `@Published version`.
 */
@Singleton
class FriendshipCache @Inject constructor() {

    private val lock = Any()
    private val friendIds = mutableSetOf<String>()
    private val sentPending = mutableMapOf<String, String>()
    private val receivedPending = mutableMapOf<String, String>()
    private var hydrated = false

    private val _version = MutableStateFlow(0)

    /** Monotonic counter bumped on every mutation; drives reactive recomputation. */
    val version: StateFlow<Int> = _version.asStateFlow()

    val isHydrated: Boolean get() = synchronized(lock) { hydrated }

    val friendCount: Int get() = synchronized(lock) { friendIds.size }

    val pendingReceivedCount: Int get() = synchronized(lock) { receivedPending.size }

    // MARK: - Lookup

    fun status(userId: String): FriendshipStatus = synchronized(lock) {
        when {
            friendIds.contains(userId) -> FriendshipStatus.Friend
            sentPending.containsKey(userId) -> FriendshipStatus.PendingSent(sentPending.getValue(userId))
            receivedPending.containsKey(userId) ->
                FriendshipStatus.PendingReceived(receivedPending.getValue(userId))
            else -> FriendshipStatus.None
        }
    }

    fun isFriend(userId: String): Boolean = synchronized(lock) { friendIds.contains(userId) }

    // MARK: - Hydrate (call once after login / on a requests refresh)

    /**
     * Rebuild the whole graph from the authoritative sent/received request
     * lists. `accepted` rows become friends; `pending` rows become directional
     * pending entries; any other status (rejected/cancelled) is dropped. Fully
     * replaces prior state so a stale entry can never survive a refresh.
     */
    fun hydrate(sent: List<FriendRequest>, received: List<FriendRequest>) {
        synchronized(lock) {
            friendIds.clear()
            sentPending.clear()
            receivedPending.clear()
            for (request in sent) {
                when (request.status) {
                    "accepted" -> if (request.receiverId.isNotBlank()) friendIds.add(request.receiverId)
                    "pending" -> if (request.receiverId.isNotBlank()) sentPending[request.receiverId] = request.id
                }
            }
            for (request in received) {
                when (request.status) {
                    "accepted" -> if (request.senderId.isNotBlank()) friendIds.add(request.senderId)
                    "pending" -> if (request.senderId.isNotBlank()) receivedPending[request.senderId] = request.id
                }
            }
            hydrated = true
        }
        bumpVersion()
    }

    // MARK: - Mutations (optimistic updates)

    fun didSendRequest(receiverId: String, requestId: String) {
        synchronized(lock) { sentPending[receiverId] = requestId }
        bumpVersion()
    }

    fun didCancelRequest(receiverId: String) {
        synchronized(lock) { sentPending.remove(receiverId) }
        bumpVersion()
    }

    fun didAcceptRequest(senderId: String) {
        synchronized(lock) {
            receivedPending.remove(senderId)
            friendIds.add(senderId)
        }
        bumpVersion()
    }

    fun didRejectRequest(senderId: String) {
        synchronized(lock) { receivedPending.remove(senderId) }
        bumpVersion()
    }

    fun didReceiveRequest(senderId: String, requestId: String) {
        synchronized(lock) { receivedPending[senderId] = requestId }
        bumpVersion()
    }

    /** Sever an accepted friendship so the resolver returns [FriendshipStatus.None]. */
    fun didRemoveFriend(userId: String) {
        synchronized(lock) { friendIds.remove(userId) }
        bumpVersion()
    }

    // MARK: - Rollback (undo a failed optimistic mutation)

    fun rollbackSendRequest(receiverId: String) {
        synchronized(lock) { sentPending.remove(receiverId) }
        bumpVersion()
    }

    fun rollbackAccept(senderId: String, requestId: String) {
        synchronized(lock) {
            friendIds.remove(senderId)
            receivedPending[senderId] = requestId
        }
        bumpVersion()
    }

    fun rollbackReject(senderId: String, requestId: String) {
        synchronized(lock) { receivedPending[senderId] = requestId }
        bumpVersion()
    }

    // MARK: - Clear (logout)

    fun clear() {
        synchronized(lock) {
            friendIds.clear()
            sentPending.clear()
            receivedPending.clear()
            hydrated = false
        }
        bumpVersion()
    }

    private fun bumpVersion() {
        _version.value += 1
    }
}
