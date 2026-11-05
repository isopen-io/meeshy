package me.meeshy.sdk.net

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.runBlocking
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Test
import java.net.SocketTimeoutException
import java.util.concurrent.TimeUnit

/**
 * Un bloc tus attend la réponse du serveur bien plus longtemps qu'une requête JSON (#13959) : le dernier PATCH d'une photo
 * de 2,85 Mo tombait en `SocketTimeoutException` au délai de lecture par défaut d'OkHttp (10 s), pendant que la passerelle
 * rendait encore ses variantes. Le client est ici le VRAI socle ([builtInContributors]), sur un délai de base resserré pour
 * que le témoin tienne en une seconde.
 */
class UploadTransferTimeoutsTest {

    private fun client(): OkHttpClient = HttpClientAssembler.build(
        builtInContributors(MeeshyConfig(), InMemoryTokenStore(), {}, SessionRefresher(InMemoryTokenStore()) { null }),
        OkHttpClient.Builder().readTimeout(BASE_READ_MILLIS, TimeUnit.MILLISECONDS),
    )

    private fun slowServer(): MockWebServer = MockWebServer().apply {
        enqueue(MockResponse().setResponseCode(204).setHeadersDelay(SERVER_THINKS_MILLIS, TimeUnit.MILLISECONDS))
        start()
    }

    private fun patch(server: MockWebServer, type: String) = Request.Builder()
        .url(server.url("/api/v1/uploads/abc"))
        .patch(ByteArray(CHUNK_BYTES).toRequestBody(type.toMediaType()))
        .header("Upload-Offset", "0")
        .build()

    @Test
    fun `a tus chunk whose answer comes after the default read timeout still lands`() {
        val server = slowServer()
        try {
            val code = runBlocking { client().newCall(patch(server, UploadTransferTimeouts.MEDIA_TYPE)).execute().use { it.code } }

            assertThat(code).isEqualTo(204)
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun `an ordinary request keeps the default read timeout`() {
        val server = slowServer()
        try {
            val failure = runCatching { client().newCall(patch(server, "application/json")).execute().close() }.exceptionOrNull()

            assertThat(failure).isInstanceOf(SocketTimeoutException::class.java)
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun `the wait for a chunk's answer grows with the chunk and stays bounded`() {
        val small = UploadTransferTimeouts.readMillis(2_851_473L)
        val full = UploadTransferTimeouts.readMillis(10L * 1024 * 1024)

        assertThat(small).isAtLeast(60_000L)
        assertThat(full).isGreaterThan(small)
        assertThat(UploadTransferTimeouts.readMillis(Long.MAX_VALUE)).isEqualTo(UploadTransferTimeouts.MAX_READ_MILLIS)
        assertThat(UploadTransferTimeouts.readMillis(-1L)).isEqualTo(UploadTransferTimeouts.readMillis(0L))
    }

    private companion object {
        const val BASE_READ_MILLIS = 250L
        const val SERVER_THINKS_MILLIS = 900L
        const val CHUNK_BYTES = 64 * 1024
    }
}
