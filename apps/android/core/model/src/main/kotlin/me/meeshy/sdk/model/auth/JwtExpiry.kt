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
 * The refresh decision behind iOS `AuthManager.refreshSession(force:)`'s guard: the
 * network round-trip is skipped only when the caller is not forcing a refresh **and**
 * the current token is still valid. Any expired/unusable token, or an explicit
 * `force`, warrants a refresh.
 */
object TokenRefreshPolicy {

    /** `true` when a refresh should be attempted for [token] at [nowEpochSeconds]. */
    fun shouldRefresh(
        force: Boolean,
        token: String?,
        nowEpochSeconds: Double,
        marginSeconds: Long = JwtExpiry.DEFAULT_MARGIN_SECONDS,
    ): Boolean =
        force || JwtExpiry.isExpired(token, nowEpochSeconds, marginSeconds)
}
