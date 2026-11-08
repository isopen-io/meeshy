package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ComposerPanelHandleLawTest {
    private fun outcome(t: Float, p: Float = t) = ComposerPanelHandleLaw.outcome(t, p)

    @Test
    fun `glisser de 44 dp vers le haut ouvre la photothèque`() {
        assertThat(outcome(-44f)).isEqualTo(ComposerPanelHandleOutcome.OPEN_FULL_LIBRARY)
    }

    @Test
    fun `glisser de 44 dp vers le bas ferme`() {
        assertThat(outcome(44f)).isEqualTo(ComposerPanelHandleOutcome.CLOSE_PANEL)
    }

    @Test
    fun `un geste court est ignoré`() {
        assertThat(outcome(-43f)).isEqualTo(ComposerPanelHandleOutcome.IGNORE)
        assertThat(outcome(43f)).isEqualTo(ComposerPanelHandleOutcome.IGNORE)
        assertThat(outcome(0f)).isEqualTo(ComposerPanelHandleOutcome.IGNORE)
    }

    @Test
    fun `la course projetée double fait aboutir un flick court`() {
        assertThat(outcome(-10f, -88f)).isEqualTo(ComposerPanelHandleOutcome.OPEN_FULL_LIBRARY)
        assertThat(outcome(10f, 88f)).isEqualTo(ComposerPanelHandleOutcome.CLOSE_PANEL)
        assertThat(outcome(-10f, -87f)).isEqualTo(ComposerPanelHandleOutcome.IGNORE)
    }

    @Test
    fun `la projection ne l'emporte jamais contre le sens réel du doigt`() {
        assertThat(outcome(5f, -200f)).isEqualTo(ComposerPanelHandleOutcome.IGNORE)
        assertThat(outcome(-5f, 200f)).isEqualTo(ComposerPanelHandleOutcome.IGNORE)
        assertThat(outcome(0f, -200f)).isEqualTo(ComposerPanelHandleOutcome.IGNORE)
    }

    @Test
    fun `l'étirement monte de 140 dp, plafonné, sans jamais rétrécir`() {
        assertThat(ComposerLibraryHandoff.expandedHeight(324f, 900f)).isEqualTo(464f)
        assertThat(ComposerLibraryHandoff.expandedHeight(324f, 500f)).isEqualTo(360f)
        assertThat(ComposerLibraryHandoff.expandedHeight(324f, 400f)).isEqualTo(324f)
    }

    @Test
    fun `la cascade retarde de 40 ms par rang et se tait en mouvement réduit`() {
        assertThat(ComposerTileCascade.delayMs(0, false)).isEqualTo(0)
        assertThat(ComposerTileCascade.delayMs(5, false)).isEqualTo(200)
        assertThat(ComposerTileCascade.delayMs(5, true)).isEqualTo(0)
    }
}
