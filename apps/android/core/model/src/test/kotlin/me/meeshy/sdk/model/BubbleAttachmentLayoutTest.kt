package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.AttachmentPieceClass.*
import me.meeshy.sdk.model.BubbleAttachmentLayout.Companion.Piece
import org.junit.Test

class BubbleAttachmentLayoutTest {

    private fun layout(vararg pieces: Pair<String, AttachmentPieceClass>) =
        BubbleAttachmentLayout.of(pieces.map { Piece(it.first, it.second) })

    @Test
    fun `une image et une video donnent une grille de deux dans l ordre`() {
        assertThat(layout("a" to Image, "b" to Video)).isEqualTo(BubbleAttachmentLayout.VisualGrid(listOf("a", "b")))
        assertThat(layout("b" to Video, "a" to Image)).isEqualTo(BubbleAttachmentLayout.VisualGrid(listOf("b", "a")))
    }

    @Test
    fun `image et pdf donnent Mixed`() {
        assertThat(layout("a" to Image, "f" to File))
            .isEqualTo(BubbleAttachmentLayout.Mixed(listOf("a"), emptyList(), listOf("f")))
    }

    @Test
    fun `trois vocaux donnent Audio de trois`() {
        assertThat(layout("1" to Audio, "2" to Audio, "3" to Audio)).isEqualTo(BubbleAttachmentLayout.Audio(listOf("1", "2", "3")))
    }

    @Test
    fun `fichier contact et position sont non media`() {
        assertThat(layout("f" to File, "c" to Contact, "l" to Location))
            .isEqualTo(BubbleAttachmentLayout.NonMedia(listOf("f", "c", "l")))
    }

    @Test
    fun `sans piece aucune mise en page`() {
        assertThat(BubbleAttachmentLayout.of(emptyList())).isEqualTo(BubbleAttachmentLayout.None)
    }

    @Test
    fun `audio et image donnent Mixed avec les trois listes`() {
        assertThat(layout("v" to Audio, "i" to Image))
            .isEqualTo(BubbleAttachmentLayout.Mixed(listOf("i"), listOf("v"), emptyList()))
    }
}
