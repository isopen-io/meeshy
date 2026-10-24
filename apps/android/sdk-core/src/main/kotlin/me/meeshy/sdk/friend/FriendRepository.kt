package me.meeshy.sdk.friend

import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.EmailInvitationRequest
import me.meeshy.sdk.model.EmailInvitationResponse
import me.meeshy.sdk.model.FriendRequest
import me.meeshy.sdk.model.FriendRequestAction
import me.meeshy.sdk.model.FriendRequestActionResult
import me.meeshy.sdk.model.FriendRequestDirection
import me.meeshy.sdk.model.FriendRequestPage
import me.meeshy.sdk.model.RespondFriendRequest
import me.meeshy.sdk.model.SendFriendRequest
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.FriendApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.net.apiCallUnit
import me.meeshy.sdk.net.pagedApiCall
import me.meeshy.sdk.outbox.FriendRequestPayload
import me.meeshy.sdk.outbox.FriendRespondPayload
import me.meeshy.sdk.outbox.OutboxIds
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxMutation
import me.meeshy.sdk.outbox.OutboxRepository
import kotlinx.serialization.encodeToString
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Friend requests and email invitations — port of FriendService (FriendService.swift),
 * on the CANONICAL `/directory/friend-requests` addresses (#4162, #4254).
 *
 * Reads are by CURSOR ([acceptedFriendRequests], [pendingRequests]); the four gestures
 * are one `PATCH … { action }` ([respond], [deleteRequest]). The legacy aliases stay
 * declared on [FriendApi] and are replayed only when a gateway does not serve the
 * canonical route (see [canonicalOrLegacy]).
 */
@Singleton
class FriendRepository @Inject constructor(
    private val friendApi: FriendApi,
    private val outboxRepository: OutboxRepository,
) {
    suspend fun sendFriendRequest(
        receiverId: String,
        message: String? = null,
    ): NetworkResult<FriendRequest> =
        apiCall { friendApi.sendFriendRequest(SendFriendRequest(receiverId, message)) }

    /**
     * Queues a friend-request send durably (ARCHITECTURE.md §5; ADR-006) instead
     * of an online-first REST call a dropped connection would silently lose. This
     * only enqueues; the caller flips the [FriendshipCache] optimistically **after**
     * a non-`null` return, keyed by the returned `cmid` as a placeholder request id,
     * so the shared cache never shows a pending with no durable row behind it. The
     * `OutboxFlushWorker` then delivers the row, grafting the real request id back on
     * success and rolling the pending back on a hard exhaust. The coalescer collapses
     * a repeated send to the same receiver. A blank receiver is inert (returns
     * `null`, nothing queued). Surpasses iOS, whose friend-request send is online-only.
     *
     * @return the queued row's `cmid`, or `null` for a blank receiver.
     */
    suspend fun enqueueSendFriendRequest(
        receiverId: String,
        cmid: String = OutboxIds.cmid(),
        message: String? = null,
    ): String? {
        if (receiverId.isBlank()) return null
        return outboxRepository.enqueue(
            OutboxMutation(
                kind = OutboxKind.SEND_FRIEND_REQUEST,
                lane = OutboxLanes.FRIEND,
                targetId = receiverId,
                payload = MeeshyApi.json.encodeToString(FriendRequestPayload(message)),
                cmid = cmid,
            ),
        )
    }

    /**
     * Queues the answer to a RECEIVED request durably (accept or reject), so the gesture
     * is accepted offline and delivered FIFO on the friend lane at reconnection. Only
     * enqueues: the caller applies the optimistic [FriendshipCache] change. The row is keyed
     * by the request id, so a second answer to the same request supersedes the first.
     *
     * @return the queued row's `cmid`, or `null` for a blank request or user id.
     */
    suspend fun enqueueRespondFriendRequest(
        requestId: String,
        userId: String,
        accepted: Boolean,
        cmid: String = OutboxIds.cmid(),
    ): String? {
        if (requestId.isBlank() || userId.isBlank()) return null
        return outboxRepository.enqueue(
            OutboxMutation(
                kind = OutboxKind.RESPOND_FRIEND_REQUEST,
                lane = OutboxLanes.FRIEND,
                targetId = requestId,
                payload = MeeshyApi.json.encodeToString(
                    FriendRespondPayload(FriendRequestAction.responding(accepted).wire, userId),
                ),
                cmid = cmid,
            ),
        )
    }

    /**
     * Every accepted relation of the current user, in BOTH directions — the source of
     * the friend list. One listing (`direction=any&status=accepted`), read a hundred rows
     * at a time by cursor, up to [FRIENDS_FETCH_CAP].
     *
     * The old pair `received` + `sent` could not do it: `/friend-requests/received`
     * filters `pending` server-side, so an accepted relation where the user was the
     * RECEIVER never came back. A page that fails fails the whole read — a truncated
     * list is never handed out as complete.
     */
    suspend fun acceptedFriendRequests(): NetworkResult<List<FriendRequest>> =
        drainByCursor(cap = FRIENDS_FETCH_CAP) { cursor ->
            readPage(FriendRequestDirection.Any, STATUS_ACCEPTED, cursor, FRIENDS_PAGE_SIZE)
                .map { DrainedPage(it.requests, it.nextCursor, it.hasMore) }
        }

    /**
     * The whole friend graph of [currentUserId], shaped for [FriendshipCache.hydrate]: the
     * accepted relations of [acceptedFriendRequests] split by who sent them, plus every
     * pending request received and sent. The friend list and the friendship cache read
     * this ONE graph, so an accepted relation the user received is a friend in both. Any
     * read that fails fails the graph — a partial graph would erase relations on hydrate.
     */
    suspend fun friendshipGraph(currentUserId: String): NetworkResult<FriendshipPages> {
        val accepted = when (val read = acceptedFriendRequests()) {
            is NetworkResult.Success -> read.data
            is NetworkResult.Failure -> return read
        }
        val received = when (val read = allPending(FriendRequestDirection.Received)) {
            is NetworkResult.Success -> read.data
            is NetworkResult.Failure -> return read
        }
        val sent = when (val read = allPending(FriendRequestDirection.Sent)) {
            is NetworkResult.Success -> read.data
            is NetworkResult.Failure -> return read
        }
        val (acceptedSent, acceptedReceived) = accepted.partition { it.senderId == currentUserId }
        return NetworkResult.Success(FriendshipPages(sent = acceptedSent + sent, received = acceptedReceived + received))
    }

    private suspend fun allPending(direction: FriendRequestDirection): NetworkResult<List<FriendRequest>> =
        drainByCursor(cap = FRIENDS_FETCH_CAP) { cursor ->
            readPage(direction, STATUS_PENDING, cursor, FRIENDS_PAGE_SIZE)
                .map { DrainedPage(it.requests, it.nextCursor, it.hasMore) }
        }

    /**
     * One page of PENDING requests, received or sent, by cursor — the replacement for
     * the offset pagination, whose `offset` skipped rows whenever a request was born
     * during the read (the list is ordered by date DESCENDING, so every insertion shifts
     * the pages that follow). The order the gateway serves is kept: the most recent
     * request stays first. Pass the previous page's [FriendRequestPage.nextCursor] to
     * continue.
     */
    suspend fun pendingRequests(
        direction: FriendRequestDirection,
        cursor: String? = null,
        limit: Int = PENDING_PAGE_SIZE,
    ): NetworkResult<FriendRequestPage> = readPage(direction, STATUS_PENDING, cursor, limit)

    @Suppress("DEPRECATION")
    @Deprecated("Offset pagination skips rows. Use pendingRequests(FriendRequestDirection.Received, cursor).")
    suspend fun receivedRequests(
        offset: Int = 0,
        limit: Int = 20,
    ): NetworkResult<List<FriendRequest>> =
        apiCall { friendApi.receivedRequests(offset, limit) }

    @Suppress("DEPRECATION")
    @Deprecated("Offset pagination skips rows. Use pendingRequests(FriendRequestDirection.Sent, cursor).")
    suspend fun sentRequests(
        offset: Int = 0,
        limit: Int = 20,
    ): NetworkResult<List<FriendRequest>> =
        apiCall { friendApi.sentRequests(offset, limit) }

    /**
     * Accepts or refuses a RECEIVED request: `PATCH /directory/friend-requests/{id}` with
     * `action=accept` / `action=reject`. The legacy `PATCH /friend-requests/{id}`
     * `{ status }` is replayed only against a gateway that does not serve the canonical
     * route.
     */
    @Suppress("DEPRECATION")
    suspend fun respond(requestId: String, accepted: Boolean): NetworkResult<FriendRequest> =
        canonicalOrLegacy(
            canonical = {
                apiCall { friendApi.act(requestId, FriendRequestAction.responding(accepted).body()) }
            },
            legacy = {
                apiCall {
                    friendApi.respond(
                        requestId,
                        RespondFriendRequest(status = if (accepted) STATUS_ACCEPTED else STATUS_REJECTED),
                    )
                }
            },
        )

    /**
     * Withdraws a request from either side — cancelling one the user SENT, or clearing a
     * received one: `PATCH /directory/friend-requests/{id}` with `action=dismiss`, never
     * a `DELETE`.
     *
     * Idempotent: a `404` means the row no longer exists (the other party already acted,
     * or a replay of a queued gesture) — the state wanted is reached, so it is a SUCCESS.
     * Only a gateway that does not serve the route at all is asked through the legacy
     * `DELETE`, whose own `404` is the same success.
     */
    @Suppress("DEPRECATION")
    suspend fun deleteRequest(requestId: String): NetworkResult<Unit> {
        val outcome = canonicalOrLegacy(
            canonical = {
                apiCall {
                    friendApi.actRemoving(requestId, FriendRequestAction.Dismiss.body()).acknowledged()
                }.map { }
            },
            legacy = { apiCallUnit { friendApi.deleteRequest(requestId) } },
        )
        val rowAlreadyGone = outcome is NetworkResult.Failure &&
            outcome.error.httpStatus == HTTP_NOT_FOUND &&
            !outcome.error.isRouteNotServed()
        return if (rowAlreadyGone) NetworkResult.Success(Unit) else outcome
    }

    suspend fun sendEmailInvitation(email: String): NetworkResult<EmailInvitationResponse> =
        apiCall { friendApi.sendEmailInvitation(EmailInvitationRequest(email)) }

    private suspend fun readPage(
        direction: FriendRequestDirection,
        status: String,
        cursor: String?,
        limit: Int,
    ): NetworkResult<FriendRequestPage> =
        pagedApiCall {
            friendApi.friendRequests(
                direction = direction.wire,
                status = status,
                cursor = cursor,
                limit = limit,
            )
        }.map { paged ->
            FriendRequestPage(
                requests = paged.data,
                nextCursor = paged.pagination?.nextCursor?.takeIf { it.isNotBlank() },
                hasMore = paged.pagination?.hasMore == true,
            )
        }

    /**
     * A deletion whose envelope says `success` but carries no receipt is still a
     * success: [apiCall] would call it "Unknown error" and the gesture — already applied
     * server-side — would read as failed.
     */
    private fun ApiResponse<FriendRequestActionResult>.acknowledged(): ApiResponse<FriendRequestActionResult> =
        if (success && data == null) copy(data = FriendRequestActionResult()) else this

    companion object {
        /** Rows asked per page when reading the friend list. */
        const val FRIENDS_PAGE_SIZE: Int = 100

        /**
         * The safety bound of the friend list read — same value as iOS
         * (`ContactsListViewModel.friendsFetchCap`): past it the reader stops instead
         * of following a `hasMore` that would never fall.
         */
        const val FRIENDS_FETCH_CAP: Int = 500

        /** Rows asked per page of the Requests tab. */
        const val PENDING_PAGE_SIZE: Int = 30

        private const val STATUS_ACCEPTED = "accepted"
        private const val STATUS_REJECTED = "rejected"
        private const val STATUS_PENDING = "pending"
        private const val HTTP_NOT_FOUND = 404
    }
}
