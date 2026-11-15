package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ComposerBandResizeTest {
    @Test
    fun `dragging up grows and down shrinks the panel`() {
        assertThat(ComposerBandResize.height(300f, -40f)).isEqualTo(340f)
        assertThat(ComposerBandResize.height(300f, 40f)).isEqualTo(260f)
    }

    @Test
    fun `the height is clamped between min and max`() {
        assertThat(ComposerBandResize.height(300f, -1000f)).isEqualTo(540f)
        assertThat(ComposerBandResize.height(300f, 1000f)).isEqualTo(160f)
    }

    @Test
    fun `pulling more than fifty dp under the minimum dismisses`() {
        assertThat(ComposerBandResize.shouldDismiss(160f, 51f)).isTrue()
        assertThat(ComposerBandResize.shouldDismiss(160f, 50f)).isFalse()
        assertThat(ComposerBandResize.shouldDismiss(300f, 100f)).isFalse()
        assertThat(ComposerBandResize.shouldDismiss(300f, 191f)).isTrue()
    }
}
