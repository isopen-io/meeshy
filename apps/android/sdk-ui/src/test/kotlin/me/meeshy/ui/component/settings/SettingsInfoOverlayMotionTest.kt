package me.meeshy.ui.component.settings

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SettingsInfoOverlayMotionTest {
    @Test fun `anime tant que l echelle d animation est positive`() {
        assertThat(SettingsInfoOverlayMotion.shouldAnimate(1f)).isTrue()
        assertThat(SettingsInfoOverlayMotion.shouldAnimate(0.5f)).isTrue()
    }

    @Test fun `n anime pas quand les animations systeme sont coupees`() {
        assertThat(SettingsInfoOverlayMotion.shouldAnimate(0f)).isFalse()
        assertThat(SettingsInfoOverlayMotion.shouldAnimate(-1f)).isFalse()
    }
}
