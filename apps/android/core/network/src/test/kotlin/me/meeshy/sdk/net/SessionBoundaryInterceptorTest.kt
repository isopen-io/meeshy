package me.meeshy.sdk.net

import com.google.common.truth.Truth.assertThat
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody
import okhttp3.ResponseBody.Companion.toResponseBody
import okio.Buffer
import okio.BufferedSource
import okio.ForwardingSource
import okio.buffer
import org.junit.Assert.assertThrows
import org.junit.Test
import java.util.concurrent.TimeUnit

class SessionBoundaryInterceptorTest {

    private class TrackedBody(private val content: String) {
        var closed = false
        fun body(): ResponseBody {
            val source = object : ForwardingSource(Buffer().writeUtf8(content)) {
                override fun close() {
                    closed = true
                    super.close()
                }
            }.buffer()
            return object : ResponseBody() {
                override fun contentType() = null
                override fun contentLength() = content.length.toLong()
                override fun source(): BufferedSource = source
            }
        }
    }

    private fun chain(onProceed: () -> Unit, body: ResponseBody = "{}".toResponseBody(null)): Interceptor.Chain {
        val request = Request.Builder().url("https://gate.meeshy.me/api/v1/conversations").build()
        return object : Interceptor.Chain {
            override fun request(): Request = request
            override fun proceed(request: Request): Response {
                onProceed()
                return Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(200).message("ok").body(body).build()
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
    fun `une reponse arrivee sous la session qui l a demandee passe intacte`() {
        val flags = SessionTransitionFlags()
        val response = SessionBoundaryInterceptor(flags).intercept(chain(onProceed = {}))
        assertThat(response.body!!.string()).isEqualTo("{}")
    }

    @Test
    fun `une reponse arrivee apres la fin de la session qui l a demandee est jetee et son corps ferme`() {
        val flags = SessionTransitionFlags()
        val tracked = TrackedBody("""{"data":[{"id":"conversation-de-A"}]}""")
        val interceptor = SessionBoundaryInterceptor(flags)

        val thrown = assertThrows(SessionEndedDuringRequestException::class.java) {
            interceptor.intercept(chain(onProceed = { flags.bumpGeneration() }, body = tracked.body()))
        }

        assertThat(thrown).isInstanceOf(java.io.IOException::class.java)
        assertThat(tracked.closed).isTrue()
    }

    @Test
    fun `une requete partie apres le changement de session n est pas jugee sur l ancienne`() {
        val flags = SessionTransitionFlags()
        flags.bumpGeneration()
        val response = SessionBoundaryInterceptor(flags).intercept(chain(onProceed = {}))
        assertThat(response.code).isEqualTo(200)
    }

    @Test
    fun `un corps encore en route quand la session finit n est plus lu`() {
        val flags = SessionTransitionFlags()
        val response = SessionBoundaryInterceptor(flags).intercept(
            chain(onProceed = {}, body = """{"data":[{"id":"conversation-de-A"}]}""".toResponseBody(null)),
        )

        flags.bumpGeneration()

        assertThrows(SessionEndedDuringRequestException::class.java) { response.body!!.string() }
    }

    @Test
    fun `un corps lu sous la session qui l a demande garde sa taille et son type`() {
        val flags = SessionTransitionFlags()
        val json = "application/json; charset=utf-8".toMediaType()
        val response = SessionBoundaryInterceptor(flags).intercept(chain(onProceed = {}, body = "{}".toResponseBody(json)))

        assertThat(response.body!!.contentType()).isEqualTo(json)
        assertThat(response.body!!.contentLength()).isEqualTo(2L)
        assertThat(response.body!!.string()).isEqualTo("{}")
    }
}
