package me.meeshy.app.navigation

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.settings.SettingsHubSectionId
import me.meeshy.sdk.model.settings.SettingsInvite
import org.junit.Test

/** Une invite de réglage ouvre le hub Réglages sur SA section, mise en évidence (#16339). */
class SettingsInviteRouteTest {

    private fun focusedSection(route: String): SettingsHubSectionId? {
        val prefix = Routes.SETTINGS_FOCUS.substringBefore("{")
        assertThat(route).startsWith(prefix)
        return SettingsInvite.fromWire(route.removePrefix(prefix))?.section
    }

    @Test
    fun `le consentement vocal ouvre les reglages sur le profil vocal`() {
        assertThat(focusedSection(Routes.settingsFocus(SettingsInvite.VOICE_CONSENT))).isEqualTo(SettingsHubSectionId.VOICE)
    }

    @Test
    fun `le code maitre ouvre les reglages sur le compte`() {
        assertThat(focusedSection(Routes.settingsFocus(SettingsInvite.MASTER_PIN))).isEqualTo(SettingsHubSectionId.ACCOUNT)
    }

    @Test
    fun `la route ciblee reste une page des reglages avec retour`() {
        assertThat(Routes.SETTINGS_FOCUS).isEqualTo("settings/focus/{invite}")
        assertThat(NavBackChrome.edgeSwipeBackEnabled(Routes.SETTINGS_FOCUS)).isTrue()
    }
}
