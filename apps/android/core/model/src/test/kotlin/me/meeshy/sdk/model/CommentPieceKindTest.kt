package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CommentPieceKindTest {

    @Test
    fun `photos, videos and voice keep their own rendering`() {
        assertThat(CommentPieceKind.of("image/jpeg")).isEqualTo(CommentPieceKind.IMAGE)
        assertThat(CommentPieceKind.of("Video/MP4")).isEqualTo(CommentPieceKind.VIDEO)
        assertThat(CommentPieceKind.of("audio/mp4")).isEqualTo(CommentPieceKind.AUDIO)
    }

    @Test
    fun `everything else is a file, an unknown type included`() {
        listOf("application/pdf", "application/zip", "text/plain", "", null).forEach {
            assertThat(CommentPieceKind.of(it)).isEqualTo(CommentPieceKind.FILE)
        }
    }

    @Test
    fun `only photos and videos are drawn as thumbnails`() {
        assertThat(CommentPieceKind.entries.filter { it.isVisual }).containsExactly(CommentPieceKind.IMAGE, CommentPieceKind.VIDEO)
    }
}
