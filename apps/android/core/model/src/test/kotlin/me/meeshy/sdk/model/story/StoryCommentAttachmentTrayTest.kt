package me.meeshy.sdk.model.story

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryCommentAttachmentTrayTest {

    private fun piece(id: String, uploaded: String? = null) =
        StoryCommentPiece(id = id, localPath = "/cache/$id", fileName = "$id.jpg", mimeType = "image/jpeg", uploadedId = uploaded)

    @Test
    fun `a story comment carries a single media like on iOS`() {
        val tray = StoryCommentAttachmentTray().adding(piece("a"))
        assertThat(tray.isFull).isTrue()
        assertThat(tray.adding(piece("b"))).isSameInstanceAs(tray)
        assertThat(tray.pieces.map { it.id }).containsExactly("a")
    }

    @Test
    fun `removing frees the slot and an unknown id changes nothing`() {
        val tray = StoryCommentAttachmentTray().adding(piece("a"))
        assertThat(tray.removing("zz")).isSameInstanceAs(tray)
        val emptied = tray.removing("a")
        assertThat(emptied.hasMedia).isFalse()
        assertThat(emptied.adding(piece("b")).pieces).hasSize(1)
    }

    @Test
    fun `the tray is uploading until every piece has its server id`() {
        val tray = StoryCommentAttachmentTray().adding(piece("a"))
        assertThat(tray.isUploading).isTrue()
        assertThat(tray.attachmentIds).isEmpty()
        val done = tray.uploaded("a", "srv-1")
        assertThat(done.isUploading).isFalse()
        assertThat(done.attachmentIds).containsExactly("srv-1")
    }

    @Test
    fun `an answer for a removed piece does not bring it back`() {
        val tray = StoryCommentAttachmentTray().adding(piece("a")).removing("a")
        assertThat(tray.uploaded("a", "srv-1").hasMedia).isFalse()
    }

    @Test
    fun `a failed upload drops the piece`() {
        assertThat(StoryCommentAttachmentTray().adding(piece("a")).failed("a").hasMedia).isFalse()
    }

    @Test
    fun `restoring a refused comment fills the free slots only`() {
        val restored = StoryCommentAttachmentTray().restoring(listOf(piece("a", "srv"), piece("b")))
        assertThat(restored.pieces.map { it.id }).containsExactly("a")
        assertThat(restored.attachmentIds).containsExactly("srv")
    }
}
