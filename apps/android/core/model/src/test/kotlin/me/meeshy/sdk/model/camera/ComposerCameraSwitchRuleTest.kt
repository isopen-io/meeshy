package me.meeshy.sdk.model.camera

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ComposerCameraSwitchRuleTest {
    @Test
    fun `la couverture est maintenue 0,2 s et l'attente de trame est de 0,12 s`() {
        assertThat(ComposerCameraSwitchRule.COVER_HOLD_MS).isEqualTo(200L)
        assertThat(ComposerCameraSwitchRule.FRAME_WAIT_MS).isEqualTo(120L)
        assertThat(ComposerCameraSwitchRule.SEGMENT_RESUME_WAIT_MS).isEqualTo(600L)
        assertThat(ComposerCameraSwitchRule.COVER_WIDTH_PX).isEqualTo(270)
        assertThat(ComposerCameraSwitchRule.COVER_BLUR).isEqualTo(18f)
    }

    @Test
    fun `le bouton est grise pendant la bascule et ne relance rien`() {
        assertThat(ComposerCameraSwitchRule.mayFlip(isSwitching = true)).isFalse()
        assertThat(ComposerCameraSwitchRule.flipEnabled(isSwitching = true)).isFalse()
        assertThat(ComposerCameraSwitchRule.mayFlip(isSwitching = false)).isTrue()
    }

    @Test
    fun `la trame deja retenue couvre sans attendre`() {
        var waited = false
        val frame = ComposerCameraSwitchRule.coverFrame("retenue") { waited = true; "attendue" }
        assertThat(frame).isEqualTo("retenue")
        assertThat(waited).isFalse()
    }

    @Test
    fun `sans trame retenue on attend celle de l'objectif en place`() {
        assertThat(ComposerCameraSwitchRule.coverFrame<String>(null) { "attendue" }).isEqualTo("attendue")
        assertThat(ComposerCameraSwitchRule.coverFrame<String>(null) { null }).isNull()
    }

    @Test
    fun `le zoom est reaffirme seulement quand l'ouverture a bouge`() {
        assertThat(ComposerCameraSwitchRule.needsZoomReassert(1f, 2f)).isTrue()
        assertThat(ComposerCameraSwitchRule.needsZoomReassert(2f, 2.0005f)).isFalse()
    }

    @Test
    fun `la couverture n'est jamais agrandie`() {
        assertThat(ComposerCameraSwitchRule.coverWidth(1080)).isEqualTo(270)
        assertThat(ComposerCameraSwitchRule.coverWidth(100)).isEqualTo(100)
        assertThat(ComposerCameraSwitchRule.coverWidth(0)).isEqualTo(0)
    }
}
