package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import org.junit.Test

class StoryVideoUploadFileTest {

    @Test
    fun `a compressed video is sent in place of the source and marked derived`() = runTest {
        val file = StoryVideoUploadFile.prepared("/tmp/in.mov") { "/tmp/out.mp4" }
        assertThat(file).isEqualTo(StoryVideoUploadFile("/tmp/out.mp4", "video/mp4", isDerived = true))
    }

    @Test
    fun `a failing compression falls back on the source with a video mime`() = runTest {
        val file = StoryVideoUploadFile.prepared("/tmp/in.mov") { throw IllegalStateException("codec") }
        assertThat(file.path).isEqualTo("/tmp/in.mov")
        assertThat(file.mimeType).startsWith("video/")
        assertThat(file.isDerived).isFalse()
    }

    @Test
    fun `a compressor with nothing to produce falls back on the source`() = runTest {
        val file = StoryVideoUploadFile.prepared("/tmp/in.mp4") { null }
        assertThat(file).isEqualTo(StoryVideoUploadFile("/tmp/in.mp4", "video/mp4", isDerived = false))
    }

    @Test
    fun `an unrecognised extension is still sent as a video`() = runTest {
        val file = StoryVideoUploadFile.prepared("/tmp/clip.bin") { null }
        assertThat(file.mimeType).isEqualTo("video/mp4")
    }

    @Test
    fun `a compressor returning the source is not derived`() = runTest {
        val file = StoryVideoUploadFile.prepared("/tmp/in.mp4") { "/tmp/in.mp4" }
        assertThat(file.isDerived).isFalse()
    }
}
