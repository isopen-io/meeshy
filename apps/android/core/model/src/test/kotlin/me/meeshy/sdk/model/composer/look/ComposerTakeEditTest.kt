package me.meeshy.sdk.model.composer.look

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.media.MediaTrimBounds
import org.junit.Test

/** Portage des lois de son, de gain et de proportions de `ComposerEditToolsTests.swift` (#9754, #10360, #9567). */
class ComposerTakeEditTest {

    @Test
    fun `le gain suit la ligne de volume, 100 pour cent au milieu, et le muet se souvient du gain`() {
        assertThat(ComposerTakeSound.gain(atY = 0.0, height = 100.0)).isEqualTo(2.0)
        assertThat(ComposerTakeSound.gain(atY = 50.0, height = 100.0)).isEqualTo(1.0)
        assertThat(ComposerTakeSound.gain(atY = 120.0, height = 100.0)).isEqualTo(0.0)
        assertThat(ComposerTakeSound.lineY(gain = 1.0, height = 100.0)).isEqualTo(50.0)
        val sound = ComposerTakeSound(gain = 1.4)
        val muted = sound.toggledMute()
        assertThat(muted.effectiveGain).isEqualTo(0.0)
        assertThat(muted.toggledMute().effectiveGain).isEqualTo(1.4)
        assertThat(ComposerTakeSound().isUntouched).isTrue()
        assertThat(ComposerTakeSound.percent(1.25)).isEqualTo(125)
        assertThat(ComposerTakeSound.stepped(1.95, up = true)).isEqualTo(2.0)
        assertThat(ComposerTakeSound.clamped(Double.NaN)).isEqualTo(1.0)
    }

    @Test
    fun `le gain se separe en attenuation et amplification, ecretee en douceur au dela du genou`() {
        assertThat(ComposerTakeGain.volume(0.5f)).isEqualTo(0.5f)
        assertThat(ComposerTakeGain.volume(1.6f)).isEqualTo(1f)
        assertThat(ComposerTakeGain.boost(0.5f)).isEqualTo(1f)
        assertThat(ComposerTakeGain.boost(1.6f)).isEqualTo(1.6f)
        assertThat(ComposerTakeGain.amplified(0.3f, boost = 2f)).isEqualTo(0.6f)
        val loud = ComposerTakeGain.amplified(0.9f, boost = 2f)
        assertThat(loud).isGreaterThan(ComposerTakeGain.KNEE)
        assertThat(loud).isLessThan(1f)
        assertThat(ComposerTakeGain.amplified(-0.9f, boost = 2f)).isEqualTo(-loud)
        assertThat(ComposerTakeGain.amplified(0.9f, boost = 1f)).isEqualTo(0.9f)
    }

    @Test
    fun `les presets - Original lit le media borne, les autres sont des rapports fixes`() {
        assertThat(ComposerCropPreset.ORIGINAL.aspect(4000.0, 3000.0)).isWithin(1e-9).of(4.0 / 3)
        assertThat(ComposerCropPreset.ORIGINAL.aspect(100.0, 1000.0)).isEqualTo(ComposerCropPreset.MIN_ASPECT)
        assertThat(ComposerCropPreset.STORY.aspect(4000.0, 3000.0)).isWithin(1e-9).of(9.0 / 16)
        assertThat(ComposerCropPreset.matching(1.0, 4000.0, 3000.0)).isEqualTo(ComposerCropPreset.SQUARE)
        assertThat(ComposerCropPreset.matching(1.3, 4000.0, 3000.0)).isNull()
        assertThat(ComposerCropPreset.entries.drop(1).all { it.notation != null }).isTrue()
    }

    @Test
    fun `le recadrage centre aux proportions d un preset, et rien quand il couvre tout`() {
        val square = ComposerCropPreset.centeredCrop(1.0, 4000.0, 3000.0)!!
        assertThat(square.width.toDouble()).isWithin(1e-6).of(0.75)
        assertThat(square.height).isEqualTo(1f)
        assertThat(square.x.toDouble()).isWithin(1e-6).of(0.125)
        val story = ComposerCropPreset.centeredCrop(9.0 / 16, 1080.0, 1080.0)!!
        assertThat(story.width.toDouble()).isWithin(1e-6).of(9.0 / 16)
        assertThat(ComposerCropPreset.centeredCrop(4.0 / 3, 4000.0, 3000.0)).isNull()
    }

    @Test
    fun `une video intouchee part telle quelle, coupee elle grave sa fenetre`() {
        assertThat(ComposerVideoEdit(durationSeconds = 10.0).isUntouched).isTrue()
        assertThat(ComposerVideoEdit(10.0, trim = MediaTrimBounds(0.0, 10.0)).isUntouched).isTrue()
        val cut = ComposerVideoEdit(10.0, trim = MediaTrimBounds(1.5, 7.25))
        assertThat(cut.isUntouched).isFalse()
        assertThat(cut.clipStartMs).isEqualTo(1500L)
        assertThat(cut.clipEndMs).isEqualTo(7250L)
        assertThat(ComposerVideoEdit(10.0).clipEndMs).isEqualTo(10_000L)
        val silent = ComposerVideoEdit(10.0, sound = ComposerTakeSound(muted = true))
        assertThat(silent.isUntouched).isFalse()
        assertThat(silent.removesAudio).isTrue()
        assertThat(ComposerVideoEdit(10.0, sound = ComposerTakeSound(gain = 1.5)).removesAudio).isFalse()
    }
}
