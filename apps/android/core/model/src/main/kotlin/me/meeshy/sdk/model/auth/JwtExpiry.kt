package me.meeshy.sdk.model.auth

import java.util.Base64
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull

/**
 * Pure decoder for a JWT's expiry, faithful port of iOS
 * `AuthManager.isTokenExpired(_:now:)`
 * (`packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthManager.swift`). Reads the `exp`
 * claim from the (base64url) payload segment and decides expiry against a caller-
 * supplied clock, with a pre-expiry safety margin.
 *
 * Like iOS, **every** malformed input is treated as expired — the safe default that
 * forces a refresh rather than shipping a request behind a token we cannot vouch for:
 * a `null`/blank token, a segment count other than three, an un-decodable payload, a
 * payload that is not a JSON object, an absent `exp`, or an `exp` that is not a JSON
 * number. iOS hard-codes the 30-second margin inline and reads `exp` via
 * `json["exp"] as? TimeInterval` (numeric only); here the margin is a parameter and a
 * stringified `"exp"` is rejected exactly as that cast rejects it.
 *
 * The signature verification and Keychain/DataStore side of validity stays app-side;
 * this object is a stateless building block with no framework or singleton coupling.
 */
object JwtExpiry {

    /** iOS's inline 30-second pre-expiry margin, surfaced as the default. */
    const val DEFAULT_MARGIN_SECONDS: Long = 30L

    private val json = Json { ignoreUnknownKeys = true }

    /**
     * The token's `exp` claim as epoch seconds, or `null` if [token] is absent or
     * malformed in any way (mirrors iOS's "malformed → treat as expired" default,
     * surfaced here as an absent expiry the caller can distinguish).
     */
    fun expiresAtEpochSeconds(token: String?): Double? {
        if (token.isNullOrBlank()) return null
        val parts = token.split(".")
        if (parts.size != 3) return null
        val payload = decodeBase64Url(parts[1]) ?: return null
        val root = runCatching { json.parseToJsonElement(payload) }.getOrNull() as? JsonObject
            ?: return null
        val exp = root["exp"] as? JsonPrimitive ?: return null
        if (exp.isString) return null
        return exp.doubleOrNull
    }

    /**
     * `true` when [token] is expired or unusable at [nowEpochSeconds], applying a
     * [marginSeconds] pre-expiry window (iOS: `exp - 30 < now`, strict `<` — so the
     * exact threshold instant is still considered valid).
     */
    fun isExpired(
        token: String?,
        nowEpochSeconds: Double,
        marginSeconds: Long = DEFAULT_MARGIN_SECONDS,
    ): Boolean {
        val exp = expiresAtEpochSeconds(token) ?: return true
        return exp - marginSeconds < nowEpochSeconds
    }

    private fun decodeBase64Url(segment: String): String? =
        runCatching { String(Base64.getUrlDecoder().decode(segment)) }.getOrNull()
}

/**
 * The pure decisions behind transparent session refresh, ported from iOS
 * `AuthManager.refreshSession(force:)` and `APIClient.requestWithHeaders` /
 * `APIClient.mapUnauthorized`
 * (`packages/MeeshySDK/Sources/MeeshySDK/Networking/APIClient.swift`).
 *
 * Three concerns, all lifted out of iOS's stateful `URLSession` loop into pure,
 * JVM-testable functions so the Android OkHttp interceptor/authenticator that wires
 * them stays a thin caller:
 *  - [shouldRefresh] — the internal `refreshSession(force:)` guard (skip the network
 *    only when not forcing and the token is still valid).
 *  - [isRefreshEligible] / [shouldRefreshBeforeSend] — the call-site gate: the
 *    endpoints that ARE the auth handshake must never trigger a refresh; every other
 *    endpoint refreshes proactively when its bearer token is expired.
 *  - [mapUnauthorized] / [decideOn401] / [classifyRetryStatus] — the reactive 401
 *    branch: distinguish "wrong credentials" (no teardown, no refresh) from a real
 *    session expiry, refresh **once** then replay, and classify the replayed status.
 */
object TokenRefreshPolicy {

    /** iOS `mapUnauthorized`'s inline default when the gateway sends no message. */
    const val DEFAULT_INVALID_CREDENTIALS_MESSAGE: String = "Identifiants invalides"

    /** `true` when a refresh should be attempted for [token] at [nowEpochSeconds]. */
    fun shouldRefresh(
        force: Boolean,
        token: String?,
        nowEpochSeconds: Double,
        marginSeconds: Long = JwtExpiry.DEFAULT_MARGIN_SECONDS,
    ): Boolean =
        force || JwtExpiry.isExpired(token, nowEpochSeconds, marginSeconds)

