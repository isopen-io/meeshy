package me.meeshy.sdk.friend

import me.meeshy.sdk.model.FriendRequest
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult

/** Delivery-outcome vocabulary for a durably-queued accept / reject (see [FriendRequestResponse]). */
public sealed interface FriendRequestResponseDelivery {

    /** The gateway applied the answer. */
    public data object Delivered : FriendRequestResponseDelivery

    /** The request no longer exists (cancelled by the sender, already answered): drop the row, realign the cache. */
    public data object Gone : FriendRequestResponseDelivery

    /** A retryable failure — network down, 5xx, timeout, throttling. */
    public data object Retry : FriendRequestResponseDelivery

    /** A non-retryable failure — roll the optimistic answer back. */
    public data class Rejected(val reason: String) : FriendRequestResponseDelivery
}

/**
 * Classifies the outcome of answering a friend request. Unlike a send, a `404` here means
 * the request is gone, which is never worth a retry: the row is abandoned and the cache is
 * re-aligned (the sender withdrew, or another device answered first).
 */
public object FriendRequestResponse {

    private val PERMANENT_STATUSES = setOf(400, 403, 409, 422)

    public fun classify(result: NetworkResult<FriendRequest>): FriendRequestResponseDelivery =
        when (result) {
            is NetworkResult.Success -> FriendRequestResponseDelivery.Delivered
            is NetworkResult.Failure -> classifyFailure(result.error)
        }

    private fun classifyFailure(error: ApiError): FriendRequestResponseDelivery = when (error.httpStatus) {
        NOT_FOUND -> FriendRequestResponseDelivery.Gone
        in PERMANENT_STATUSES -> FriendRequestResponseDelivery.Rejected(error.message)
        else -> FriendRequestResponseDelivery.Retry
    }

    private const val NOT_FOUND = 404
}
