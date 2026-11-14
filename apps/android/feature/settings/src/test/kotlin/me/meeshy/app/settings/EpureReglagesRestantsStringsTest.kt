package me.meeshy.app.settings

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import me.meeshy.app.settings.SettingsResourceTree as Tree
import org.junit.Test

/**
 * Épure 1/3 des réglages Android (#17659), les six constats restants : le repos nomme, la note du (i) porte
 * l'exclusion, le statut ne se dit qu'une fois, et le repère propre à Meeshy reste une phrase visible.
 */
class EpureReglagesRestantsStringsTest {

    private val allLocales: List<String?> = listOf<String?>(null) + Tree.locales

    private fun fr(name: String): String = Tree.entriesOf("fr").getValue(name).text.replace("\\'", "'")

    private fun source(file: String): String = Tree.kotlinSources().first { it.name == file }.readText()

    @Test
    fun `the autosave row is its name alone and its subtitle is gone from every locale`() {
        allLocales.forEach { locale ->
            assertWithMessage("settings_media_autosave_subtitle encore présent en ${locale ?: "en"}")
                .that(Tree.entriesOf(locale).keys).doesNotContain("settings_media_autosave_subtitle")
        }
        assertThat(source("MediaDownloadScreen.kt")).doesNotContain("settings_media_autosave_subtitle")
    }

    @Test
    fun `the autosave note carries the exclusion in one sentence, translated`() {
        assertThat(fr("settings_media_autosave_note")).isEqualTo("Images et vidéos, une seule fois, sauf éphémères ou à vue unique.")
        assertThat(fr("settings_media_autosave_question")).isEqualTo("Quels médias sont enregistrés ?")
        Tree.locales.filter { it != "fr" }.forEach { locale ->
            assertWithMessage("note copiée du français en $locale")
                .that(Tree.entriesOf(locale).getValue("settings_media_autosave_note").text)
                .isNotEqualTo(Tree.entriesOf("fr").getValue("settings_media_autosave_note").text)
        }
    }

    @Test
    fun `privacy names the save toggle like the media screen in every language`() {
        assertThat(fr("privacy_save_media")).isEqualTo("Enregistrer dans Photos")
        allLocales.forEach { locale ->
            val entries = Tree.entriesOf(locale)
            assertWithMessage("privacy_save_media en ${locale ?: "en"}")
                .that(entries.getValue("privacy_save_media").text)
                .isEqualTo(entries.getValue("settings_media_autosave_title").text)
        }
    }

    @Test
    fun `the encryption section says its status once`() {
        val body = source("PrivacySettingsScreen.kt").substringAfter("private fun EncryptionComingSoonSection")
            .substringBefore("private fun settingsInfo")
        assertThat(body.split("privacy_encryption_status_soon").size - 1).isEqualTo(1)
        assertThat(body).doesNotContain("trailing =")
        assertThat(fr("privacy_encryption_summary"))
            .isEqualTo("Le chiffrement de bout en bout se choisit par conversation et ne se défait pas.")
    }

    @Test
    fun `a contact coming back keeps its sentence visible under the label`() {
        assertThat(fr("settings_notif_type_contact_activity")).isEqualTo("Retour d'un contact")
        assertThat(fr("settings_notif_type_contact_activity_subtitle"))
            .isEqualTo("Un contact revient sur Meeshy, au plus toutes les 3 heures.")
        allLocales.forEach { locale ->
            assertWithMessage("subtitle en ${locale ?: "en"}")
                .that(Tree.entriesOf(locale).getValue("settings_notif_type_contact_activity_subtitle").text.trim()).isNotEmpty()
        }
        Tree.locales.filter { it != "fr" }.forEach { locale ->
            assertWithMessage("subtitle copié du français en $locale")
                .that(Tree.entriesOf(locale).getValue("settings_notif_type_contact_activity_subtitle").text)
                .isNotEqualTo(Tree.entriesOf("fr").getValue("settings_notif_type_contact_activity_subtitle").text)
        }
        assertThat(source("NotificationTypesEditor.kt")).contains("settings_notif_type_contact_activity_subtitle")
    }

    @Test
    fun `the approximate place is a question with its note behind an info button`() {
        assertThat(fr("sessions_place_question")).isEqualTo("D'où vient le lieu d'une session ?")
        allLocales.forEach { locale ->
            val question = Tree.entriesOf(locale).getValue("sessions_place_question").text.trim()
            assertWithMessage("question en ${locale ?: "en"}").that(question.last() in listOf('?', '؟')).isTrue()
            assertThat(Tree.entriesOf(locale).getValue("sessions_place_footnote").text.trim()).isNotEmpty()
        }
        assertThat(source("ActiveSessionsFooter.kt")).contains("MeeshyInfoNoteButton")
        assertThat(source("ActiveSessionsFooter.kt")).doesNotContain("sessions_place_footnote")
        assertThat(source("ActiveSessionsScreen.kt")).contains("R.string.sessions_place_question")
    }
}