    /**
     * `false` for the endpoints that ARE the auth handshake — `/auth/refresh`,
     * `/auth/login*`, `/auth/register*`, `/auth/magic-link*` (iOS `isRefreshOrAuth`,
     * inverted into `shouldAttemptRefresh`). Refreshing against these would be
     * nonsensical (there is no live session to renew, or the request itself renews
     * it). Every other endpoint is eligible.
     */
    fun isRefreshEligible(endpoint: String): Boolean {
        val isRefreshOrAuth = endpoint == "/auth/refresh" ||
            endpoint.startsWith("/auth/login") ||
            endpoint.startsWith("/auth/register") ||
            endpoint.startsWith("/auth/magic-link")
        return !isRefreshOrAuth
    }

    /**
     * The proactive call-site gate (iOS `if let token = authToken, shouldAttemptRefresh
     * && isTokenExpired(token)`): refresh before sending only when a bearer [token] is
     * present, the [endpoint] is eligible, and the token is expired at
     * [nowEpochSeconds]. An absent/blank token defers to the request (an anonymous or
     * unauthenticated call), never a refresh.
     */
    fun shouldRefreshBeforeSend(
        endpoint: String,
        token: String?,
        nowEpochSeconds: Double,
        marginSeconds: Long = JwtExpiry.DEFAULT_MARGIN_SECONDS,
    ): Boolean {
        if (token.isNullOrBlank()) return false
        if (!isRefreshEligible(endpoint)) return false
        return JwtExpiry.isExpired(token, nowEpochSeconds, marginSeconds)
    }

    /** How a 401 should be surfaced — iOS `UnauthorizedMapping`. */
    sealed interface UnauthorizedMapping {
        /** Wrong password / 2FA code / stale magic link — NOT a session problem. */
        data class InvalidCredentials(val message: String) : UnauthorizedMapping

        /** A real session expiry — refresh token rejected or a normal endpoint's 401. */
        data object SessionExpired : UnauthorizedMapping
    }

    /**
     * iOS `mapUnauthorized(endpoint:serverMessage:)`: a 401 on `/auth/login*` means the
     * supplied credentials are wrong (there is no session to expire), so it must never
     * tear anything down; anywhere else a 401 is a genuine [UnauthorizedMapping.SessionExpired].
     * A null **or blank** [serverMessage] falls back to [DEFAULT_INVALID_CREDENTIALS_MESSAGE]
     * (iOS only nil-coalesces; the blank guard is a deliberate improvement so an empty
     * gateway body never surfaces as an empty error).
     */
    fun mapUnauthorized(endpoint: String, serverMessage: String?): UnauthorizedMapping {
        if (!endpoint.startsWith("/auth/login")) return UnauthorizedMapping.SessionExpired
        val message = serverMessage?.takeIf { it.isNotBlank() } ?: DEFAULT_INVALID_CREDENTIALS_MESSAGE
        return UnauthorizedMapping.InvalidCredentials(message)
    }

    /** What to do when a request comes back 401 — the reactive branch of the loop. */
    sealed interface Unauthorized401Decision {
        /** Surface wrong credentials; do NOT refresh, do NOT tear the session down. */
        data class InvalidCredentials(val message: String) : Unauthorized401Decision

        /** Refresh the session once, then replay the original request. */
        data object RefreshAndRetry : Unauthorized401Decision

        /** The session is genuinely dead — tear it down and surface session-expired. */
        data object Teardown : Unauthorized401Decision
    }

    /**
     * iOS's 401 handling in `requestWithHeaders`: credentials errors surface as-is; an
     * eligible endpoint that has not yet been retried ([hasRefreshedOn401] false) earns
     * one refresh+replay; otherwise (already retried, or an ineligible/handshake
     * endpoint whose refresh token is itself dead) the session is torn down.
     */
    fun decideOn401(
        endpoint: String,
        serverMessage: String?,
        hasRefreshedOn401: Boolean,
    ): Unauthorized401Decision {
        val mapping = mapUnauthorized(endpoint, serverMessage)
        if (mapping is UnauthorizedMapping.InvalidCredentials) {
            return Unauthorized401Decision.InvalidCredentials(mapping.message)
        }
        return if (isRefreshEligible(endpoint) && !hasRefreshedOn401) {
            Unauthorized401Decision.RefreshAndRetry
        } else {
            Unauthorized401Decision.Teardown
        }
    }

    /** The outcome of the single refresh+replay attempt. */
    sealed interface RetryOutcome {
        /** The replay succeeded (2xx) — return its body. */
        data object Success : RetryOutcome

        /** The replay 401'd again (or the refresh threw) — the session is dead. */
        data object Teardown : RetryOutcome

        /** The replay failed with a non-401 status — a plain server error. */
        data class ServerError(val statusCode: Int) : RetryOutcome
    }

    /** Classifies the replayed response status (iOS's post-refresh `if`/`else` cascade). */
    fun classifyRetryStatus(statusCode: Int): RetryOutcome = when {
        statusCode in 200..299 -> RetryOutcome.Success
        statusCode == 401 -> RetryOutcome.Teardown
        else -> RetryOutcome.ServerError(statusCode)
    }
}
