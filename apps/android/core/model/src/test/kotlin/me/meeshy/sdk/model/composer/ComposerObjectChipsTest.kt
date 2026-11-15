package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ComposerObjectChipsTest {

    @Test
    fun `la fenetre se dit en timecodes et manque pour un permanent`() {
        assertThat(ComposerObjectChips.window(2.0, 6.0)).isEqualTo("0:02 → 0:08")
        assertThat(ComposerObjectChips.window(null, 70.0)).isEqualTo("0:00 → 1:10")
        assertThat(ComposerObjectChips.window(1.0, null)).isNull()
    }

    @Test
    fun `un texte annonce taille et pointe vers sa section`() {
        val chips = ComposerObjectChips.textChips("neon", 38.0, "center", 1.0, 2.0)
        assertThat(chips.map { it.id }).containsExactly("style", "size", "align", "window").inOrder()
        assertThat(ComposerObjectChips.destination("align", chips))
            .isEqualTo(ComposerObjectEditorSection.Tool(TextEditTool.ALIGN))
        assertThat(ComposerObjectChips.destination("window", chips)).isEqualTo(ComposerObjectEditorSection.Timing)
    }

    @Test
    fun `une image n annonce ni son ni rotation nulle`() {
        val chips = ComposerObjectChips.mediaChips(1.0, 0.0, isVideo = false, volume = 0.2, start = null, duration = null)
        assertThat(chips.map { it.id }).containsExactly("size")
    }

    @Test
    fun `une video au volume modifie annonce le son`() {
        val ids = ComposerObjectChips.mediaChips(1.0, 15.0, true, 0.5, null, null).map { it.id }
        assertThat(ids).containsExactly("size", "rotation", "volume").inOrder()
    }

    @Test
    fun `le jeton de fenetre d un sticker mene a apparition`() {
        val chips = ComposerObjectChips.stickerChips(1.0, 0.0, 0.0, 3.0)
        assertThat(chips.last().destination).isEqualTo(ComposerObjectEditorSection.Timing)
    }
}
