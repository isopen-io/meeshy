package me.meeshy.sdk.model.auth

import com.google.common.truth.Truth.assertThat
import java.util.Base64
import org.junit.Test

/**
 * Behavioural spec for the pure JWT-expiry core ([JwtExpiry]) and the refresh
 * decision ([TokenRefreshPolicy]) backing session validity on Android.
 *
 * Parity source: iOS `AuthManager.isTokenExpired(_:now:)` and the guard inside
 * `AuthManager.refreshSession(force:)`
 * (`packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthManager.swift`). iOS decodes the
 * JWT payload inline to read the `exp` claim and treats **every** malformed input
 * (nil, wrong segment count, un-decodable base64, non-object / non-JSON payload,
 * missing or non-numeric `exp`) as expired — the safe default that forces a refresh.
 * `refreshSession` then skips the network round-trip only when `!force` **and** the
 * token is not expired.
 *
 * SOTA note over iOS: the margin is a **parameter** (iOS hard-codes 30s inline), and
 * `exp` is read as a JSON **number only** — a stringified `"exp"` is rejected exactly
 * as iOS's `as? TimeInterval` cast rejects it, so a malformed claim can never be
 * silently coerced into a live expiry.
 *
 * Every assertion is on observable behaviour through the public API. Tokens are built
 * by really base64url-encoding a known payload, so the decoder is exercised for real;
 * expectations are hand-written literals independent of the production derivation.
 */
class JwtExpiryTest {

    private companion object {
        /** Builds a `header.payload.signature` token whose payload is [payloadJson]. */
        fun tokenWithPayload(payloadJson: String): String {
            val enc = Base64.getUrlEncoder().withoutPadding()
            val header = enc.encodeToString("""{"alg":"HS256","typ":"JWT"}""".toByteArray())
            val payload = enc.encodeToString(payloadJson.toByteArray())
            return "$header.$payload.signature-ignored"
        }

        /** A token that expires at [exp] epoch seconds. */
        fun tokenExpiringAt(exp: Number): String = tokenWithPayload("""{"sub":"u1","exp":$exp}""")
    }

    // --- expiresAtEpochSeconds: successful decode ---

    @Test
    fun expiresAt_readsTheExpClaimFromAWellFormedToken() {
        assertThat(JwtExpiry.expiresAtEpochSeconds(tokenExpiringAt(1_700_000_000L)))
            .isEqualTo(1_700_000_000.0)
    }

    @Test
    fun expiresAt_readsAFractionalExpClaim() {
        assertThat(JwtExpiry.expiresAtEpochSeconds(tokenExpiringAt(1000.5)))
            .isEqualTo(1000.5)
    }

    // --- expiresAtEpochSeconds: every malformed branch → null ---

    @Test
    fun expiresAt_isNullForANullToken() {
        assertThat(JwtExpiry.expiresAtEpochSeconds(null)).isNull()
    }

    @Test
    fun expiresAt_isNullForABlankToken() {
        assertThat(JwtExpiry.expiresAtEpochSeconds("")).isNull()
        assertThat(JwtExpiry.expiresAtEpochSeconds("   ")).isNull()
    }

    @Test
    fun expiresAt_isNullWhenSegmentCountIsNotThree() {
        assertThat(JwtExpiry.expiresAtEpochSeconds("only-one-part")).isNull()
        assertThat(JwtExpiry.expiresAtEpochSeconds("two.parts")).isNull()
        assertThat(JwtExpiry.expiresAtEpochSeconds("a.b.c.d")).isNull()
    }

    @Test
    fun expiresAt_isNullWhenPayloadIsNotDecodableBase64() {
        assertThat(JwtExpiry.expiresAtEpochSeconds("header.@@not-base64@@.sig")).isNull()
    }

    @Test
    fun expiresAt_isNullWhenPayloadIsNotJson() {
        val enc = Base64.getUrlEncoder().withoutPadding()
        val garbage = enc.encodeToString("this is not json".toByteArray())
        assertThat(JwtExpiry.expiresAtEpochSeconds("header.$garbage.sig")).isNull()
    }

    @Test
    fun expiresAt_isNullWhenPayloadIsJsonButNotAnObject() {
        val enc = Base64.getUrlEncoder().withoutPadding()
        val jsonArray = enc.encodeToString("[1,2,3]".toByteArray())
        assertThat(JwtExpiry.expiresAtEpochSeconds("header.$jsonArray.sig")).isNull()
    }

    @Test
    fun expiresAt_isNullWhenExpClaimIsAbsent() {
        assertThat(JwtExpiry.expiresAtEpochSeconds(tokenWithPayload("""{"sub":"u1"}"""))).isNull()
    }

