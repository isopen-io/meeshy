package me.meeshy.sdk.sync

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.net.InMemoryTokenStore
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.api.SyncApi
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Test

class SyncDeltaClientTest {

    private val server = MockWebServer().apply { start() }
    private val config = MeeshyConfig(apiBaseUrl = server.url("/api/v1/").toString(), socketUrl = "x")
    private val api = MeeshyApi.create(config, InMemoryTokenStore()) {}
    private val seq = SyncSeqTracker().apply { observe(41L) }
    private val client = SyncDeltaClient(api.service(SyncApi::class.java), seq)

    @After
    fun tearDown() = server.shutdown()

    private fun page(rows: String, truncated: Boolean = false, cursor: String? = null, hasGap: Boolean = false) =
        """{"success":true,"data":{"checkpoint":"2026-10-02T10:00:00.000Z","hasGap":$hasGap,"hasMore":$truncated,
            "collections":{"conversations":{"added":[$rows],"modified":[],"deleted":[],"truncated":$truncated,
            "nextCursor":${cursor?.let { "\"$it\"" } ?: "null"}}}}}"""

    private fun ok(body: String, etag: String? = null) =
        MockResponse().setResponseCode(200).setHeader("Content-Type", "application/json").apply { etag?.let { setHeader("ETag", it) } }.setBody(body)

    private val request = SyncDeltaRequest(since = "2026-10-01T00:00:00.000Z")

    @Test
    fun `la requete porte since, collections et le seq annonce`() = runTest {
        server.enqueue(ok(page("""{"id":"c1"}"""), etag = "\"v1\""))

        val outcome = client.conversationsDelta(request) as SyncDeltaOutcome.Delta

        val url = server.takeRequest().requestUrl!!
        assertThat(url.encodedPath).isEqualTo("/api/v1/sync")
        assertThat(url.queryParameter("since")).isEqualTo("2026-10-01T00:00:00.000Z")
        assertThat(url.queryParameter("collections")).isEqualTo("conversations")
        assertThat(url.queryParameter("seq")).isEqualTo("41")
        assertThat(url.queryParameter("cursor")).isNull()
        assertThat(outcome.rows.map { it.id }).containsExactly("c1")
        assertThat(outcome.complete).isTrue()
        assertThat(outcome.validator).isEqualTo("\"v1\"")
        assertThat(outcome.checkpoint).isEqualTo("2026-10-02T10:00:00.000Z")
    }

    @Test
    fun `un 304 sur validateur ne decode rien`() = runTest {
        server.enqueue(MockResponse().setResponseCode(304))

        val outcome = client.conversationsDelta(request.copy(validator = "\"v1\""))

        assertThat(server.takeRequest().getHeader("If-None-Match")).isEqualTo("\"v1\"")
        assertThat(outcome).isEqualTo(SyncDeltaOutcome.NotModified)
    }

    @Test
    fun `une page tronquee continue par curseur et le validateur tombe`() = runTest {
        server.enqueue(ok(page("""{"id":"c1"}""", truncated = true, cursor = "abc"), etag = "\"p1\""))
        server.enqueue(ok(page("""{"id":"c2"}""")))

        val outcome = client.conversationsDelta(request) as SyncDeltaOutcome.Delta

        server.takeRequest()
        assertThat(server.takeRequest().requestUrl!!.queryParameter("cursor")).isEqualTo("abc")
        assertThat(outcome.rows.map { it.id }).containsExactly("c1", "c2").inOrder()
        assertThat(outcome.complete).isTrue()
        assertThat(outcome.validator).isNull()
    }

    @Test
    fun `un trou n'est pas une fenetre complete`() = runTest {
        server.enqueue(ok(page("""{"id":"c1"}""", hasGap = true)))

        val outcome = client.conversationsDelta(request) as SyncDeltaOutcome.Delta

        assertThat(outcome.hasGap).isTrue()
        assertThat(outcome.complete).isFalse()
    }

    @Test
    fun `404 et 501 d'un ancien serveur sont une indisponibilite`() = runTest {
        server.enqueue(MockResponse().setResponseCode(404).setBody("""{"success":false,"error":"nf"}"""))
        server.enqueue(MockResponse().setResponseCode(501))

        assertThat(client.conversationsDelta(request)).isInstanceOf(SyncDeltaOutcome.Unavailable::class.java)
        assertThat(client.conversationsDelta(request)).isInstanceOf(SyncDeltaOutcome.Unavailable::class.java)
    }

    @Test
    fun `UNSUPPORTED_COLLECTION et un corps illisible sont une indisponibilite`() = runTest {
        server.enqueue(MockResponse().setResponseCode(400).setBody("""{"success":false,"error":{"code":"UNSUPPORTED_COLLECTION"}}"""))
        server.enqueue(ok("pas du json"))

        assertThat(client.conversationsDelta(request)).isInstanceOf(SyncDeltaOutcome.Unavailable::class.java)
        assertThat(client.conversationsDelta(request)).isInstanceOf(SyncDeltaOutcome.Unavailable::class.java)
    }
}
