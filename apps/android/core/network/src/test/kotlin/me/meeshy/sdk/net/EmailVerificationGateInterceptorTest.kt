package me.meeshy.sdk.net

import com.google.common.truth.Truth.assertThat
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Test

class EmailVerificationGateInterceptorTest {

    private val server = MockWebServer().apply { start() }
    private val registry = EmailVerificationGateRegistry()

    @After
    fun tearDown() = server.shutdown()

    private class FakeGate(
        private val unproven: Boolean = true,
        private val verdict: Boolean = true,
    ) : EmailVerificationGating {
        val reasons = mutableListOf<EmailGateReason>()
        var unprovenAsked = 0
        override suspend fun emailKnownUnproven(): Boolean = unproven.also { unprovenAsked++ }
        override suspend fun verifyEmail(reason: EmailGateReason): Boolean = verdict.also { reasons += reason }
    }

    private val refusal = """{"success":false,"error":"Email verification required","code":"EMAIL_NOT_VERIFIED"}"""

    private fun post(path: String, body: String = """{"content":"hello"}""") =
        OkHttpClient.Builder().addInterceptor(EmailVerificationGateInterceptor(registry, "/api/v1/", waitLimitMs = 2_000)).build()
            .newCall(
                Request.Builder().url(server.url(path))
                    .post(body.toRequestBody("application/json".toMediaType())).build(),
            ).execute()

    @Test
    fun `un refus de publication ouvre la validation puis rejoue la meme requete`() {
        val gate = FakeGate().also { registry.current = it }
        server.enqueue(MockResponse().setResponseCode(403).setBody(refusal))
        server.enqueue(MockResponse().setResponseCode(201).setBody("""{"success":true}"""))

        val response = post("/api/v1/posts")

        assertThat(response.code).isEqualTo(201)
        assertThat(gate.reasons).containsExactly(EmailGateReason.PUBLISH)
        assertThat(server.requestCount).isEqualTo(2)
        val first = server.takeRequest()
        val second = server.takeRequest()
        assertThat(first.body.readUtf8()).isEqualTo("""{"content":"hello"}""")
        assertThat(second.body.readUtf8()).isEqualTo("""{"content":"hello"}""")
    }

    @Test
    fun `la validation fermee rend le refus du serveur sans rejeu`() {
        val gate = FakeGate(verdict = false).also { registry.current = it }
        server.enqueue(MockResponse().setResponseCode(403).setBody(refusal))

        val response = post("/api/v1/posts")

        assertThat(response.code).isEqualTo(403)
        assertThat(response.body!!.string()).contains("EMAIL_NOT_VERIFIED")
        assertThat(server.requestCount).isEqualTo(1)
        assertThat(gate.reasons).hasSize(1)
    }

    @Test
    fun `un refus au plafond de liens dit plus de liens`() {
        val gate = FakeGate().also { registry.current = it }
        server.enqueue(
            MockResponse().setResponseCode(403)
                .setBody("""{"success":false,"error":"${EmailVerificationGateRules.SHARE_LINK_CAP_REFUSAL}","code":"EMAIL_NOT_VERIFIED"}"""),
        )
        server.enqueue(MockResponse().setResponseCode(201).setBody("{}"))

        post("/api/v1/links")

        assertThat(gate.reasons).containsExactly(EmailGateReason.MORE_LINKS)
    }

    @Test
    fun `inviter est retenu d'avance et un refus local n'atteint pas le serveur`() {
        val gate = FakeGate(unproven = true, verdict = false).also { registry.current = it }

        val response = post("/api/v1/invitations/email")

        assertThat(response.code).isEqualTo(403)
        assertThat(response.body!!.string()).contains("EMAIL_NOT_VERIFIED")
        assertThat(server.requestCount).isEqualTo(0)
        assertThat(gate.reasons).containsExactly(EmailGateReason.INVITE)
    }

    @Test
    fun `inviter avec une adresse prouvee part sans rien demander`() {
        val gate = FakeGate(unproven = false).also { registry.current = it }
        server.enqueue(MockResponse().setResponseCode(200).setBody("{}"))

        val response = post("/api/v1/invitations/email")

        assertThat(response.code).isEqualTo(200)
        assertThat(gate.reasons).isEmpty()
    }

    @Test
    fun `publier n'est jamais retenu d'avance`() {
        val gate = FakeGate(unproven = true).also { registry.current = it }
        server.enqueue(MockResponse().setResponseCode(201).setBody("{}"))

        post("/api/v1/posts")

        assertThat(gate.unprovenAsked).isEqualTo(0)
        assertThat(gate.reasons).isEmpty()
    }

    @Test
    fun `un 403 d'une autre cause et une route non gardee passent telles quelles`() {
        val gate = FakeGate().also { registry.current = it }
        server.enqueue(MockResponse().setResponseCode(403).setBody("""{"success":false,"code":"FORBIDDEN"}"""))
        server.enqueue(MockResponse().setResponseCode(403).setBody(refusal))

        assertThat(post("/api/v1/posts").code).isEqualTo(403)
        assertThat(post("/api/v1/conversations/c1/messages").code).isEqualTo(403)

        assertThat(gate.reasons).isEmpty()
    }

    @Test
    fun `sans gardien pose le refus passe tel quel`() {
        server.enqueue(MockResponse().setResponseCode(403).setBody(refusal))

        assertThat(post("/api/v1/posts").code).isEqualTo(403)
        assertThat(server.requestCount).isEqualTo(1)
    }
}
