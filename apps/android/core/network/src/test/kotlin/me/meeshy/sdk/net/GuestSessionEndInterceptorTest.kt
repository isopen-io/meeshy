package me.meeshy.sdk.net

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.guest.GuestSessionEnd
import okhttp3.Interceptor
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import java.util.concurrent.TimeUnit

class GuestSessionEndInterceptorTest {
    private fun run(
        code: Int,
        body: String,
        store: TokenStore,
        sentToken: String? = "guest-1",
    ): List<GuestSessionEndSignal> {
        val signals = mutableListOf<GuestSessionEndSignal>()
        val builder = Request.Builder().url("https://gate.meeshy.me/api/v1/conversations/c1/messages")
        val request = builder
            .tag(SentCredential::class.java, SentCredential(sentToken?.let { RequestCredential.AnonymousSession(it) }, 0L, false))
            .build()
        val response = Response.Builder()
            .request(request).protocol(Protocol.HTTP_1_1).code(code).message("m")
            .body(body.toResponseBody(null)).build()
        val chain = object : Interceptor.Chain {
            override fun request(): Request = request
            override fun proceed(request: Request): Response = response
            override fun connection() = null
            override fun call(): okhttp3.Call = throw UnsupportedOperationException()
            override fun connectTimeoutMillis() = 0
            override fun withConnectTimeout(timeout: Int, unit: TimeUnit) = this
            override fun readTimeoutMillis() = 0
            override fun withReadTimeout(timeout: Int, unit: TimeUnit) = this
            override fun writeTimeoutMillis() = 0
            override fun withWriteTimeout(timeout: Int, unit: TimeUnit) = this
        }
        val out = GuestSessionEndInterceptor(store) { signals += it }.intercept(chain)
        assertThat(out.peekBody(1024).string()).isEqualTo(body)
        return signals
    }

    private fun guestStore() = InMemoryTokenStore().apply { sessionToken = "guest-1" }

    @Test
    fun `un lien echu signale la fin sous le jeton refuse`() {
        val signals = run(403, """{"success":false,"code":"SHARE_LINK_EXPIRED"}""", guestStore())
        assertThat(signals).containsExactly(GuestSessionEndSignal(GuestSessionEnd.LINK_EXPIRED, "guest-1"))
    }

    @Test
    fun `un acces retire se lit dans error`() {
        val signals = run(410, """{"success":false,"error":"GUEST_ACCESS_REVOKED"}""", guestStore())
        assertThat(signals.map { it.end }).containsExactly(GuestSessionEnd.ACCESS_REVOKED)
    }

    @Test
    fun `un refus ordinaire ne termine rien`() {
        assertThat(run(403, """{"code":"FORBIDDEN"}""", guestStore())).isEmpty()
        assertThat(run(401, """{"code":"SHARE_LINK_EXPIRED"}""", guestStore())).isEmpty()
        assertThat(run(403, "not json", guestStore())).isEmpty()
    }

    @Test
    fun `la requete d un compte ou d un visiteur anonyme ne termine aucune session d invite`() {
        val body = """{"code":"SHARE_LINK_EXPIRED"}"""
        assertThat(run(403, body, InMemoryTokenStore().apply { jwt = "jwt"; sessionToken = "guest-1" })).isEmpty()
        assertThat(run(403, body, guestStore(), sentToken = "visitor-key")).isEmpty()
        assertThat(run(403, body, guestStore(), sentToken = null)).isEmpty()
    }

    @Test
    fun `le refus tardif d une session deja quittee ne vise pas la session courante`() {
        val store = InMemoryTokenStore().apply { sessionToken = "guest-2" }
        assertThat(run(403, """{"code":"SHARE_LINK_EXPIRED"}""", store, sentToken = "guest-1")).isEmpty()
    }
}
