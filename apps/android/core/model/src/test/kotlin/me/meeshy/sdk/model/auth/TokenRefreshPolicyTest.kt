package me.meeshy.sdk.model.auth

import com.google.common.truth.Truth.assertThat
import java.util.Base64
import org.junit.Test

/**
 * Behavioural spec for the endpoint-aware, reactive side of [TokenRefreshPolicy]:
 * the call-site gate that decides whether a request may ever trigger a token
 * refresh, the 401 credential-vs-session mapping, the "refresh once and replay"
 * decision on a 401, and the classification of the replayed response.
 *
 * Parity source: iOS `APIClient.requestWithHeaders` and `APIClient.mapUnauthorized`
 * (`packages/MeeshySDK/Sources/MeeshySDK/Networking/APIClient.swift`):
 *  - `isRefreshOrAuth` / `shouldAttemptRefresh` — the endpoints that ARE the auth
 *    handshake (`/auth/refresh`, `/auth/login*`, `/auth/register*`,
 *    `/auth/magic-link*`) must never refresh; everything else may.
 *  - the proactive guard `if let token, shouldAttemptRefresh && isTokenExpired(token)`.
 *  - `mapUnauthorized(endpoint:serverMessage:)` — a 401 on `/auth/login*` means
 *    "wrong credentials" (no teardown, no refresh); anywhere else it is a real
 *    `.sessionExpired`.
 *  - the reactive 401 branch: refresh **once** (`hasRefreshedOn401`) then replay;
 *    a replay that is 2xx succeeds, a replay that 401s (or a refresh that throws)
 *    tears the session down, any other replay status is a plain server error.
 *
 * SOTA note over iOS: iOS inlines the whole decision tree inside a stateful
 * `URLSession` loop, so none of it is unit-testable without driving real HTTP.
 * Android lifts every branch into pure functions returning sealed decisions, so the
 * OkHttp interceptor/authenticator that wires them stays a thin caller. The invalid-
 * credentials message additionally falls back on a **blank** server message (iOS only
 * nil-coalesces), so an empty gateway body can never surface as an empty error.
 *
 * Every assertion is on observable behaviour through the public API; expectations are
 * hand-written literals, never echoes of the production derivation.
 */
class TokenRefreshPolicyTest {

    private companion object {
        fun tokenWithPayload(payloadJson: String): String {
            val enc = Base64.getUrlEncoder().withoutPadding()
            val header = enc.encodeToString("""{"alg":"HS256","typ":"JWT"}""".toByteArray())
            val payload = enc.encodeToString(payloadJson.toByteArray())
            return "$header.$payload.sig"
        }

        fun tokenExpiringAt(exp: Number): String = tokenWithPayload("""{"sub":"u1","exp":$exp}""")
    }

    // --- isRefreshEligible: the handshake endpoints are opted out ---

    @Test
    fun eligible_regularEndpoint_isRefreshEligible() {
        assertThat(TokenRefreshPolicy.isRefreshEligible("/conversations")).isTrue()
    }

    @Test
    fun eligible_authRefresh_isNotEligible() {
        assertThat(TokenRefreshPolicy.isRefreshEligible("/auth/refresh")).isFalse()
    }

    @Test
    fun eligible_login_isNotEligible() {
        assertThat(TokenRefreshPolicy.isRefreshEligible("/auth/login")).isFalse()
    }

    @Test
    fun eligible_login2fa_isNotEligible() {
        assertThat(TokenRefreshPolicy.isRefreshEligible("/auth/login/2fa")).isFalse()
    }

    @Test
    fun eligible_register_isNotEligible() {
        assertThat(TokenRefreshPolicy.isRefreshEligible("/auth/register")).isFalse()
    }

    @Test
    fun eligible_magicLink_isNotEligible() {
        assertThat(TokenRefreshPolicy.isRefreshEligible("/auth/magic-link/consume")).isFalse()
    }

