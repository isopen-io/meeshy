package me.meeshy.ui.component.focal

import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.component.bubble.BubbleFile
import me.meeshy.ui.component.bubble.BubbleImage
import me.meeshy.ui.component.bubble.BubbleVideo
import org.junit.Test

class FocalMediaGridTest {

    private fun content(images: Int = 0, videos: Int = 0) = BubbleContent(
        messageId = "m1",
        text = "",
        isOutgoing = false,
        isTranslated = false,
        originalText = null,
        senderName = null,
        showSenderName = false,
        isEdited = false,
        isDeleted = false,
        createdAtIso = null,
        images = List(images) { BubbleImage(attachmentId = "i$it", url = "https://x/$it.jpg") },
        videos = List(videos) { BubbleVideo(attachmentId = "v$it", url = "https://x/$it.mp4") },
        files = List(videos) { BubbleFile(attachmentId = "v$it", name = "v$it.mp4", url = "https://x/$it.mp4", isVideo = true) },
    )

    @Test
    fun `une image seule remplit 300 par 240`() {
        val sizes = focalCellSizes(1, 300f, soloVideoRatio = null)
        assertThat(sizes.map { it.width to it.height }).containsExactly(300f to 240f)
    }

    @Test
    fun `une vidéo seule suit son format`() {
        val sizes = focalCellSizes(1, 300f, soloVideoRatio = 16f / 9f)
        assertThat(sizes.single().width).isEqualTo(300f)
        assertThat(sizes.single().height).isEqualTo(169f)
    }

    @Test
    fun `deux médias se partagent la largeur moins l'espacement`() {
        val sizes = focalCellSizes(2, 300f, null)
        assertThat(sizes.map { it.width }).containsExactly(149f, 149f)
    }

    @Test
    fun `trois médias se coupent en 60 40 et la colonne de droite se partage 240`() {
        val sizes = focalCellSizes(3, 300f, null)
        assertThat(sizes[0].width).isWithin(0.01f).of(178.8f)
        assertThat(sizes[1].width).isWithin(0.01f).of(119.2f)
        assertThat(sizes.map { it.height }).containsExactly(240f, 119f, 119f).inOrder()
    }

    @Test
    fun `quatre médias et plus forment un deux par deux et la quatrième case compte le reste`() {
        val sizes = focalCellSizes(7, 300f, null)
        assertThat(sizes).hasSize(4)
        assertThat(sizes.map { it.height }.distinct()).containsExactly(119f)
        assertThat(sizes.map { it.overflowCount }).containsExactly(0, 0, 0, 3).inOrder()
    }

    @Test
    fun `une colonne étroite réduit la grille sans jamais la dépasser`() {
        val sizes = focalCellSizes(2, 200f, null)
        assertThat(sizes.sumOf { it.width.toDouble() } + 2).isAtMost(200.0)
    }

    @Test
    fun `les photos précèdent les vidéos dans la même grille`() {
        val visuals = focalVisuals(content(images = 2, videos = 1))
        assertThat(visuals.map { it.attachmentId }).containsExactly("i0", "i1", "v0").inOrder()
        assertThat((visuals[1] as FocalVisual.Photo).imageIndex).isEqualTo(1)
        assertThat((visuals[2] as FocalVisual.Clip).file).isNotNull()
    }

    @Test
    fun `la protection d'une case vient de sa propre pièce`() {
        val visual = FocalVisual.Photo(BubbleImage("i", "u", isViewOnce = true, viewOnceCount = 2), 0)
        assertThat(visual.media.isViewOnce).isTrue()
        assertThat(visual.media.viewOnceCount).isEqualTo(2)
        assertThat(visual.media.isBlurred).isFalse()
    }
}
