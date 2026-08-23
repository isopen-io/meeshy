package me.meeshy.sdk.net

import okhttp3.Interceptor
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Test
import java.util.concurrent.TimeUnit

/**
 * Android annonce enfin ce qu'il sait lire.
 *
 * Sans `X-Canvas-Caps`, la passerelle traite le client comme un ancien : elle
 * remplace un canevas v3 par une sentinelle « Mets à jour Meeshy », et OMET
 * carrément `storyEffects` quand le post porte un média (règle 5). Android ne
 * voyait donc jamais ses propres canevas, alors qu'il sait désormais les
 * peindre (`StoryEffectsWireSerializer` → `StoryEffects.rendering`).
 *
 * L'ORDRE compte, et il est la seule chose qui rende cet en-tête sûr : poser
 * la capacité AVANT de savoir lire aurait remplacé une sentinelle parfaitement
 * lisible — un blob v1 volontairement bien formé — par un écran vide. Une
 * panne muette au lieu d'une dégradation lisible, sur tout le parc.
 *
 * C'est un NIVEAU, pas un booléen : la passerelle compare `caps >= 3`
 * (`storyEffectsV3.ts:451`).
 */
class ClientCapabilitiesInterceptorTest {

    private var seen: Request? = null

    private fun chain(url: String = "https://gate.meeshy.me/api/v1/posts/feed"): Interceptor.Chain {
        val request = Request.Builder().url(url).build()
        return object : Interceptor.Chain {
            override fun request(): Request = request
            override fun proceed(request: Request): Response {
                seen = request
                return Response.Builder()
                    .request(request).protocol(Protocol.HTTP_1_1).code(200)
                    .message("m").body("".toResponseBody(null)).build()
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
    }

    @Test
    fun `la capacite de lecture du canvas est annoncee`() {
        ClientCapabilitiesInterceptor().intercept(chain())

        assertEquals("3", seen?.header("X-Canvas-Caps"))
    }

    /** Une constante du binaire : aucune route n'en est dispensee. */
    @Test
    fun `l en-tete accompagne toute requete`() {
        ClientCapabilitiesInterceptor().intercept(chain("https://gate.meeshy.me/api/v1/auth/login"))

        assertEquals("3", seen?.header("X-Canvas-Caps"))
    }

    /** Un en-tete deja pose par un appelant fait autorite : rien ne l'ecrase. */
    @Test
    fun `un en-tete deja pose n est pas ecrase`() {
        val request = Request.Builder()
            .url("https://gate.meeshy.me/api/v1/posts/feed")
            .header("X-Canvas-Caps", "4")
            .build()
        val chain = object : Interceptor.Chain by chain() {
            override fun request(): Request = request
            override fun proceed(r: Request): Response {
                seen = r
                return Response.Builder()
                    .request(r).protocol(Protocol.HTTP_1_1).code(200)
                    .message("m").body("".toResponseBody(null)).build()
            }
        }
        ClientCapabilitiesInterceptor().intercept(chain)

        assertEquals("4", seen?.header("X-Canvas-Caps"))
    }
}
