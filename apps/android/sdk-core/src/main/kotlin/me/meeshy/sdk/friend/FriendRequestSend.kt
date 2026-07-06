package me.meeshy.sdk.friend

import me.meeshy.sdk.model.FriendRequest
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult

/**
 * The delivery-outcome vocabulary for a durably-queued friend-request send.
 * Keeps the drainer's `SendResult` decision and the optimistic-cache write-back
 * in one pure, total classification (see [FriendRequestSend]).
 */
public sealed interface FriendRequestDelivery {

    /** The gateway minted a real request id — graft it over the placeholder. */
    public data class Delivered(val requestId: String) : FriendRequestDelivery

    /**
     * The request already exists server-side (a 409, or a success with no usable
     * id). Idempotent success: the optimistic pending state is already correct,
     * so the row is dropped without a retry and the placeholder simply stands
     * until the next authoritative hydrate reconciles it.
     */
    public data object AlreadyExists : FriendRequestDelivery

    /** A retryable failure — network down, 5xx, timeout. */
    public data object Retry : FriendRequestDelivery

    /** A non-retryable failure (invalid receiver, blocked) — roll the pending back. */
    public data class Rejected(val reason: String) : FriendRequestDelivery
}

/**
 * Classifies a friend-request send's network outcome into a durable-delivery
 * decision, the Android analogue of collecting the iOS `FriendService` send
 * error handling into one total function. Faithful to the gateway contract
 * (`services/gateway/src/routes/friends.ts`): a `409` is the "already exists"
 * conflict, other 4xx are permanent client errors, everything else is transient.
 *
 * Note the deliberate override of the outbox's drainer-level "404-as-success"
 * default (ARCHITECTURE.md §5) — that rule is for **idempotent deletes** (a 404
 * means already-gone). A `SEND` is not idempotent: a 404 here is "receiver not
 * found", a permanent rejection whose optimistic pending must be rolled back,
 * never a success that would strand a pending toward a non-existent user.
 */
public object FriendRequestSend {

    private val PERMANENT_STATUSES = setOf(400, 403, 404, 422)

    public fun classify(result: NetworkResult<FriendRequest>): FriendRequestDelivery =
        when (result) {
            is NetworkResult.Success ->
                if (result.data.id.isBlank()) {
                    FriendRequestDelivery.AlreadyExists
                } else {
                    FriendRequestDelivery.Delivered(result.data.id)
                }
            is NetworkResult.Failure -> classifyFailure(result.error)
        }

    private fun classifyFailure(error: ApiError): FriendRequestDelivery = when {
        error.httpStatus == CONFLICT -> FriendRequestDelivery.AlreadyExists
        error.httpStatus in PERMANENT_STATUSES -> FriendRequestDelivery.Rejected(error.message)
        else -> FriendRequestDelivery.Retry
    }

    private const val CONFLICT = 409
}
