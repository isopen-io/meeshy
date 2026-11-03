package me.meeshy.sdk.model.camera

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.camera.ComposerCaptureMirrorRule.Output
import me.meeshy.sdk.model.composer.capture.CaptureLensFacing
import org.junit.Test

class ComposerCaptureMirrorRuleTest {
    @Test
    fun `la photo et la video de l'avant sont en miroir`() {
        assertThat(ComposerCaptureMirrorRule.mirrors(Output.PHOTO, CaptureLensFacing.FRONT)).isTrue()
        assertThat(ComposerCaptureMirrorRule.mirrors(Output.MOVIE, CaptureLensFacing.FRONT)).isTrue()
    }

    @Test
    fun `l'arriere n'est jamais miroite`() {
        Output.values().forEach { assertThat(ComposerCaptureMirrorRule.mirrors(it, CaptureLensFacing.BACK)).isFalse() }
    }

    @Test
    fun `les trames brutes d'analyse ne sont pas miroitees ni tournees`() {
        assertThat(ComposerCaptureMirrorRule.mirrors(Output.FRAMES, CaptureLensFacing.FRONT)).isFalse()
        assertThat(ComposerCaptureMirrorRule.rotatesToPortrait(Output.FRAMES)).isFalse()
    }

    @Test
    fun `la photo et la video sortent debout`() {
        assertThat(ComposerCaptureMirrorRule.rotatesToPortrait(Output.PHOTO)).isTrue()
        assertThat(ComposerCaptureMirrorRule.rotatesToPortrait(Output.MOVIE)).isTrue()
    }
}
