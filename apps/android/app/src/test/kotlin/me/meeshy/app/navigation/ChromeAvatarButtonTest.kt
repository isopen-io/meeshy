package me.meeshy.app.navigation

import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyPalette
import org.junit.Test

class ChromeAvatarButtonTest {

    @Test
    fun `a blank or missing avatar URL falls back to initials`() {
        assertThat(chromeAvatarUsesPhoto(null)).isFalse()
        assertThat(chromeAvatarUsesPhoto("")).isFalse()
        assertThat(chromeAvatarUsesPhoto("   ")).isFalse()
    }

    @Test
    fun `a real avatar URL selects the photo`() {
        assertThat(chromeAvatarUsesPhoto("https://cdn.meeshy.me/avatar.png")).isTrue()
    }

    @Test
    fun `the ring is indigo600 to indigo300 when the ladder is closed`() {
        assertThat(chromeAvatarRingColors(menuExpanded = false))
            .containsExactly(MeeshyPalette.Indigo600, MeeshyPalette.Indigo300)
            .inOrder()
    }

    @Test
    fun `the ring turns error to indigo300 when the ladder is expanded`() {
        assertThat(chromeAvatarRingColors(menuExpanded = true))
            .containsExactly(MeeshyPalette.Error, MeeshyPalette.Indigo300)
            .inOrder()
    }
}
