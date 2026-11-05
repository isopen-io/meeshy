package me.meeshy.sdk.model.settings

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Une invite de réglage mène à SON réglage, que le hub met en évidence (#16339). */
class SettingsInviteTest {

    @Test
    fun `l invite de consentement vocal mene au profil vocal`() {
        assertThat(SettingsInvite.VOICE_CONSENT.section).isEqualTo(SettingsHubSectionId.VOICE)
    }

    @Test
    fun `l invite du code maitre mene a la securite du compte`() {
        assertThat(SettingsInvite.MASTER_PIN.section).isEqualTo(SettingsHubSectionId.ACCOUNT)
    }

    @Test
    fun `chaque invite mene a une section que le hub affiche`() {
        val shown = SettingsHubCatalog.sections().map { it.id }.toSet()
        SettingsInvite.entries.forEach { assertThat(shown).contains(it.section) }
    }

    @Test
    fun `une invite se relit depuis sa forme de route`() {
        SettingsInvite.entries.forEach { assertThat(SettingsInvite.fromWire(it.wire)).isEqualTo(it) }
    }

    @Test
    fun `une forme inconnue ne met rien en evidence`() {
        assertThat(SettingsInvite.fromWire("nope")).isNull()
        assertThat(SettingsInvite.fromWire(null)).isNull()
    }

    @Test
    fun `le profil vocal propose de creer son profil`() {
        val voice = SettingsHubCatalog.sections().first { it.id == SettingsHubSectionId.VOICE }
        assertThat(voice.rows.map { it.id }).containsExactly(SettingsHubRowId.VOICE_PROFILE_CREATE)
    }
}