    @Test
    fun eligible_endpointMerelyContainingAuth_isStillEligible() {
        assertThat(TokenRefreshPolicy.isRefreshEligible("/users/auth-history")).isTrue()
    }

    // --- shouldRefreshBeforeSend: proactive call-site gate ---

    @Test
    fun beforeSend_expiredTokenOnRegularEndpoint_refreshes() {
        assertThat(
            TokenRefreshPolicy.shouldRefreshBeforeSend(
                endpoint = "/conversations",
                token = tokenExpiringAt(1_000L),
                nowEpochSeconds = 2_000.0,
            ),
        ).isTrue()
    }

    @Test
    fun beforeSend_validTokenOnRegularEndpoint_doesNotRefresh() {
        assertThat(
            TokenRefreshPolicy.shouldRefreshBeforeSend(
                endpoint = "/conversations",
                token = tokenExpiringAt(9_999_999_999L),
                nowEpochSeconds = 2_000.0,
            ),
        ).isFalse()
    }

    @Test
    fun beforeSend_absentToken_doesNotRefresh() {
        assertThat(
            TokenRefreshPolicy.shouldRefreshBeforeSend(
                endpoint = "/conversations",
                token = null,
                nowEpochSeconds = 2_000.0,
            ),
        ).isFalse()
    }

    @Test
    fun beforeSend_blankToken_doesNotRefresh() {
        assertThat(
            TokenRefreshPolicy.shouldRefreshBeforeSend(
                endpoint = "/conversations",
                token = "   ",
                nowEpochSeconds = 2_000.0,
            ),
        ).isFalse()
    }

    @Test
    fun beforeSend_expiredTokenButHandshakeEndpoint_doesNotRefresh() {
        assertThat(
            TokenRefreshPolicy.shouldRefreshBeforeSend(
                endpoint = "/auth/refresh",
                token = tokenExpiringAt(1_000L),
                nowEpochSeconds = 2_000.0,
            ),
        ).isFalse()
    }

    @Test
    fun beforeSend_marginPushesAValidTokenOverTheEdge() {
        assertThat(
            TokenRefreshPolicy.shouldRefreshBeforeSend(
                endpoint = "/conversations",
                token = tokenExpiringAt(2_020L),
                nowEpochSeconds = 2_000.0,
                marginSeconds = 30L,
            ),
        ).isTrue()
    }

    // --- mapUnauthorized: credential vs session ---

    @Test
    fun map_loginWithMessage_isInvalidCredentialsCarryingTheMessage() {
        assertThat(TokenRefreshPolicy.mapUnauthorized("/auth/login", "Mot de passe incorrect"))
            .isEqualTo(TokenRefreshPolicy.UnauthorizedMapping.InvalidCredentials("Mot de passe incorrect"))
    }

    @Test
    fun map_login2fa_isInvalidCredentials() {
        assertThat(TokenRefreshPolicy.mapUnauthorized("/auth/login/2fa", "Code invalide"))
            .isEqualTo(TokenRefreshPolicy.UnauthorizedMapping.InvalidCredentials("Code invalide"))
    }

    @Test
    fun map_loginWithNullMessage_fallsBackToDefault() {
        assertThat(TokenRefreshPolicy.mapUnauthorized("/auth/login", null))
            .isEqualTo(
                TokenRefreshPolicy.UnauthorizedMapping.InvalidCredentials(
                    TokenRefreshPolicy.DEFAULT_INVALID_CREDENTIALS_MESSAGE,
                ),
            )
    }

    @Test
    fun map_loginWithBlankMessage_fallsBackToDefault() {
        assertThat(TokenRefreshPolicy.mapUnauthorized("/auth/login", "   "))
            .isEqualTo(
                TokenRefreshPolicy.UnauthorizedMapping.InvalidCredentials(
                    TokenRefreshPolicy.DEFAULT_INVALID_CREDENTIALS_MESSAGE,
                ),
            )
    }

