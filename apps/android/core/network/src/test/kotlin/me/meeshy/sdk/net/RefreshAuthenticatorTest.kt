package me.meeshy.sdk.net

import com.google.common.truth.Truth.assertThat
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.junit.Test

/**
 * Behavioural coverage for [RefreshAuthenticator] — the concrete OkHttp
 * `Authenticator` that wires the pure [me.meeshy.sdk.model.auth.TokenRefreshPolicy]
 * reactive-401 decisions into real request replay. Tests drive the public
 * `authenticate` entry point with constructed [Response]s (no server, no
 * MockWebServer) and a fake synchronous refresher, asserting the returned retry
 * request and the token-store side effects — never the private helpers.
 */
class RefreshAuthenticatorTest {

    private class FakeRefresher(private val newToken: String?) : TokenRefresher {
        var calls: Int = 0
        override fun refresh(): String? {
            calls++
            return newToken
        }
    }

    private fun response(
        path: String,
        method: String = "GET",
        prior: Response? = null,
        code: Int = 401,
    ): Response {
        val requestBuilder = Request.Builder()
            .url("https://gate.meeshy.me$path")
            .header("Authorization", "Bearer old-jwt")
        if (method == "GET") requestBuilder.get() else requestBuilder.method(method, "".toRequestBody())
        val builder = Response.Builder()
            .request(requestBuilder.build())
            .protocol(Protocol.HTTP_2)
            .code(code)
            .message("Unauthorized")
        if (prior != null) builder.priorResponse(prior)
        return builder.build()
    }

    private fun store(jwt: String? = "old-jwt", session: String? = "session-abc"): InMemoryTokenStore =
        InMemoryTokenStore(jwt = jwt, sessionToken = session)

    @Test
    fun eligibleEndpoint_first401_refreshesAndReplaysWithNewBearer() {
        val tokenStore = store()
        val refresher = FakeRefresher("new-jwt")
        val authenticator = RefreshAuthenticator(tokenStore, refresher)

        val retry = authenticator.authenticate(null, response("/api/v1/conversations"))

        assertThat(retry).isNotNull()
        assertThat(retry!!.header("Authorization")).isEqualTo("Bearer new-jwt")
        assertThat(tokenStore.jwt).isEqualTo("new-jwt")
        assertThat(refresher.calls).isEqualTo(1)
    }

    @Test
    fun successfulRefresh_preservesOriginalUrlAndMethod() {
        val tokenStore = store()
        val authenticator = RefreshAuthenticator(tokenStore, FakeRefresher("new-jwt"))

        val retry = authenticator.authenticate(
            null,
            response("/api/v1/messages", method = "POST"),
        )

        assertThat(retry).isNotNull()
        assertThat(retry!!.url.encodedPath).isEqualTo("/api/v1/messages")
        assertThat(retry.method).isEqualTo("POST")
    }

    @Test
    fun eligibleEndpoint_refreshReturnsNull_tearsDownAndGivesUp() {
        val tokenStore = store()
        val refresher = FakeRefresher(null)
        val authenticator = RefreshAuthenticator(tokenStore, refresher)

        val retry = authenticator.authenticate(null, response("/api/v1/conversations"))

        assertThat(retry).isNull()
        assertThat(tokenStore.jwt).isNull()
        assertThat(tokenStore.sessionToken).isNull()
        assertThat(refresher.calls).isEqualTo(1)
    }

    @Test
    fun eligibleEndpoint_refreshReturnsBlank_tearsDownAndGivesUp() {
        val tokenStore = store()
        val refresher = FakeRefresher("   ")
        val authenticator = RefreshAuthenticator(tokenStore, refresher)

        val retry = authenticator.authenticate(null, response("/api/v1/conversations"))

        assertThat(retry).isNull()
        assertThat(tokenStore.jwt).isNull()
        assertThat(refresher.calls).isEqualTo(1)
    }

    @Test
    fun eligibleEndpoint_secondAttempt_priorResponsePresent_tearsDownWithoutRefreshing() {
        val tokenStore = store()
        val refresher = FakeRefresher("new-jwt")
        val authenticator = RefreshAuthenticator(tokenStore, refresher)
        val prior = response("/api/v1/conversations")

        val retry = authenticator.authenticate(null, response("/api/v1/conversations", prior = prior))

        assertThat(retry).isNull()
        assertThat(refresher.calls).isEqualTo(0)
        assertThat(tokenStore.jwt).isNull()
        assertThat(tokenStore.sessionToken).isNull()
    }