    @Test
    fun expiresAt_isNullWhenExpClaimIsAJsonStringNotANumber() {
        assertThat(JwtExpiry.expiresAtEpochSeconds(tokenWithPayload("""{"exp":"1700000000"}""")))
            .isNull()
    }

    // --- isExpired: default 30s margin boundary (iOS: exp - 30 < now) ---

    @Test
    fun isExpired_isFalseWellBeforeTheMarginWindow() {
        // threshold = exp - 30 = 970; now 969 < 970 → not expired
        assertThat(JwtExpiry.isExpired(tokenExpiringAt(1000L), nowEpochSeconds = 969.0)).isFalse()
    }

    @Test
    fun isExpired_isFalseExactlyAtTheMarginThreshold() {
        // now == exp - 30 == 970; iOS uses strict `<`, so equality is still valid
        assertThat(JwtExpiry.isExpired(tokenExpiringAt(1000L), nowEpochSeconds = 970.0)).isFalse()
    }

    @Test
    fun isExpired_isTrueOneSecondPastTheMarginThreshold() {
        // now 971 > 970 → within the 30s pre-expiry margin → expired
        assertThat(JwtExpiry.isExpired(tokenExpiringAt(1000L), nowEpochSeconds = 971.0)).isTrue()
    }

    @Test
    fun isExpired_isTrueExactlyAtTheRawExpiry() {
        assertThat(JwtExpiry.isExpired(tokenExpiringAt(1000L), nowEpochSeconds = 1000.0)).isTrue()
    }

    @Test
    fun isExpired_isTrueLongAfterExpiry() {
        assertThat(JwtExpiry.isExpired(tokenExpiringAt(1000L), nowEpochSeconds = 5000.0)).isTrue()
    }

    // --- isExpired: malformed tokens are always expired (safe default) ---

    @Test
    fun isExpired_isTrueForANullToken() {
        assertThat(JwtExpiry.isExpired(null, nowEpochSeconds = 0.0)).isTrue()
    }

    @Test
    fun isExpired_isTrueForAStructurallyInvalidToken() {
        assertThat(JwtExpiry.isExpired("garbage", nowEpochSeconds = 0.0)).isTrue()
    }

    @Test
    fun isExpired_isTrueWhenExpClaimIsMissing() {
        val token = tokenWithPayload("""{"sub":"u1"}""")
        assertThat(JwtExpiry.isExpired(token, nowEpochSeconds = 0.0)).isTrue()
    }

    // --- isExpired: configurable margin ---

    @Test
    fun isExpired_withZeroMargin_isFalseRightUpToRawExpiry() {
        // margin 0 → expired iff exp < now; at now == exp it is still valid (strict `<`)
        assertThat(JwtExpiry.isExpired(tokenExpiringAt(1000L), nowEpochSeconds = 1000.0, marginSeconds = 0))
            .isFalse()
        assertThat(JwtExpiry.isExpired(tokenExpiringAt(1000L), nowEpochSeconds = 1000.5, marginSeconds = 0))
            .isTrue()
    }

    @Test
    fun isExpired_withLargerMargin_expiresEarlier() {
        // margin 120 → threshold = 880; now 900 > 880 → expired even though raw exp is 1000
        assertThat(JwtExpiry.isExpired(tokenExpiringAt(1000L), nowEpochSeconds = 900.0, marginSeconds = 120))
            .isTrue()
        assertThat(JwtExpiry.isExpired(tokenExpiringAt(1000L), nowEpochSeconds = 800.0, marginSeconds = 120))
            .isFalse()
    }

    // --- TokenRefreshPolicy.shouldRefresh (iOS refreshSession guard) ---

    @Test
    fun shouldRefresh_isFalseForAFreshTokenWhenNotForced() {
        assertThat(
            TokenRefreshPolicy.shouldRefresh(
                force = false,
                token = tokenExpiringAt(1000L),
                nowEpochSeconds = 500.0,
            )
        ).isFalse()
    }

    @Test
    fun shouldRefresh_isTrueForAnExpiredTokenWhenNotForced() {
        assertThat(
            TokenRefreshPolicy.shouldRefresh(
                force = false,
                token = tokenExpiringAt(1000L),
                nowEpochSeconds = 5000.0,
            )
        ).isTrue()
    }

    @Test
    fun shouldRefresh_isTrueForANullTokenWhenNotForced() {
        assertThat(
            TokenRefreshPolicy.shouldRefresh(force = false, token = null, nowEpochSeconds = 0.0)
        ).isTrue()
    }

    @Test
    fun shouldRefresh_isTrueWhenForcedEvenForAFreshToken() {
        assertThat(
            TokenRefreshPolicy.shouldRefresh(
                force = true,
                token = tokenExpiringAt(1000L),
                nowEpochSeconds = 500.0,
            )
        ).isTrue()
    }
}
