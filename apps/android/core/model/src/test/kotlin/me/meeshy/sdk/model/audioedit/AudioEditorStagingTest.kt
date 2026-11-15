package me.meeshy.sdk.model.audioedit

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AudioEditorStagingTest {

    private fun staging(duration: Double = 10.0) = AudioEditorStaging.initial(duration)

    @Test
    fun `le mode simple n'offre que rogner et transcrire, le mode pro tous les outils`() {
        assertThat(AudioEditorTool.available(AudioEditorMode.SIMPLE))
            .containsExactly(AudioEditorTool.TRIM, AudioEditorTool.TRANSCRIBE).inOrder()
        assertThat(AudioEditorTool.available(AudioEditorMode.PRO)).containsExactlyElementsIn(AudioEditorTool.entries)
    }

    @Test
    fun `choisir rogner arme la tranche entière, couper arme le milieu 40 à 60 pour cent`() {
        assertThat(staging().select(AudioEditorTool.TRIM, 10.0).let { it.trimStart to it.trimEnd }).isEqualTo(0.0 to 10.0)
        val split = staging().select(AudioEditorTool.SPLIT, 10.0)
        assertThat(split.splitStart).isWithin(1e-9).of(4.0)
        assertThat(split.splitEnd).isWithin(1e-9).of(6.0)
    }

    @Test
    fun `rien d'armé ne produit aucune opération`() {
        val s = staging().select(AudioEditorTool.TRIM, 10.0)
        assertThat(s.pendingOperation(10.0)).isNull()
        assertThat(s.canApply(10.0, processing = false)).isFalse()
    }

    @Test
    fun `un rognage significatif produit l'opération, un rognage de moins de 0,3 s non`() {
        val s = staging().select(AudioEditorTool.TRIM, 10.0).copy(trimStart = 2.0)
        assertThat(s.pendingOperation(10.0)).isEqualTo(AudioEditOperation.Trim(2.0, 10.0))
        val tiny = s.copy(trimStart = 4.0, trimEnd = 4.2)
        assertThat(tiny.pendingOperation(10.0)).isNull()
    }

    @Test
    fun `une découpe produit removeRange à partir de 0,2 s`() {
        val s = staging().select(AudioEditorTool.SPLIT, 10.0)
        assertThat(s.pendingOperation(10.0)).isEqualTo(AudioEditOperation.RemoveRange(4.0, 6.0))
        assertThat(s.copy(splitEnd = 4.1).pendingOperation(10.0)).isNull()
    }

    @Test
    fun `fondu, vitesse et volume ne produisent rien tant qu'ils sont neutres`() {
        assertThat(staging().select(AudioEditorTool.FADE, 10.0).pendingOperation(10.0)).isNull()
        assertThat(staging().select(AudioEditorTool.SPEED, 10.0).pendingOperation(10.0)).isNull()
        assertThat(staging().select(AudioEditorTool.VOLUME, 10.0).pendingOperation(10.0)).isNull()
        assertThat(staging().select(AudioEditorTool.FADE, 10.0).copy(fadeOut = true).pendingOperation(10.0))
            .isEqualTo(AudioEditOperation.Fade(fadeIn = false, fadeOut = true))
        assertThat(staging().select(AudioEditorTool.SPEED, 10.0).copy(speed = 1.5).pendingOperation(10.0))
            .isEqualTo(AudioEditOperation.Speed(1.5))
        assertThat(staging().select(AudioEditorTool.VOLUME, 10.0).copy(gain = 1.5).pendingOperation(10.0))
            .isEqualTo(AudioEditOperation.Gain(1.5))
    }

    @Test
    fun `transcrire ne cuit aucune version`() {
        assertThat(AudioEditorTool.TRANSCRIBE.producesVersion).isFalse()
        assertThat(staging().select(AudioEditorTool.TRANSCRIBE, 10.0).pendingOperation(10.0)).isNull()
    }

    @Test
    fun `appliquer est refusé pendant un traitement`() {
        val s = staging().select(AudioEditorTool.FADE, 10.0).copy(fadeIn = true)
        assertThat(s.canApply(10.0, processing = false)).isTrue()
        assertThat(s.canApply(10.0, processing = true)).isFalse()
    }

    @Test
    fun `changer de version réinitialise tous les paramètres sur la nouvelle durée et ferme l'outil`() {
        val dirty = staging().select(AudioEditorTool.TRIM, 10.0).copy(trimStart = 3.0, speed = 2.0, gain = 3.0, fadeIn = true)
        val reset = dirty.resetFor(6.0)
        assertThat(reset.tool).isNull()
        assertThat(reset.trimStart).isEqualTo(0.0)
        assertThat(reset.trimEnd).isEqualTo(6.0)
        assertThat(reset.splitStart).isWithin(1e-9).of(2.4)
        assertThat(reset.speed).isEqualTo(1.0)
        assertThat(reset.gain).isEqualTo(1.0)
        assertThat(reset.fadeIn).isFalse()
    }

    @Test
    fun `quitter le mode pro ferme un outil qui n'est plus offert`() {
        val s = staging().select(AudioEditorTool.SPEED, 10.0).withMode(AudioEditorMode.SIMPLE)
        assertThat(s.tool).isNull()
        val kept = staging().select(AudioEditorTool.TRIM, 10.0).withMode(AudioEditorMode.SIMPLE)
        assertThat(kept.tool).isEqualTo(AudioEditorTool.TRIM)
    }

    @Test
    fun `la fenêtre de lecture suit l'outil actif`() {
        val trim = staging().select(AudioEditorTool.TRIM, 10.0).copy(trimStart = 2.0, trimEnd = 8.0)
        assertThat(trim.previewRegion(10.0)).isEqualTo(2.0..8.0)
        assertThat(staging().select(AudioEditorTool.FADE, 10.0).previewRegion(10.0)).isNull()
        assertThat(staging().select(AudioEditorTool.SPLIT, 10.0).previewRegion(10.0)).isNull()
    }

    @Test
    fun `la vitesse n'est entendue que quand l'outil Vitesse est ouvert`() {
        val speed = staging().select(AudioEditorTool.SPEED, 10.0).copy(speed = 1.5)
        assertThat(speed.previewRate).isEqualTo(1.5f)
        assertThat(speed.copy(tool = AudioEditorTool.FADE).previewRate).isEqualTo(1f)
    }

    @Test
    fun `les poignées de rognage gardent au moins 0,3 s et restent dans la piste`() {
        val trim = staging().select(AudioEditorTool.TRIM, 10.0)
        assertThat(trim.withSelectionStart(2.0, 10.0).trimStart).isWithin(1e-9).of(9.7)
        assertThat(trim.withSelectionStart(0.25, 10.0).trimStart).isWithin(1e-9).of(2.5)
        assertThat(trim.copy(trimStart = 5.0).withSelectionEnd(0.0, 10.0).trimEnd).isWithin(1e-9).of(5.3)
        assertThat(trim.withSelectionEnd(-3.0, 10.0).trimEnd).isWithin(1e-9).of(0.3)
    }

    @Test
    fun `les poignées de découpe gardent au moins 0,2 s et la fin ne dépasse pas la durée`() {
        val split = staging().select(AudioEditorTool.SPLIT, 10.0)
        assertThat(split.withSelectionStart(0.9, 10.0).splitStart).isWithin(1e-9).of(5.8)
        assertThat(split.withSelectionEnd(1.0, 10.0).splitEnd).isWithin(1e-9).of(10.0)
        assertThat(split.withSelectionEnd(0.0, 10.0).splitEnd).isWithin(1e-9).of(4.2)
    }

    @Test
    fun `une poignée sans outil de sélection ou sans durée ne change rien`() {
        val fade = staging().select(AudioEditorTool.FADE, 10.0)
        assertThat(fade.withSelectionStart(0.5, 10.0)).isEqualTo(fade)
        assertThat(staging().select(AudioEditorTool.TRIM, 10.0).withSelectionEnd(0.5, 0.0).trimEnd).isEqualTo(10.0)
    }

    @Test
    fun `l'étiquette d'une opération du journal est stable`() {
        assertThat(AudioEditOperation.Original.historyKind).isEqualTo(AudioEditHistoryKind.ORIGINAL)
        assertThat(AudioEditOperation.Trim(0.0, 1.0).historyKind).isEqualTo(AudioEditHistoryKind.TRIM)
        assertThat(AudioEditOperation.RemoveRange(0.0, 1.0).historyKind).isEqualTo(AudioEditHistoryKind.REMOVE_RANGE)
        assertThat(AudioEditOperation.Fade(true, false).historyKind).isEqualTo(AudioEditHistoryKind.FADE)
        assertThat(AudioEditOperation.Speed(2.0).historyKind).isEqualTo(AudioEditHistoryKind.SPEED)
        assertThat(AudioEditOperation.Gain(2.0).historyKind).isEqualTo(AudioEditHistoryKind.GAIN)
    }
}
