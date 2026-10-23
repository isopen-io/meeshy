package me.meeshy.app.settings

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** iOS `SettingsView.profileCard` : nom affiché en titre, « @pseudo » dessous. */
class SettingsProfileCardTest {

    @Test
    fun `the display name heads the card and the handle sits under it`() {
        val state = SettingsUiState(username = "atabeth", displayName = "Atabeth Mboula", email = "a@meeshy.me")

        assertThat(state.profileTitle).isEqualTo("Atabeth Mboula")
        assertThat(state.profileHandle).isEqualTo("@atabeth")
    }

    @Test
    fun `without a display name the username heads the card`() {
        assertThat(SettingsUiState(username = "atabeth", displayName = "  ").profileTitle).isEqualTo("atabeth")
    }

    @Test
    fun `no user yet shows neither title nor handle`() {
        assertThat(SettingsUiState().profileTitle).isEmpty()
        assertThat(SettingsUiState().profileHandle).isNull()
    }
}
