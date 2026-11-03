package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AttachmentTilePresentationTest {

    private fun ready(
        type: PendingAttachmentType,
        thumb: String? = null,
        path: String? = "/files/p",
        mime: String? = null,
    ) = PendingAttachment(
        id = "p",
        type = type,
        fileName = "p",
        mimeType = mime,
        localPath = path,
        thumbnailPath = thumb,
        phase = PendingAttachmentPhase.Ready,
    )

    @Test
    fun `une photo prete montre sa vignette`() {
        val face = AttachmentTilePresentation.of(ready(PendingAttachmentType.IMAGE, thumb = "/t.jpg")).face
        assertThat(face).isEqualTo(TileFace.Thumbnail("/t.jpg"))
    }

    @Test
    fun `une photo sans vignette retombe sur son fichier`() {
        val face = AttachmentTilePresentation.of(ready(PendingAttachmentType.IMAGE)).face
        assertThat(face).isEqualTo(TileFace.Thumbnail("/files/p"))
    }

    @Test
    fun `un son se dessine en onde meme avec une vignette`() {
        val face = AttachmentTilePresentation.of(ready(PendingAttachmentType.AUDIO, thumb = "/t")).face
        assertThat(face).isEqualTo(TileFace.Waveform)
    }

    @Test
    fun `un fichier sans vignette montre le glyphe de son type`() {
        val face = AttachmentTilePresentation.of(ready(PendingAttachmentType.FILE)).face
        assertThat(face).isEqualTo(TileFace.TypeGlyph(PendingAttachmentType.FILE))
    }

    @Test
    fun `une video sans vignette montre le glyphe video`() {
        val face = AttachmentTilePresentation.of(ready(PendingAttachmentType.VIDEO)).face
        assertThat(face).isEqualTo(TileFace.TypeGlyph(PendingAttachmentType.VIDEO))
    }

    @Test
    fun `le glyphe Editer n existe que si toucher edite`() {
        assertThat(AttachmentTilePresentation.of(ready(PendingAttachmentType.IMAGE, mime = "image/jpeg")).showsEditGlyph).isTrue()
        assertThat(AttachmentTilePresentation.of(ready(PendingAttachmentType.FILE)).showsEditGlyph).isFalse()
        assertThat(AttachmentTilePresentation.of(ready(PendingAttachmentType.IMAGE, mime = "image/gif")).showsEditGlyph).isFalse()
    }

    @Test
    fun `toucher edite quand l editeur s ouvre, sinon apercoit`() {
        assertThat(AttachmentTilePresentation.of(ready(PendingAttachmentType.VIDEO)).tapAction).isEqualTo(TileTapAction.EDIT)
        assertThat(AttachmentTilePresentation.of(ready(PendingAttachmentType.FILE)).tapAction).isEqualTo(TileTapAction.PREVIEW)
    }

    @Test
    fun `sans editeur disponible toucher retombe sur l apercu et le glyphe disparait`() {
        val p = AttachmentTilePresentation.of(ready(PendingAttachmentType.IMAGE), editorAvailable = false)
        assertThat(p.tapAction).isEqualTo(TileTapAction.PREVIEW)
        assertThat(p.showsEditGlyph).isFalse()
    }
}
