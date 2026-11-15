package me.meeshy.sdk.net

import okhttp3.Interceptor
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.util.concurrent.TimeUnit

/**
 * `AuthInterceptor` pose l'identite du porte-jetons sur chaque requete — sauf sur
 * celle qui porte DEJA la sienne. La fermeture d'une session quittee
 * (`POST /auth/logout`) part avec les jetons FIGES de cette session : si
 * l'intercepteur les remplacait par ceux du porte-jetons, quitter le compte A
 * fermerait, a la place, la session du compte B qui vient de se connecter.
 */
class AuthInterceptorTest {

    private fun sent(request: Request, tokens: TokenStore): Request {
        var forwarded: Request? = null
        val chain = object : Interceptor.Chain {
            override fun request(): Request = request
            override fun proceed(request: Request): Response {
                forwarded = request
                return Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(200)
                    .message("OK").body("".toResponseBody(null)).build()
            }
            override fun connection() = null
            override fun call(): okhttp3.Call = throw UnsupportedOperationException()
            override fun connectTimeoutMillis() = 0
            override fun withConnectTimeout(timeout: Int, unit: TimeUnit) = this
            override fun readTimeoutMillis() = 0
            override fun withReadTimeout(timeout: Int, unit: TimeUnit) = this
            override fun writeTimeoutMillis() = 0
            override fun withWriteTimeout(timeout: Int, unit: TimeUnit) = this
        }
        AuthInterceptor(tokens).intercept(chain)
        return checkNotNull(forwarded)
    }

    private fun request(configure: Request.Builder.() -> Unit = {}): Request =
        Request.Builder().url("https://gate.meeshy.me/api/v1/conversations").apply(configure).build()

    @Test
    fun `un JWT devient un en-tete Authorization`() {
        val out = sent(request(), InMemoryTokenStore(jwt = "jwt-1", sessionToken = "sess-1"))

        assertEquals("Bearer jwt-1", out.header("Authorization"))
        assertNull(out.header("X-Session-Token"))
    }

    @Test
    fun `sans JWT, le jeton de session devient X-Session-Token`() {
        val out = sent(request(), InMemoryTokenStore(sessionToken = "sess-1"))

        assertNull(out.header("Authorization"))
        assertEquals("sess-1", out.header("X-Session-Token"))
    }

    @Test
    fun `sans aucun jeton, la requete part anonyme`() {
        val out = sent(request(), InMemoryTokenStore())

        assertNull(out.header("Authorization"))
        assertNull(out.header("X-Session-Token"))
    }

    @Test
    fun `une requete qui porte deja son Authorization n'est pas reecrite`() {
        val out = sent(
            request { header("Authorization", "Bearer jwt-fige") },
            InMemoryTokenStore(jwt = "jwt-du-compte-suivant"),
        )

        assertEquals("Bearer jwt-fige", out.header("Authorization"))
    }

    @Test
    fun `une requete qui porte deja son X-Session-Token n'emprunte pas le JWT du compte suivant`() {
        val out = sent(
            request { header("X-Session-Token", "sess-figee") },
            InMemoryTokenStore(jwt = "jwt-du-compte-suivant", sessionToken = "sess-du-compte-suivant"),
        )

        assertEquals("sess-figee", out.header("X-Session-Token"))
        assertNull(out.header("Authorization"))
    }
}
