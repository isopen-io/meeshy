package me.meeshy.sdk.friend

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import me.meeshy.sdk.model.FriendRequest
import me.meeshy.sdk.model.FriendRequestUser
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
class FriendshipCache @Inject constructor(
    private val persisted: PersistedFriendCaches = PersistedFriendCaches.None,
) {

    private val lock = Any()
    private val friendIds = mutableSetOf<String>()
    private val sentPending = mutableMapOf<String, String>()
    private val receivedPending = mutableMapOf<String, String>()
    private var hydrated = false

    /** The hydration currently running, shared by every concurrent caller. */
    private var inflight: CompletableDeferred<Unit>? = null

    /** Bumped on each claim, authoritative write and [clear]; only the current owner may apply. */
    private var generation = 0L

    private val _version = MutableStateFlow(0)

    /** Monotonic counter bumped on every mutation; drives reactive recomputation. */
    val version: StateFlow<Int> = _version.asStateFlow()

    val isHydrated: Boolean get() = synchronized(lock) { hydrated }

    val friendCount: Int get() = synchronized(lock) { friendIds.size }

    /**
     * A defensive snapshot of the accepted-friend id set — the read model a
     * Contacts list reconciles against (port of the iOS `FriendshipCache.friendIds`).
     * Copied under the lock so callers can iterate it without racing a mutation.
     */
    val currentFriendIds: Set<String> get() = synchronized(lock) { friendIds.toSet() }

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
            generation++
        }
        bumpVersion()
    }

    /**
     * Coalesced hydration (port of the iOS `hydrate(friendService:seedSource:)`): the launch
     * trigger and the auth-change trigger can fire together, and two hydrations replacing the
     * graph under each other is what crashed iOS on warm start. Concurrent callers share ONE
     * run; a caller arriving once the graph is hydrated returns at once.
     *
     * The owner first applies [seed] (the persisted Room rosters) so the friendship button is
     * right before the paginated fetch answers, then [fetch] and replaces the graph with it. A
     * result is applied only while its generation is still the current one, so a [clear]
     * (logout) or an authoritative [hydrate] landing meanwhile is never overwritten by a
     * stale response. A `null` fetch (offline, failure) leaves the seeded graph untouched.
     */
    suspend fun hydrateCoalesced(
        seed: suspend () -> FriendshipSeed? = { persisted.seed() },
        fetch: suspend () -> FriendshipPages?,
    ) {
        val claim = claimHydration() ?: return
        if (!claim.isOwner) {
            claim.done.await()
            return
        }
        try {
            runCatchingNonCancellation { seed() }?.let { applySeed(claim.generation, it) }
            runCatchingNonCancellation { fetch() }?.let { applyFetched(claim.generation, it) }
        } finally {
            synchronized(lock) { if (inflight === claim.done) inflight = null }
            claim.done.complete(Unit)
        }
    }

    private class Claim(val done: CompletableDeferred<Unit>, val generation: Long, val isOwner: Boolean)

    private fun claimHydration(): Claim? = synchronized(lock) {
        if (hydrated) return@synchronized null
        inflight?.let { return@synchronized Claim(it, generation, isOwner = false) }
        generation++
        val done = CompletableDeferred<Unit>()
        inflight = done
        Claim(done, generation, isOwner = true)
    }

    private fun applySeed(owner: Long, seed: FriendshipSeed) {
        val applied = synchronized(lock) {
            val empty = friendIds.isEmpty() && sentPending.isEmpty() && receivedPending.isEmpty()
            if (owner != generation || !empty) return@synchronized false
            seed.friends.forEach { friendIds.add(it.id) }
            absorb(seed.sent, seed.received)
            true
        }
        if (applied) bumpVersion()
    }

    private fun applyFetched(owner: Long, pages: FriendshipPages) {
        val applied = synchronized(lock) {
            if (owner != generation) return@synchronized false
            friendIds.clear()
            sentPending.clear()
            receivedPending.clear()
            absorb(pages.sent, pages.received)
            hydrated = true
            true
        }
        if (applied) bumpVersion()
    }

    /** Drops the persisted rosters' freshness so the next load round-trips the gateway. */
    suspend fun invalidatePersistedFriendCaches() = persisted.invalidate()

    private inline fun <T> runCatchingNonCancellation(block: () -> T): T? = try {
        block()
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (ignored: Exception) {
        null
    }

    private fun absorb(sent: List<FriendRequest>, received: List<FriendRequest>) {
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
            generation++
            inflight = null
        }
        bumpVersion()
    }

    private fun bumpVersion() {
        _version.update { it + 1 }
    }
}

/** Pages drained from the gateway, ready to replace the graph. */
data class FriendshipPages(val sent: List<FriendRequest>, val received: List<FriendRequest>)

/** The persisted rosters (Room) served before the network answers, never marking the graph hydrated. */
data class FriendshipSeed(
    val friends: List<FriendRequestUser>,
    val received: List<FriendRequest>,
    val sent: List<FriendRequest>,
)

/** Expires the persisted friend rosters after a mutation so the next load revalidates. */
interface PersistedFriendCaches {
    suspend fun invalidate()

    suspend fun seed(): FriendshipSeed?

    object None : PersistedFriendCaches {
        override suspend fun seed(): FriendshipSeed? = null

        override suspend fun invalidate() = Unit
    }
}
