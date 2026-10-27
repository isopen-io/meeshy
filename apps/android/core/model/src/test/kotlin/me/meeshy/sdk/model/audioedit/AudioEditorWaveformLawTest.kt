package me.meeshy.sdk.model.audioedit

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AudioEditorWaveformLawTest {

    @Test
    fun `chaque barre garde le pic de sa tranche`() {
        val bars = AudioEditorWaveformLaw.bars(listOf(0.1f, 0.9f, 0.2f, 0.3f), 2)
        assertThat(bars.toList()).containsExactly(0.9f, 0.3f).inOrder()
    }

    @Test
    fun `moins de niveaux que de barres s'étire sans trou`() {
        val bars = AudioEditorWaveformLaw.bars(listOf(0.5f, 1f), 4)
        assertThat(bars.toList()).containsExactly(0.5f, 0.5f, 1f, 1f).inOrder()
    }

    @Test
    fun `un relevé vide donne la ligne plate de repli`() {
        val bars = AudioEditorWaveformLaw.bars(emptyList(), 10)
        assertThat(bars.toSet()).containsExactly(AudioEditorWaveformLaw.FALLBACK_LEVEL)
    }

    @Test
    fun `les niveaux hors 0 à 1 sont bornés et un nombre de barres nul vaut une barre`() {
        assertThat(AudioEditorWaveformLaw.bars(listOf(2f, -1f), 0).toList()).containsExactly(1f)
    }

    @Test
    fun `le toucher saisit la poignée la plus proche dans la tolérance, sinon la tête`() {
        val g = { f: Double -> AudioEditorWaveformLaw.grab(f, 0.2, 0.8, slop = 0.05) }
        assertThat(g(0.22)).isEqualTo(AudioEditorWaveformGrab.SELECTION_START)
        assertThat(g(0.79)).isEqualTo(AudioEditorWaveformGrab.SELECTION_END)
        assertThat(g(0.5)).isEqualTo(AudioEditorWaveformGrab.SCRUB)
    }

    @Test
    fun `deux poignées superposées se saisissent de leur côté`() {
        val g = { f: Double -> AudioEditorWaveformLaw.grab(f, 0.5, 0.5, slop = 0.05) }
        assertThat(g(0.48)).isEqualTo(AudioEditorWaveformGrab.SELECTION_START)
        assertThat(g(0.52)).isEqualTo(AudioEditorWaveformGrab.SELECTION_END)
    }

    @Test
    fun `sans sélection le toucher ne fait que déplacer la tête`() {
        assertThat(AudioEditorWaveformLaw.grab(0.3, null, null, 0.05)).isEqualTo(AudioEditorWaveformGrab.SCRUB)
    }

    @Test
    fun `rôle d'une barre en rognage, en découpe et sans sélection`() {
        val trim = AudioEditorSelection(0.2, 0.8, isRemoval = false)
        assertThat(AudioEditorWaveformLaw.role(0.1, 0.5, trim)).isEqualTo(AudioEditorBarRole.OUTSIDE)
        assertThat(AudioEditorWaveformLaw.role(0.3, 0.5, trim)).isEqualTo(AudioEditorBarRole.PLAYED)
        assertThat(AudioEditorWaveformLaw.role(0.7, 0.5, trim)).isEqualTo(AudioEditorBarRole.KEPT)
        val cut = AudioEditorSelection(0.4, 0.6, isRemoval = true)
        assertThat(AudioEditorWaveformLaw.role(0.5, 0.0, cut)).isEqualTo(AudioEditorBarRole.REMOVED)
        assertThat(AudioEditorWaveformLaw.role(0.1, 0.5, cut)).isEqualTo(AudioEditorBarRole.PLAYED)
        assertThat(AudioEditorWaveformLaw.role(0.9, 0.5, cut)).isEqualTo(AudioEditorBarRole.IDLE)
        assertThat(AudioEditorWaveformLaw.role(0.1, 0.5, null)).isEqualTo(AudioEditorBarRole.PLAYED)
        assertThat(AudioEditorWaveformLaw.role(0.9, 0.5, null)).isEqualTo(AudioEditorBarRole.IDLE)
    }

    @Test
    fun `la sélection dessinée suit l'outil`() {
        val trim = AudioEditorStaging.initial(10.0).select(AudioEditorTool.TRIM, 10.0).copy(trimStart = 2.0)
        assertThat(trim.selection(10.0)).isEqualTo(AudioEditorSelection(0.2, 1.0, false))
        val cut = AudioEditorStaging.initial(10.0).select(AudioEditorTool.SPLIT, 10.0)
        assertThat(cut.selection(10.0)!!.isRemoval).isTrue()
        assertThat(AudioEditorStaging.initial(10.0).select(AudioEditorTool.FADE, 10.0).selection(10.0)).isNull()
        assertThat(trim.selection(0.0)).isNull()
    }
}