    @Test
    fun map_refresh_isSessionExpired() {
        assertThat(TokenRefreshPolicy.mapUnauthorized("/auth/refresh", "whatever"))
            .isEqualTo(TokenRefreshPolicy.UnauthorizedMapping.SessionExpired)
    }

    @Test
    fun map_regularEndpoint_isSessionExpired() {
        assertThat(TokenRefreshPolicy.mapUnauthorized("/conversations", null))
            .isEqualTo(TokenRefreshPolicy.UnauthorizedMapping.SessionExpired)
    }

    // --- decideOn401: the reactive branch ---

    @Test
    fun on401_login_surfacesInvalidCredentialsNoTeardown() {
        assertThat(
            TokenRefreshPolicy.decideOn401(
                endpoint = "/auth/login",
                serverMessage = "Identifiants invalides",
                hasRefreshedOn401 = false,
            ),
        ).isEqualTo(
            TokenRefreshPolicy.Unauthorized401Decision.InvalidCredentials("Identifiants invalides"),
        )
    }

    @Test
    fun on401_regularEndpointFirstTime_refreshesAndRetries() {
        assertThat(
            TokenRefreshPolicy.decideOn401(
                endpoint = "/conversations",
                serverMessage = null,
                hasRefreshedOn401 = false,
            ),
        ).isEqualTo(TokenRefreshPolicy.Unauthorized401Decision.RefreshAndRetry)
    }

    @Test
    fun on401_regularEndpointAfterAlreadyRefreshing_tearsDown() {
        assertThat(
            TokenRefreshPolicy.decideOn401(
                endpoint = "/conversations",
                serverMessage = null,
                hasRefreshedOn401 = true,
            ),
        ).isEqualTo(TokenRefreshPolicy.Unauthorized401Decision.Teardown)
    }

    @Test
    fun on401_authRefreshEndpoint_tearsDownWithoutRetrying() {
        assertThat(
            TokenRefreshPolicy.decideOn401(
                endpoint = "/auth/refresh",
                serverMessage = null,
                hasRefreshedOn401 = false,
            ),
        ).isEqualTo(TokenRefreshPolicy.Unauthorized401Decision.Teardown)
    }

    @Test
    fun on401_loginEvenAfterRefreshFlag_stillInvalidCredentials() {
        assertThat(
            TokenRefreshPolicy.decideOn401(
                endpoint = "/auth/login",
                serverMessage = "nope",
                hasRefreshedOn401 = true,
            ),
        ).isEqualTo(TokenRefreshPolicy.Unauthorized401Decision.InvalidCredentials("nope"))
    }

    // --- classifyRetryStatus: outcome of the single replay ---

    @Test
    fun retry_2xx_isSuccess() {
        assertThat(TokenRefreshPolicy.classifyRetryStatus(200))
            .isEqualTo(TokenRefreshPolicy.RetryOutcome.Success)
    }

    @Test
    fun retry_299Boundary_isSuccess() {
        assertThat(TokenRefreshPolicy.classifyRetryStatus(299))
            .isEqualTo(TokenRefreshPolicy.RetryOutcome.Success)
    }

    @Test
    fun retry_401Again_tearsDown() {
        assertThat(TokenRefreshPolicy.classifyRetryStatus(401))
            .isEqualTo(TokenRefreshPolicy.RetryOutcome.Teardown)
    }

    @Test
    fun retry_500_isServerError() {
        assertThat(TokenRefreshPolicy.classifyRetryStatus(500))
            .isEqualTo(TokenRefreshPolicy.RetryOutcome.ServerError(500))
    }

    @Test
    fun retry_403_isServerErrorNotTeardown() {
        assertThat(TokenRefreshPolicy.classifyRetryStatus(403))
            .isEqualTo(TokenRefreshPolicy.RetryOutcome.ServerError(403))
    }
}
