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
    fun `le consentement vocal ouvre directement la configuration de la voix, l'assistant a defaut de profil`() {
        assertThat(Routes.forInvite(SettingsInvite.VOICE_CONSENT)).isEqualTo("settings/voice-profile?wizard=true")
        assertThat(Routes.VOICE_PROFILE.substringBefore("?")).isEqualTo(Routes.forInvite(SettingsInvite.VOICE_CONSENT).substringBefore("?"))
    }

    @Test
    fun `une autre invite ouvre toujours le hub sur sa section`() {
        assertThat(Routes.forInvite(SettingsInvite.MASTER_PIN)).isEqualTo(Routes.settingsFocus(SettingsInvite.MASTER_PIN))
    }

    @Test
    fun `la gestion du profil vocal depuis les reglages ne saute jamais a l'assistant`() {
        assertThat(Routes.voiceProfile()).isEqualTo("settings/voice-profile?wizard=false")
        assertThat(NavBackChrome.entries.single { it.route == Routes.VOICE_PROFILE }.chrome).isEqualTo(BackChrome.MODAL)
    }

    @Test
    fun `la route ciblee reste une page des reglages avec retour`() {
        assertThat(Routes.SETTINGS_FOCUS).isEqualTo("settings/focus/{invite}")
        assertThat(NavBackChrome.edgeSwipeBackEnabled(Routes.SETTINGS_FOCUS)).isTrue()
    }
}
