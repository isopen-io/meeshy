package me.meeshy.sdk.net

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.net.ClientCapability
import okhttp3.Interceptor
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.TimeUnit

class ClientInfoInterceptorTest {

    private fun provider() = ClientInfoProvider(
        appVersion = "2.4.1",
        appBuild = "241",
        localeProvider = { Locale.CANADA_FRENCH },
        timeZoneProvider = { TimeZone.getTimeZone("America/Toronto") },
        deviceNameProvider = { "Google Pixel 8" },
        osVersionProvider = { "Android 15" },
    )

    private fun run(request: Request, interceptor: Interceptor): Request {
        var seen: Request? = null
        val chain = object : Interceptor.Chain {
            override fun request(): Request = request
            override fun proceed(request: Request): Response {
                seen = request
                return Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(200)
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
        interceptor.intercept(chain)
        return seen!!
    }

    private fun request(builder: Request.Builder.() -> Unit = {}) =
        Request.Builder().url("https://gate.meeshy.me/api/v1/posts/feed").apply(builder).build()

    @Test
    fun `chaque en-tete d identite est pose`() {
        val seen = run(request(), ClientInfoInterceptor(provider()))

        assertThat(seen.header("X-Meeshy-Version")).isEqualTo("2.4.1")
        assertThat(seen.header("X-Meeshy-Build")).isEqualTo("241")
        assertThat(seen.header("X-Meeshy-Platform")).isEqualTo("android")
        assertThat(seen.header("X-Meeshy-Device")).isEqualTo("Google Pixel 8")
        assertThat(seen.header("X-Meeshy-OS")).isEqualTo("Android 15")
        assertThat(seen.header("X-Meeshy-Timezone")).isEqualTo("America/Toronto")
        assertThat(seen.header("X-Meeshy-Locale")).isEqualTo("fr-CA")
        assertThat(seen.header("X-Meeshy-Country")).isEqualTo("CA")
        assertThat(seen.header("X-App-Version")).isEqualTo("2.4.1")
        assertThat(seen.header("X-App-Platform")).isEqualTo("android")
    }

    @Test
    fun `un en-tete pose par l appelant n est jamais ecrase`() {
        val seen = run(request { header("X-Meeshy-Device", "Test rig") }, ClientInfoInterceptor(provider()))

        assertThat(seen.header("X-Meeshy-Device")).isEqualTo("Test rig")
        assertThat(seen.header("X-Meeshy-Version")).isEqualTo("2.4.1")
    }

    @Test
    fun `aucune capacite n est declaree tant que les ecrans ne sont pas livres`() {
        val seen = run(request(), ClientInfoInterceptor(provider()))

        assertThat(seen.header("X-Meeshy-Capabilities")).isNull()
    }

    @Test
    fun `les capacites lisibles sont declarees et l en-tete du canvas reste inchange`() {
        val seen = run(
            request(),
            ClientCapabilitiesInterceptor(listOf(ClientCapability.ONBOARDING_AGE)),
        )

        assertThat(seen.header("X-Meeshy-Capabilities")).isEqualTo("onboarding-age")
        assertThat(seen.header("X-Canvas-Caps")).isEqualTo("3")
    }

    @Test
    fun `sans capacite declaree l en-tete est omis`() {
        val seen = run(request(), ClientCapabilitiesInterceptor())

        assertThat(seen.header("X-Meeshy-Capabilities")).isNull()
        assertThat(seen.header("X-Canvas-Caps")).isEqualTo("3")
    }

    @Test
    fun `STAGING pointe l hote deploye pour l API et la socket`() {
        assertThat(MeeshyConfig.STAGING.apiBaseUrl).isEqualTo("https://gate.staging.meeshy.me/api/v1/")
        assertThat(MeeshyConfig.STAGING.socketUrl).isEqualTo("https://gate.staging.meeshy.me")
    }
}
