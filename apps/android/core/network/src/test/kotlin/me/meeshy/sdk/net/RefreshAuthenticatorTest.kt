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

    private class FakeRefresher(private val newToken: String?) {
        var calls: Int = 0
        val flags = SessionTransitionFlags()

        fun over(store: TokenStore): SessionRefresher = SessionRefresher(store, flags) {
            calls++
            newToken
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
        val authenticator = RefreshAuthenticator(tokenStore, refresher.over(tokenStore))

        val retry = authenticator.authenticate(null, response("/api/v1/conversations"))

        assertThat(retry).isNotNull()
        assertThat(retry!!.header("Authorization")).isEqualTo("Bearer new-jwt")
        assertThat(tokenStore.jwt).isEqualTo("new-jwt")
        assertThat(refresher.calls).isEqualTo(1)
    }

    @Test
    fun successfulRefresh_preservesOriginalUrlAndMethod() {
        val tokenStore = store()
        val authenticator = RefreshAuthenticator(tokenStore, FakeRefresher("new-jwt").over(tokenStore))

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
        val authenticator = RefreshAuthenticator(tokenStore, refresher.over(tokenStore))

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
        val authenticator = RefreshAuthenticator(tokenStore, refresher.over(tokenStore))

        val retry = authenticator.authenticate(null, response("/api/v1/conversations"))

        assertThat(retry).isNull()
        assertThat(tokenStore.jwt).isNull()
        assertThat(refresher.calls).isEqualTo(1)
    }

    @Test
    fun eligibleEndpoint_secondAttempt_priorResponsePresent_tearsDownWithoutRefreshing() {
        val tokenStore = store()
        val refresher = FakeRefresher("new-jwt")
        val authenticator = RefreshAuthenticator(tokenStore, refresher.over(tokenStore))
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
        val authenticator = RefreshAuthenticator(tokenStore, refresher.over(tokenStore))

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
        val authenticator = RefreshAuthenticator(tokenStore, refresher.over(tokenStore))

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
        val authenticator = RefreshAuthenticator(tokenStore, refresher.over(tokenStore))

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
        val authenticator = RefreshAuthenticator(tokenStore, refresher.over(tokenStore))

        val retry = authenticator.authenticate(null, response("/api/v1/auth/register"))

        assertThat(retry).isNull()
        assertThat(refresher.calls).isEqualTo(0)
        assertThat(tokenStore.jwt).isNull()
    }

    @Test
    fun magicLinkEndpoint_401_ineligible_tearsDown() {
        val tokenStore = store()
        val refresher = FakeRefresher("new-jwt")
        val authenticator = RefreshAuthenticator(tokenStore, refresher.over(tokenStore))

        val retry = authenticator.authenticate(null, response("/api/v1/auth/magic-link/verify"))

        assertThat(retry).isNull()
        assertThat(refresher.calls).isEqualTo(0)
    }

    @Test
    fun endpointWithoutApiPrefix_stillNormalizesToPolicyForm() {
        val tokenStore = store()
        val refresher = FakeRefresher("new-jwt")
        val authenticator = RefreshAuthenticator(tokenStore, refresher.over(tokenStore))

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
        val authenticator = RefreshAuthenticator(tokenStore, refresher.over(tokenStore), apiPathPrefix = "/api/v2")

        // `/api/v2/auth/login` must normalize to `/auth/login` → invalid-credentials, no refresh.
        val retry = authenticator.authenticate(null, response("/api/v2/auth/login"))

        assertThat(retry).isNull()
        assertThat(refresher.calls).isEqualTo(0)
        assertThat(tokenStore.jwt).isEqualTo("old-jwt")
    }
}

class RefreshAuthenticatorSingleFlightTest {

    private fun unauthorized(jwt: String, path: String = "/api/v1/conversations", pinned: Boolean = false): Response {
        val request = Request.Builder()
            .url("https://gate.meeshy.me$path")
            .header("Authorization", "Bearer $jwt")
            .tag(SentCredential::class.java, SentCredential(RequestCredential.Bearer(jwt), 0, pinned))
            .build()
        return Response.Builder().request(request).protocol(Protocol.HTTP_2).code(401).message("Unauthorized").build()
    }

    @Test
    fun `cinq 401 simultanes ne font qu un seul refresh et rejouent tous avec le nouveau jwt`() {
        val store = InMemoryTokenStore(jwt = "old", sessionToken = "session", userId = "u1")
        val calls = java.util.concurrent.atomic.AtomicInteger()
        val refresher = SessionRefresher(store) {
            calls.incrementAndGet()
            kotlinx.coroutines.delay(50)
            "new"
        }
        val authenticator = RefreshAuthenticator(store, refresher)
        val pool = java.util.concurrent.Executors.newFixedThreadPool(5)
        val retries = (1..5).map { pool.submit<Request?> { authenticator.authenticate(null, unauthorized("old")) } }
            .map { it.get() }
        pool.shutdown()

        assertThat(calls.get()).isEqualTo(1)
        assertThat(retries.map { it?.header("Authorization") }).containsExactly(
            "Bearer new", "Bearer new", "Bearer new", "Bearer new", "Bearer new",
        )
    }

    @Test
    fun `un 401 d un autre compte n est ni renouvele ni rejoue`() {
        val store = InMemoryTokenStore(jwt = "active", sessionToken = "session", userId = "u1")
        var calls = 0
        val authenticator = RefreshAuthenticator(store, SessionRefresher(store) { calls++; "new" })

        assertThat(authenticator.authenticate(null, unauthorized("other-account"))).isNull()
        assertThat(calls).isEqualTo(0)
        assertThat(store.jwt).isEqualTo("active")
    }

    @Test
    fun `une requete epinglee a un jeton fige n est jamais rejouee`() {
        val store = InMemoryTokenStore(jwt = "old", sessionToken = "session", userId = "u1")
        var calls = 0
        val authenticator = RefreshAuthenticator(store, SessionRefresher(store) { calls++; "new" })

        assertThat(authenticator.authenticate(null, unauthorized("old", pinned = true))).isNull()
        assertThat(calls).isEqualTo(0)
    }

    @Test
    fun `pendant une bascule de compte rien n est renouvele`() {
        val store = InMemoryTokenStore(jwt = "old", sessionToken = "session", userId = "u1")
        val flags = SessionTransitionFlags().also { it.isSwitchingAccount = true }
        var calls = 0
        val authenticator = RefreshAuthenticator(store, SessionRefresher(store, flags) { calls++; "new" })

        assertThat(authenticator.authenticate(null, unauthorized("old"))).isNull()
        assertThat(calls).isEqualTo(0)
        assertThat(store.jwt).isEqualTo("old")
    }

    @Test
    fun `un jeton retire de la meme session rejoue sous le courant sans nouveau refresh`() {
        val store = InMemoryTokenStore(jwt = "old", sessionToken = "session", userId = "u1")
        var calls = 0
        val authenticator = RefreshAuthenticator(store, SessionRefresher(store) { calls++; "new" })

        authenticator.authenticate(null, unauthorized("old"))
        val late = authenticator.authenticate(null, unauthorized("old"))

        assertThat(calls).isEqualTo(1)
        assertThat(late!!.header("Authorization")).isEqualTo("Bearer new")
    }

    @Test
    fun `un echec du refresh demonte le compte actif`() {
        val store = InMemoryTokenStore(jwt = "old", sessionToken = "session", userId = "u1")
        val authenticator = RefreshAuthenticator(store, SessionRefresher(store) { null })

        assertThat(authenticator.authenticate(null, unauthorized("old"))).isNull()
        assertThat(store.isAuthenticated).isFalse()
    }
}
