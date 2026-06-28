package me.meeshy.app.stories

import me.meeshy.sdk.net.ApiError

/**
 * Decides whether a **synchronous** media upload that just failed is worth
 * durably re-queuing for an automatic later retry, or is a dead end the user must
 * hear about now. This is the composer's product policy — the pivot between
 * "stage it offline and keep going" and "tell the user it can't be attached" — so
 * it lives app-side, not in the stateless SDK.
 *
 * Queueable (a retry of the *same bytes* can succeed once conditions change):
 * - **no HTTP status** — the request never reached a responding server (offline,
 *   DNS, timeout): the canonical offline case.
 * - **429 Too Many Requests** — throttled; the server will accept it later.
 * - **5xx** — a transient server fault.
 *
 * Not queueable (the same bytes will be rejected the same way every time): any
 * other 4xx (e.g. 413 payload too large, 400 malformed, 401 unauthorized).
 */
object MediaUploadRetryPolicy {
    fun isQueueable(error: ApiError): Boolean {
        val status = error.httpStatus ?: return true
        return status == TOO_MANY_REQUESTS || status in SERVER_ERRORS
    }

    private const val TOO_MANY_REQUESTS = 429
    private val SERVER_ERRORS = 500..599
}
