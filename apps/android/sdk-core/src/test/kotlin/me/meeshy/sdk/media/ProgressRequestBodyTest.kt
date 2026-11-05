package me.meeshy.sdk.media

import com.google.common.truth.Truth.assertThat
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody
import okio.Buffer
import okio.BufferedSink
import org.junit.Test

class ProgressRequestBodyTest {

    /** Okio ne descend un tronçon qu'une fois un segment plein : c'est le grain réel de la progression. */
    private companion object {
        const val SEGMENT = 8192
    }

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

        run(ProgressRequestBody(chunked(chunks = 200, chunkSize = SEGMENT)) { sent, total -> seen += sent to total })

        assertThat(seen.map { it.second }.distinct()).containsExactly(200L * SEGMENT)
        assertThat(seen.map { it.first }).isInOrder()
        assertThat(seen.map { it.first * 100 / it.second }.distinct()).hasSize(seen.size)
        assertThat(seen.last().first).isEqualTo(200L * SEGMENT)
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
        val body = ProgressRequestBody(chunked(chunks = 4, chunkSize = SEGMENT)) { sent, _ -> seen += sent }

        run(body)
        run(body)

        assertThat(seen).containsExactly(1L * SEGMENT, 2L * SEGMENT, 3L * SEGMENT, 4L * SEGMENT, 1L * SEGMENT, 2L * SEGMENT, 3L * SEGMENT, 4L * SEGMENT).inOrder()
    }
}
