package me.meeshy.sdk.net

import okhttp3.Interceptor
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import okhttp3.logging.HttpLoggingInterceptor
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test
import java.util.concurrent.TimeUnit

/**
 * Constate a l'usage (#4811) : `HttpLoggingInterceptor.Level.BODY` journalise le
 * corps de `/me/account/deletion` en build debug, mot de passe compris — un
 * niveau global n'a pas de granularite par route. Ces temoins figent le
 * contrat que le garde doit tenir : abaisser le niveau du logger PARTAGE a
 * BASIC (sans corps ni en-tetes) sur les routes qui portent un mot de passe,
 * et le laisser tel quel ailleurs.
 */
class SensitiveBodyLoggingGuardTest {

    private fun chain(path: String): Interceptor.Chain {
        val request = Request.Builder().url("https://gate.meeshy.me/api/v1$path").build()
        val response = Response.Builder()
            .request(request).protocol(Protocol.HTTP_1_1).code(200)
            .message("OK").body("".toResponseBody(null)).build()
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

    private fun freshLogger() = HttpLoggingInterceptor().apply { level = HttpLoggingInterceptor.Level.BODY }

    @Test
    fun `lowers the shared logger to BASIC on account deletion`() {
        val logger = freshLogger()
        SensitiveBodyLoggingGuard(logger, HttpLoggingInterceptor.Level.BODY)
            .intercept(chain("/me/account/deletion"))

        assertEquals(HttpLoggingInterceptor.Level.BASIC, logger.level)
    }

    @Test
    fun `lowers the shared logger to BASIC on login`() {
        val logger = freshLogger()
        SensitiveBodyLoggingGuard(logger, HttpLoggingInterceptor.Level.BODY)
            .intercept(chain("/auth/login"))

        assertEquals(HttpLoggingInterceptor.Level.BASIC, logger.level)
    }

    @Test
    fun `lowers the shared logger to BASIC on register`() {
        val logger = freshLogger()
        SensitiveBodyLoggingGuard(logger, HttpLoggingInterceptor.Level.BODY)
            .intercept(chain("/auth/register"))

        assertEquals(HttpLoggingInterceptor.Level.BASIC, logger.level)
    }

    @Test
    fun `lowers the shared logger to BASIC on 2fa disable`() {
        val logger = freshLogger()
        SensitiveBodyLoggingGuard(logger, HttpLoggingInterceptor.Level.BODY)
            .intercept(chain("/auth/2fa/disable"))

        assertEquals(HttpLoggingInterceptor.Level.BASIC, logger.level)
    }

    @Test
    fun `lowers the shared logger to BASIC on password change`() {
        val logger = freshLogger()
        SensitiveBodyLoggingGuard(logger, HttpLoggingInterceptor.Level.BODY)
            .intercept(chain("/users/me/password"))

        assertEquals(HttpLoggingInterceptor.Level.BASIC, logger.level)
    }

    // Une route sans mot de passe garde le niveau complet : le garde ne doit
    // pas assecher le logging debug au-dela de ce que #4811 exige.
    @Test
    fun `leaves the full level untouched on an unrelated route`() {
        val logger = freshLogger()
        SensitiveBodyLoggingGuard(logger, HttpLoggingInterceptor.Level.BODY)
            .intercept(chain("/conversations"))

        assertEquals(HttpLoggingInterceptor.Level.BODY, logger.level)
    }

    // Deux requetes consecutives ne doivent pas se contaminer : une route
    // sensible suivie d'une route ordinaire doit restaurer le niveau complet,
    // pas rester bloquee a BASIC.
    @Test
    fun `restores the full level after a sensitive request is followed by an ordinary one`() {
        val logger = freshLogger()
        val guard = SensitiveBodyLoggingGuard(logger, HttpLoggingInterceptor.Level.BODY)

        guard.intercept(chain("/me/account/deletion"))
        assertNotEquals(HttpLoggingInterceptor.Level.BODY, logger.level)

        guard.intercept(chain("/conversations"))
        assertEquals(HttpLoggingInterceptor.Level.BODY, logger.level)
    }

    @Test
    fun `the response passes through unchanged`() {
        val logger = freshLogger()
        val response = SensitiveBodyLoggingGuard(logger, HttpLoggingInterceptor.Level.BODY)
            .intercept(chain("/me/account/deletion"))

        assertEquals(200, response.code)
    }
}
