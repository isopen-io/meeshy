package me.meeshy.sdk.media

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.dao.TusUploadCheckpointDao
import me.meeshy.core.database.entity.TusUploadCheckpointEntity
import me.meeshy.sdk.model.media.TusUploadContext
import me.meeshy.sdk.net.InMemoryTokenStore
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Test

/**
 * Un envoi tus interrompu reprend SEUL, depuis ce que la passerelle a reçu (#13959) : le client réel (Retrofit + le socle
 * d'intercepteurs) contre une passerelle simulée qui tient l'état d'une session. Avant, un bloc échoué rendait l'échec
 * tel quel et rien ne relançait ; la photo restait « Hors ligne » en Wi-Fi.
 */
class TusUploadResumeOverWireTest {

    private val gateway = FakeTusGateway()
    private val server = MockWebServer().apply { dispatcher = gateway; start() }
    private val config = MeeshyConfig(apiBaseUrl = server.url("/api/v1/").toString(), socketUrl = "x")
    private val api = MeeshyApi.create(config, InMemoryTokenStore()) {}
    private val repository = TusUploadRepository(
        api.tus,
        InMemoryCheckpoints(),
        OutgoingMediaSanitizer(InMemoryOutgoingPhotoLocationStore(), Dispatchers.Unconfined),
        config,
    )

    @After
    fun tearDown() = server.shutdown()

    private val bytes = ByteArray(TOTAL) { (it % 251).toByte() }
    private fun item() = MediaUploadItem(bytes = bytes, fileName = "notes.bin", mimeType = "application/octet-stream")

    @Test
    fun `a chunk that fails part way resumes from the offset the gateway reports, on the same session`() = runTest {
        gateway.failures = 1

        val result = repository.upload(item(), TusUploadContext.STORY)

        assertThat(result).isInstanceOf(NetworkResult.Success::class.java)
        assertThat((result as NetworkResult.Success).data.single().id).isEqualTo("pm1")
        assertThat(gateway.created).isEqualTo(1)
        assertThat(gateway.heads).isEqualTo(1)
        assertThat(gateway.patchOffsets).containsExactly(0L, PARTIAL.toLong()).inOrder()
        assertThat(gateway.received()).isEqualTo(bytes)
    }

    @Test
    fun `a gateway that keeps failing is retried a bounded number of times, then the failure is said`() = runTest {
        gateway.failures = Int.MAX_VALUE

        val result = repository.upload(item(), TusUploadContext.STORY)

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
        assertThat((result as NetworkResult.Failure).error.httpStatus).isEqualTo(500)
        assertThat(gateway.patchOffsets).hasSize(1 + TusUploadRepository.MAX_RESUMES)
        assertThat(gateway.created).isEqualTo(1)
    }

    /** Une passerelle tus d'UNE session : chaque PATCH qui échoue en a quand même écrit [PARTIAL] octets, comme `@tus/server`. */
    private class FakeTusGateway : Dispatcher() {
        var failures = 0
        var created = 0
        var heads = 0
        val patchOffsets = mutableListOf<Long>()
        private val stored = java.io.ByteArrayOutputStream()

        fun received(): ByteArray = stored.toByteArray()

        @Synchronized
        override fun dispatch(request: RecordedRequest): MockResponse = when (request.method) {
            "POST" -> {
                created++
                MockResponse().setResponseCode(201).setHeader("Location", request.requestUrl!!.resolve("uploads/s1").toString())
            }
            "HEAD" -> {
                heads++
                MockResponse().setHeader("Upload-Offset", stored.size().toString())
            }
            "PATCH" -> patch(request)
            else -> MockResponse().setResponseCode(405)
        }

        private fun patch(request: RecordedRequest): MockResponse {
            val offset = request.getHeader("Upload-Offset")!!.toLong()
            patchOffsets += offset
            if (offset != stored.size().toLong()) return MockResponse().setResponseCode(409)
            val body = request.body.readByteArray()
            if (failures > 0) {
                failures--
                stored.write(body, 0, minOf(body.size, (PARTIAL - offset).toInt().coerceAtLeast(0)))
                return MockResponse().setResponseCode(500)
            }
            stored.write(body)
            if (stored.size() < TOTAL) return MockResponse().setResponseCode(204).setHeader("Upload-Offset", stored.size().toString())
            return MockResponse().setHeader("Content-Type", "application/json")
                .setBody("""{"success":true,"data":{"attachment":{"id":"pm1","fileUrl":"/api/v1/attachments/file/pm1","mimeType":"application/octet-stream"}}}""")
        }
    }

    private class InMemoryCheckpoints : TusUploadCheckpointDao {
        private val rows = mutableMapOf<String, TusUploadCheckpointEntity>()
        override suspend fun find(checkpointKey: String) = rows[checkpointKey]
        override suspend fun upsert(row: TusUploadCheckpointEntity) { rows[row.checkpointKey] = row }
        override suspend fun delete(checkpointKey: String) { rows.remove(checkpointKey) }
        override suspend fun clear() = rows.clear()
    }

    private companion object {
        const val TOTAL = 4_000
        const val PARTIAL = 1_500
    }
}
