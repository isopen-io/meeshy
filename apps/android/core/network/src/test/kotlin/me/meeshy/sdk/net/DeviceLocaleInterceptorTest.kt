package me.meeshy.sdk.net

import okhttp3.Interceptor
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.util.Locale
import java.util.concurrent.TimeUnit

/**
 * Android finally SENDS the Prisme's 4th-priority signal.
 *
 * The pure resolver already folds `User.deviceLocale` in at 4th priority
 * (`LanguageResolver` / `MeeshyUser.deviceLocale`) — but that field only ever
 * fills once the server has been TOLD the device locale, which iOS does through
 * the `X-Device-Locale` header and Android never did. Without this interceptor the
 * arm was dead on Android: a francophone on an English phone got the same content
 * language as before, `deviceLocale` staying `null` forever.
 *
 * The header carries the RAW tag; the gateway `normalizeLanguageCode`s it. An
 * unusable locale sends NO header (never `"und"`), and a caller-set header wins —
 * the same contract as `ClientCapabilitiesInterceptor`.
 */
class DeviceLocaleInterceptorTest {

    private var seen: Request? = null

    private fun chain(
        request: Request = Request.Builder().url("https://gate.meeshy.me/api/v1/conversations").build(),
    ): Interceptor.Chain = object : Interceptor.Chain {
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

    @Test
    fun `the device locale is announced as a raw BCP-47 tag`() {
        DeviceLocaleInterceptor { Locale.FRANCE }.intercept(chain())

        assertEquals("fr-FR", seen?.header("X-Device-Locale"))
    }

    @Test
    fun `an unusable locale sends no header rather than und`() {
        DeviceLocaleInterceptor { Locale.ROOT }.intercept(chain())

        assertNull(seen?.header("X-Device-Locale"))
    }

    @Test
    fun `a header already set by a caller is not overwritten`() {
        val request = Request.Builder()
            .url("https://gate.meeshy.me/api/v1/conversations")
            .header("X-Device-Locale", "es-ES")
            .build()

        DeviceLocaleInterceptor { Locale.FRANCE }.intercept(chain(request))

        assertEquals("es-ES", seen?.header("X-Device-Locale"))
    }

    @Test
    fun `the locale is read per request, not captured once`() {
        var current = Locale.FRANCE
        val interceptor = DeviceLocaleInterceptor { current }

        interceptor.intercept(chain())
        assertEquals("fr-FR", seen?.header("X-Device-Locale"))

        current = Locale.forLanguageTag("pt-BR")
        interceptor.intercept(chain())
        assertEquals("pt-BR", seen?.header("X-Device-Locale"))
    }
}
