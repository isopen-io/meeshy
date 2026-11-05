package me.meeshy.sdk.media

import com.google.common.truth.Truth.assertThat
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody
import okio.Buffer
import okio.BufferedSink
import org.junit.Test

class ProgressRequestBodyTest {

    private fun chunked(chunks: Int, chunkSize: Int): RequestBody = object : RequestBody() {
        override fun contentType() = "video/mp4".toMediaType()
        override fun contentLength(): Long = (chunks * chunkSize).toLong()
        override fun writeTo(sink: BufferedSink) {
            repeat(chunks) { sink.write(ByteArray(chunkSize)) }
        }
    }

    private fun run(body: RequestBody): Buffer = Buffer().also { body.writeTo(it) }

    @Test
    fun `les octets passent intacts et la taille et le type restent ceux de la piece`() {
        val delegate = chunked(chunks = 10, chunkSize = 100)
        val body = ProgressRequestBody(delegate) { _, _ -> }

        assertThat(run(body).size).isEqualTo(1000L)
        assertThat(body.contentLength()).isEqualTo(1000L)
        assertThat(body.contentType()).isEqualTo(delegate.contentType())
    }

    @Test
    fun `chaque pourcent entier est publie une fois, croissant, jusqu'au total`() {
        val seen = mutableListOf<Pair<Long, Long>>()

        run(ProgressRequestBody(chunked(chunks = 1000, chunkSize = 10)) { sent, total -> seen += sent to total })

        assertThat(seen.map { it.second }.distinct()).containsExactly(10_000L)
        assertThat(seen.map { it.first }).isInOrder()
        assertThat(seen.map { it.first * 100 / it.second }.distinct()).hasSize(seen.size)
        assertThat(seen.last().first).isEqualTo(10_000L)
        assertThat(seen.size).isAtMost(100)
    }

    @Test
    fun `une taille inconnue ne publie rien`() {
        val unknown = object : RequestBody() {
            override fun contentType() = null
            override fun contentLength(): Long = -1L
            override fun writeTo(sink: BufferedSink) { sink.write(ByteArray(64)) }
        }
        val seen = mutableListOf<Long>()

        run(ProgressRequestBody(unknown) { sent, _ -> seen += sent })

        assertThat(seen).isEmpty()
    }

    @Test
    fun `un envoi rejoue repart de zero`() {
        val seen = mutableListOf<Long>()
        val body = ProgressRequestBody(chunked(chunks = 4, chunkSize = 25)) { sent, _ -> seen += sent }

        run(body)
        run(body)

        assertThat(seen).containsExactly(25L, 50L, 75L, 100L, 25L, 50L, 75L, 100L).inOrder()
    }
}