    @Test
    fun loginEndpoint_401_invalidCredentials_noRetry_noRefresh_preservesSession() {
        val tokenStore = store()
        val refresher = FakeRefresher("new-jwt")
        val authenticator = RefreshAuthenticator(tokenStore, refresher)

        val retry = authenticator.authenticate(null, response("/api/v1/auth/login"))

        assertThat(retry).isNull()
        assertThat(refresher.calls).isEqualTo(0)
        assertThat(tokenStore.jwt).isEqualTo("old-jwt")
        assertThat(tokenStore.sessionToken).isEqualTo("session-abc")
    }

    @Test
    fun accountDeletionEndpoint_401_invalidPassword_noRetry_noRefresh_preservesSession() {
        val tokenStore = store()
        val refresher = FakeRefresher("new-jwt")
        val authenticator = RefreshAuthenticator(tokenStore, refresher)

        val retry = authenticator.authenticate(null, response("/api/v1/me/account/deletion", method = "POST"))

        assertThat(retry).isNull()
        assertThat(refresher.calls).isEqualTo(0)
        assertThat(tokenStore.jwt).isEqualTo("old-jwt")
        assertThat(tokenStore.sessionToken).isEqualTo("session-abc")
    }

    @Test
    fun refreshEndpoint_401_ineligible_tearsDownWithoutRefreshing() {
        val tokenStore = store()
        val refresher = FakeRefresher("new-jwt")
        val authenticator = RefreshAuthenticator(tokenStore, refresher)

        val retry = authenticator.authenticate(null, response("/api/v1/auth/refresh"))

        assertThat(retry).isNull()
        assertThat(refresher.calls).isEqualTo(0)
        assertThat(tokenStore.jwt).isNull()
        assertThat(tokenStore.sessionToken).isNull()
    }

    @Test
    fun registerEndpoint_401_ineligible_tearsDown() {
        val tokenStore = store()
        val refresher = FakeRefresher("new-jwt")
        val authenticator = RefreshAuthenticator(tokenStore, refresher)

        val retry = authenticator.authenticate(null, response("/api/v1/auth/register"))

        assertThat(retry).isNull()
        assertThat(refresher.calls).isEqualTo(0)
        assertThat(tokenStore.jwt).isNull()
    }

    @Test
    fun magicLinkEndpoint_401_ineligible_tearsDown() {
        val tokenStore = store()
        val refresher = FakeRefresher("new-jwt")
        val authenticator = RefreshAuthenticator(tokenStore, refresher)

        val retry = authenticator.authenticate(null, response("/api/v1/auth/magic-link/verify"))

        assertThat(retry).isNull()
        assertThat(refresher.calls).isEqualTo(0)
    }

    @Test
    fun endpointWithoutApiPrefix_stillNormalizesToPolicyForm() {
        val tokenStore = store()
        val refresher = FakeRefresher("new-jwt")
        val authenticator = RefreshAuthenticator(tokenStore, refresher)

        // No `/api/v1` prefix: the path IS already the policy endpoint form.
        val retry = authenticator.authenticate(null, response("/auth/login"))

        assertThat(retry).isNull()
        assertThat(refresher.calls).isEqualTo(0)
        assertThat(tokenStore.jwt).isEqualTo("old-jwt")
    }

    @Test
    fun customApiPrefix_isStrippedBeforePolicyDecision() {
        val tokenStore = store()
        val refresher = FakeRefresher("new-jwt")
        val authenticator = RefreshAuthenticator(tokenStore, refresher, apiPathPrefix = "/api/v2")

        // `/api/v2/auth/login` must normalize to `/auth/login` → invalid-credentials, no refresh.
        val retry = authenticator.authenticate(null, response("/api/v2/auth/login"))

        assertThat(retry).isNull()
        assertThat(refresher.calls).isEqualTo(0)
        assertThat(tokenStore.jwt).isEqualTo("old-jwt")
    }
}
