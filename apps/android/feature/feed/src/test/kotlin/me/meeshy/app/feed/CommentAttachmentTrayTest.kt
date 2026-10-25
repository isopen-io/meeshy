package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.UploadedMedia
import org.junit.Test

/** Le bandeau des pièces d'un commentaire (#12972) — miroir de `CommentAttachmentsTray` (iOS). */
class CommentAttachmentTrayTest {

    private fun photo(name: String = "a.jpg") = MediaUploadItem(byteArrayOf(1, 2), name, "image/jpeg")
    private fun uploaded(id: String) = UploadedMedia(id, "https://x/$id.jpg", "image/jpeg", 2, 10, 10, null, null)

    @Test
    fun `une piece ajoutee se televerse, et le commentaire n attend plus une fois televersee`() {
        val adding = CommentAttachmentTray().adding("p1", photo())
        assertThat(adding.isUploading).isTrue()
        assertThat(adding.attachmentIds).isEmpty()
        val ready = adding.uploaded("p1", uploaded("m1"))
        assertThat(ready.isUploading).isFalse()
        assertThat(ready.attachmentIds).containsExactly("m1")
        assertThat(ready.hasMedia).isTrue()
    }

    @Test
    fun `une piece retouchee remplace l autre a sa place, et se televerse de nouveau`() {
        val tray = CommentAttachmentTray().adding("p1", photo()).uploaded("p1", uploaded("m1"))
            .adding("p2", photo("b.jpg")).uploaded("p2", uploaded("m2"))
        val replaced = tray.replacing("p1", photo("a_retouche.jpg"))
        assertThat(replaced.pieces.map { it.id }).containsExactly("p1", "p2").inOrder()
        assertThat(replaced.pieces.first().item.fileName).isEqualTo("a_retouche.jpg")
        assertThat(replaced.attachmentIds).containsExactly("m2")
        assertThat(replaced.uploaded("p1", uploaded("m3")).attachmentIds).containsExactly("m3", "m2").inOrder()
    }

    @Test
    fun `un televersement rate ou une piece retiree quitte le bandeau, et un televersement en retard ne la ramene pas`() {
        val tray = CommentAttachmentTray().adding("p1", photo()).adding("p2", photo())
        assertThat(tray.failed("p1").pieces.map { it.id }).containsExactly("p2")
        val removed = tray.removing("p2")
        assertThat(removed.uploaded("p2", uploaded("m2")).pieces.map { it.id }).containsExactly("p1")
    }

    @Test
    fun `le bandeau se borne au plafond des medias d un post`() {
        val full = (1..CommentAttachmentTray.MAX_PIECES).fold(CommentAttachmentTray()) { tray, i -> tray.adding("p$i", photo()) }
        assertThat(full.isFull).isTrue()
        assertThat(full.adding("extra", photo()).pieces).hasSize(CommentAttachmentTray.MAX_PIECES)
    }
}
