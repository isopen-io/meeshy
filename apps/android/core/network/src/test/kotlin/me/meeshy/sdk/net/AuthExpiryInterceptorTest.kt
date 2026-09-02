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
 * Constate a l'usage : une session expiree produit 401/403 sur /conversations,
 * /posts/feed/stories et /friend-requests, et l'ecran affichait « Check your
 * connection and try again » alors que le reseau fonctionnait. Le message accusait
 * le reseau, et rien ne disait a l'utilisateur qu'il devait se reconnecter.
 */
class AuthExpiryInterceptorTest {

    private fun chainReturning(code: Int, url: String = "https://gate.meeshy.me/api/v1/conversations"): Interceptor.Chain {
        val request = Request.Builder().url(url).build()
        val response = Response.Builder()
            .request(request).protocol(Protocol.HTTP_1_1).code(code)
            .message("m").body("".toResponseBody(null)).build()
        return object : Interceptor.Chain {
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
    }

    @Test
    fun `a 401 signals an expired session`() {
        var expired = 0
        AuthExpiryInterceptor { expired++ }.intercept(chainReturning(401))
        assertEquals(1, expired)
    }

    @Test
    fun `a 403 signals an expired session too`() {
        var expired = 0
        AuthExpiryInterceptor { expired++ }.intercept(chainReturning(403))
        assertEquals(1, expired)
    }

    // Une panne serveur ne doit PAS deconnecter : l'utilisateur perdrait sa session
    // a chaque hoquet de la passerelle.
    @Test
    fun `a 500 does not signal an expired session`() {
        var expired = 0
        AuthExpiryInterceptor { expired++ }.intercept(chainReturning(500))
        assertEquals(0, expired)
    }

    @Test
    fun `a 200 does not signal an expired session`() {
        var expired = 0
        AuthExpiryInterceptor { expired++ }.intercept(chainReturning(200))
        assertEquals(0, expired)
    }

    // Un echec d'identifiants sur /auth/login n'est PAS une session expiree : c'est
    // la reponse normale de l'ecran de connexion. Deconnecter la-dessus ferait
    // boucler l'application sur elle-meme.
    @Test
    fun `a 401 on the login route is not an expired session`() {
        var expired = 0
        AuthExpiryInterceptor { expired++ }
            .intercept(chainReturning(401, "https://gate.meeshy.me/api/v1/auth/login"))
        assertEquals(0, expired)
    }

    @Test
    fun `a 401 on registration is not an expired session either`() {
        var expired = 0
        AuthExpiryInterceptor { expired++ }
            .intercept(chainReturning(401, "https://gate.meeshy.me/api/v1/auth/register"))
        assertEquals(0, expired)
    }

    // Un mot de passe refuse sur la suppression de compte rend 401 INVALID_PASSWORD :
    // ce n'est pas non plus une session expiree, sinon l'ecran de suppression
    // renverrait l'utilisateur sur l'ecran de connexion au lieu d'afficher l'erreur.
    @Test
    fun `a 401 on account deletion is not an expired session`() {
        var expired = 0
        AuthExpiryInterceptor { expired++ }
            .intercept(chainReturning(401, "https://gate.meeshy.me/api/v1/me/account/deletion"))
        assertEquals(0, expired)
    }

    // La reponse doit traverser l'intercepteur intacte : l'appelant a toujours
    // besoin de son code pour composer son propre message.
    @Test
    fun `the response passes through unchanged`() {
        val response = AuthExpiryInterceptor { }.intercept(chainReturning(401))
        assertEquals(401, response.code)
    }
}
