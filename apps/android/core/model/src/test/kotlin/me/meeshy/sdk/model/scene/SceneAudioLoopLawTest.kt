package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SceneAudioLoopLawTest {

    @Test
    fun `entering a loop beyond its length folds on one pass`() {
        assertThat(SceneAudioLoopLaw.elapsedInPass(23.0, 5.0)).isWithin(1e-9).of(3.0)
    }

    @Test
    fun `unknown pass keeps the elapsed and negative or non finite is zero`() {
        assertThat(SceneAudioLoopLaw.elapsedInPass(7.0, 0.0)).isEqualTo(7.0)
        assertThat(SceneAudioLoopLaw.elapsedInPass(-1.0, 5.0)).isEqualTo(0.0)
        assertThat(SceneAudioLoopLaw.elapsedInPass(Double.NaN, 5.0)).isEqualTo(0.0)
    }

    @Test
    fun `pass length is the trim window bounded to the source`() {
        assertThat(SceneAudioLoopLaw.passLength(10.0, 2000, 30000)).isEqualTo(8.0)
        assertThat(SceneAudioLoopLaw.passLength(10.0, null, null)).isEqualTo(10.0)
        assertThat(SceneAudioLoopLaw.passLength(null, null, null)).isNull()
    }

    @Test
    fun `the preview forces the loop and a background loops unless it refuses`() {
        assertThat(SceneAudioLoopLaw.loops(false, isBackground = false, isEditPreview = true)).isTrue()
        assertThat(SceneAudioLoopLaw.loops(null, isBackground = true, isEditPreview = false)).isTrue()
        assertThat(SceneAudioLoopLaw.loops(null, isBackground = false, isEditPreview = false)).isFalse()
    }

    @Test
    fun `the envelope gain falls to zero at the end of every cycle`() {
        assertThat(SceneAudioLoopLaw.envelopeGain(9.5, 10.0, 0.0, 1.0)).isWithin(1e-6f).of(0.5f)
        assertThat(SceneAudioLoopLaw.envelopeGain(19.5, 10.0, 0.0, 1.0)).isWithin(1e-6f).of(0.5f)
    }
}
