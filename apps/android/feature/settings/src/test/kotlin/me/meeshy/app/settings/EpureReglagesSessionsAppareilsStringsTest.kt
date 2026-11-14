package me.meeshy.app.settings

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import me.meeshy.app.settings.SettingsResourceTree as Tree
import org.junit.Test

/**
 * Épure 1/3 des réglages Android (#17659), sessions et appareils chiffrés : la boîte d'échec tient en une ligne,
 * et les états hors ligne nomment ce qu'on voit (la dernière liste connue) sans le raconter.
 */
class EpureReglagesSessionsAppareilsStringsTest {

    private val allLocales: List<String?> = listOf<String?>(null) + Tree.locales

    private fun fr(name: String): String = Tree.entriesOf("fr").getValue(name).text

    private fun source(file: String): String = Tree.kotlinSources().first { it.name == file }.readText()

    @Test
    fun `the sign-out failure box has no title and its key is gone from every locale`() {
        allLocales.forEach { locale ->
            assertWithMessage("sessions_error_title encore présent en ${locale ?: "en"}")
                .that(Tree.entriesOf(locale).keys).doesNotContain("sessions_error_title")
        }
        assertThat(source("ActiveSessionsScreen.kt")).doesNotContain("sessions_error_title")
    }

    @Test
    fun `one failure line serves signing out one session and the others, in every locale`() {
        assertThat(fr("sessions_revoke_error")).isEqualTo("Déconnexion impossible")
        allLocales.forEach { locale ->
            assertWithMessage("sessions_revoke_all_error encore présent en ${locale ?: "en"}")
                .that(Tree.entriesOf(locale).keys).doesNotContain("sessions_revoke_all_error")
        }
        assertThat(source("ActiveSessionsScreen.kt")).doesNotContain("sessions_revoke_all_error")
    }

    @Test
    fun `the offline and stale encrypted-device lines name the last known list`() {
        assertThat(fr("encrypted_devices_offline_empty")).isEqualTo("Hors ligne : vos appareils reviendront avec le réseau.")
        assertThat(fr("encrypted_devices_offline")).isEqualTo("Hors ligne : dernière liste connue.")
        assertThat(fr("encrypted_devices_stale")).isEqualTo("Actualisation impossible : dernière liste connue.")
    }

    @Test
    fun `the shortened lines are translated, never copied from French, in every locale`() {
        listOf("sessions_revoke_error", "encrypted_devices_offline_empty", "encrypted_devices_offline", "encrypted_devices_stale")
            .forEach { name ->
                Tree.locales.filter { it != "fr" }.forEach { locale ->
                    val text = Tree.entriesOf(locale).getValue(name).text
                    assertWithMessage("$name en $locale").that(text.trim()).isNotEmpty()
                    assertWithMessage("$name copié du français en $locale").that(text).isNotEqualTo(fr(name))
                }
                assertThat(Tree.entriesOf(null).getValue(name).text).isNotEqualTo(fr(name))
            }
    }
}
