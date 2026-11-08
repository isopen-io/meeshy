package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class TusCheckpointContentKeyTest {
    private val digest = "ab".repeat(32)

    @Test
    fun `the same content under the same declaration gives the same key`() {
        val a = TusCheckpointKey.ofContent(digest, TusUploadContext.STORY, thumbHash = "th")
        val b = TusCheckpointKey.ofContent(digest, TusUploadContext.STORY, thumbHash = "th")

        assertThat(a).isEqualTo(b)
        assertThat(a).startsWith("$digest|postMedia|")
    }

    @Test
    fun `a different content gives a different key`() {
        val a = TusCheckpointKey.ofContent("aa", TusUploadContext.POST)
        val b = TusCheckpointKey.ofContent("bb", TusUploadContext.POST)

        assertThat(a).isNotEqualTo(b)
    }

    @Test
    fun `the four publication contexts share one server object, a chat attachment never joins them`() {
        val story = TusCheckpointKey.ofContent(digest, TusUploadContext.STORY)
        val post = TusCheckpointKey.ofContent(digest, TusUploadContext.POST)
        val attachment = TusCheckpointKey.ofContent(digest, TusUploadContext.ATTACHMENT)

        assertThat(story).isEqualTo(post)
        assertThat(attachment).isNotEqualTo(story)
        assertThat(attachment).startsWith("$digest|attachment|")
    }

    @Test
    fun `a session opened without a transcription is never resumed by a voice that carries one`() {
        val without = TusCheckpointKey.ofContent(digest, TusUploadContext.ATTACHMENT)
        val with = TusCheckpointKey.ofContent(digest, TusUploadContext.ATTACHMENT, transcription = TusTranscription("a", "fr"))

        assertThat(with).isNotEqualTo(without)
    }

    @Test
    fun `a capture and a thumbhash each change the key`() {
        val base = TusCheckpointKey.ofContent(digest, TusUploadContext.ATTACHMENT)

        assertThat(TusCheckpointKey.ofContent(digest, TusUploadContext.ATTACHMENT, capturedInApp = true)).isNotEqualTo(base)
        assertThat(TusCheckpointKey.ofContent(digest, TusUploadContext.ATTACHMENT, thumbHash = "x")).isNotEqualTo(base)
    }

    @Test
    fun `without context nor declaration the key is the bare digest`() {
        assertThat(TusCheckpointKey.ofContent(digest, null)).isEqualTo(digest)
    }
}
