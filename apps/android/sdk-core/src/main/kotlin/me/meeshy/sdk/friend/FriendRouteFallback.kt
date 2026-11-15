package me.meeshy.sdk.friend

import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult

/**
 * True when a `404` means "this gateway does not serve that ROUTE", as opposed to "the
 * row you named does not exist".
 *
 * The two are not the same fact and the fallback to the legacy address must only follow
 * the first: the canonical handlers answer a missing request with their OWN message
 * (`Demande d'ami non trouvee`, `User is not in your blocked list`), whereas a router that
 * does not know the path (Fastify, or a proxy in front of it) answers the generic
 * `Not Found`. Falling back on every 404 would replay each already-handled request on the
 * deprecated alias — and the alias is retired only when the gateway counts zero Android
 * calls on it (#4275), so a needless fallback postpones that retirement.
 */
internal fun ApiError.isRouteNotServed(): Boolean =
    httpStatus == 404 && message.trim().equals(ROUTER_NOT_FOUND, ignoreCase = true)

/**
 * Runs the canonical call and, only when the gateway does not serve its route, replays
 * the legacy one — the backward-compatible window of a route migration (a new client
 * against an older gateway keeps working).
 */
internal suspend fun <T> canonicalOrLegacy(
    canonical: suspend () -> NetworkResult<T>,
    legacy: suspend () -> NetworkResult<T>,
): NetworkResult<T> {
    val first = canonical()
    return if (first is NetworkResult.Failure && first.error.isRouteNotServed()) legacy() else first
}

private const val ROUTER_NOT_FOUND = "Not Found"
