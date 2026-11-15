package me.meeshy.sdk.media

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.imageedit.NormalizedCrop
import org.junit.Test

/** Le recadrage d'une vidéo se traduit en coordonnées normalisées du GPU, y vers le haut. */
class RetouchVideoExporterTest {

    @Test
    fun `la prise entiere couvre tout l espace du GPU`() {
        assertThat(RetouchVideoExporter.ndc(NormalizedCrop(0f, 0f, 1f, 1f)).toList()).containsExactly(-1f, 1f, -1f, 1f).inOrder()
    }

    @Test
    fun `la moitie haute garde le haut du GPU`() {
        assertThat(RetouchVideoExporter.ndc(NormalizedCrop(0f, 0f, 1f, 0.5f)).toList()).containsExactly(-1f, 1f, 0f, 1f).inOrder()
    }

    @Test
    fun `un carre centre se borne de part et d autre du centre`() {
        assertThat(RetouchVideoExporter.ndc(NormalizedCrop(0.25f, 0f, 0.5f, 1f)).toList()).containsExactly(-0.5f, 0.5f, -1f, 1f).inOrder()
    }
}
