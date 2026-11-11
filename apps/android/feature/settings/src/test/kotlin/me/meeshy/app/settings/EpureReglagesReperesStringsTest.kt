package me.meeshy.app.settings

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import me.meeshy.app.settings.SettingsResourceTree as Tree
import org.junit.Test

/**
 * Épure 2/3 des réglages Android (#17659) : les repères propres à la sécurité du compte et à la présence restent
 * lisibles au repos, et le (i) ne redit jamais la phrase déjà visible (règle 1, règle 7).
 */
class EpureReglagesReperesStringsTest {

    private val allLocales: List<String?> = listOf<String?>(null) + Tree.locales

    private fun fr(name: String): String = Tree.entriesOf("fr").getValue(name).text.replace("\\'", "'")

    private fun source(file: String): String =
        Tree.kotlinSources().first { it.name == file }.readText()

    @Test
    fun `the two-factor orientation also says what backup codes are for`() {
        assertThat(fr("twofactor_orientation")).isEqualTo(
            "Un code de votre application s'ajoute au mot de passe. " +
                "Les codes de secours servent une seule fois si vous perdez votre téléphone.",
        )
        allLocales.forEach { locale ->
            val text = Tree.entriesOf(locale).getValue("twofactor_orientation").text
            assertWithMessage("twofactor_orientation en ${locale ?: "en"} porte deux phrases").that(text.count { it == '.' }).isAtLeast(2)
        }
    }

    @Test
    fun `calls from non contacts show their rule at rest and keep only the detail behind the info button`() {
        assertThat(fr("settings_privacy_calls_non_contacts_subtitle")).isEqualTo("Désactivé, seuls vos amis peuvent vous faire sonner.")
        assertThat(fr("settings_privacy_calls_non_contacts_info"))
            .isEqualTo("Les autres voient que vous n'acceptez que les appels de vos amis.")
        assertThat(source("PrivacySettingsScreen.kt")).contains("PrivacyToggle.ALLOW_CALLS_FROM_NON_CONTACTS -> R.string.settings_privacy_calls_non_contacts_subtitle")
    }

    @Test
    fun `the return announcement info does not repeat the visible subtitle`() {
        assertThat(fr("settings_privacy_notify_contacts_on_return_info"))
            .isEqualTo("Vos amis et ceux qui ont votre numéro ou votre e-mail. Jamais si votre statut en ligne est masqué.")
        assertThat(fr("settings_privacy_notify_contacts_on_return_info")).doesNotContain("3 heures")
    }

    @Test
    fun `the autosave info keeps only the secondary detail`() {
        assertThat(fr("settings_media_autosave_note"))
            .isEqualTo("Une seule fois, images et vidéos. Jamais un média éphémère, flouté ou à vue unique.")
    }

    @Test
    fun `the diagnostics info does not repeat the privacy promise that stays visible`() {
        assertThat(fr("crash_reports_note"))
            .isEqualTo("Si l'application se ferme de façon inattendue, un rapport est enregistré ici pour le support.")
        assertThat(fr("crash_reports_privacy")).isEqualTo("Rien ne quitte l'appareil sans votre partage.")
        assertThat(fr("crash_reports_question")).isEqualTo("Quand un rapport est-il enregistré ?")
    }

    @Test
    fun `the cache card does not repeat its section title in a row`() {
        assertThat(fr("data_storage_cache_size")).isEqualTo("Taille")
        allLocales.forEach { locale ->
            assertWithMessage("data_storage_cache_title encore présent en ${locale ?: "en"}")
                .that(Tree.entriesOf(locale).keys).doesNotContain("data_storage_cache_title")
        }
        val screen = source("DataStorageScreen.kt")
        assertThat(screen).doesNotContain("R.string.data_storage_cache_title")
        assertThat(screen).contains("R.string.data_storage_cache_size")
    }

    @Test
    fun `the appearance orientation names the primary language, not the interface language that translates nothing`() {
        assertThat(fr("settings_languages_orientation"))
            .isEqualTo("Les messages sont traduits dans votre langue principale, puis régionale.")
        allLocales.forEach { locale ->
            val text = Tree.entriesOf(locale).getValue("settings_languages_orientation").text
            assertWithMessage("settings_languages_orientation en ${locale ?: "en"}").that(text.lowercase())
                .doesNotContain(Tree.entriesOf(locale).getValue("settings_interface_language").text.lowercase())
        }
    }

    @Test
    fun `every new string exists in all seven locales and the french is never copied`() {
        val names = listOf("settings_privacy_calls_non_contacts_subtitle", "data_storage_cache_size")
        allLocales.forEach { locale ->
            val entries = Tree.entriesOf(locale)
            names.forEach { name ->
                assertWithMessage("$name en ${locale ?: "en"}").that(entries.getValue(name).text.trim()).isNotEmpty()
            }
        }
        names.forEach { name ->
            Tree.locales.filter { it != "fr" }.forEach { locale ->
                assertWithMessage("$name copié du français en $locale")
                    .that(Tree.entriesOf(locale).getValue(name).text).isNotEqualTo(Tree.entriesOf("fr").getValue(name).text)
            }
        }
    }
}
