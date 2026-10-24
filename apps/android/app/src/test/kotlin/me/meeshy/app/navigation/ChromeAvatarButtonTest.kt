package me.meeshy.app.navigation

import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyPalette
import org.junit.Test

class ChromeAvatarButtonTest {

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

    @Test
    fun `a stored avatar key resolves against the API base so the chrome shows the photo`() {
        assertThat(chromeAvatarModel("avatars/user/u1.jpg", "https://gate.staging.meeshy.me/api/v1/"))
            .isEqualTo("https://gate.staging.meeshy.me/api/v1/attachments/file/avatars/user/u1.jpg")
    }

    @Test
    fun `no photo yields no model, so the initials show`() {
        assertThat(chromeAvatarModel(null, "https://gate.meeshy.me/api/v1/")).isNull()
        assertThat(chromeAvatarModel("", "https://gate.meeshy.me/api/v1/")).isNull()
        assertThat(chromeAvatarModel("  ", "https://gate.meeshy.me/api/v1/")).isNull()
    }

    @Test
    fun `a full photo URL is kept as served`() {
        assertThat(chromeAvatarModel("https://gate.meeshy.me/u/avatar.png", "https://gate.meeshy.me/api/v1/"))
            .isEqualTo("https://gate.meeshy.me/u/avatar.png")
    }
}
