package me.meeshy.app.settings

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import me.meeshy.app.settings.SettingsResourceTree as Tree
import org.junit.Test

/**
 * Épure 3/3 des réglages Android (#17659) : un (i) ne redit pas la ligne visible, une rangée sans effet
 * quitte l'écran, un lien de partage dit ce qu'il fait, le nom d'un bloc n'est pas redit par sa rangée.
 */
class EpureReglagesLot3StringsTest {

    private val allLocales: List<String?> = listOf<String?>(null) + Tree.locales

    private fun fr(name: String): String = Tree.entriesOf("fr").getValue(name).text.replace("\\'", "'")

    private fun source(file: String): String = Tree.kotlinSources().first { it.name == file }.readText()

    @Test
    fun `the read receipts row has no info button because its subtitle already says everything`() {
        val screen = source("PrivacySettingsScreen.kt")
        assertThat(screen).doesNotContain("PrivacyInfoTopic.READ_RECEIPTS")
        assertThat(fr("privacy_read_receipts_subtitle")).isEqualTo("Réciproque : sans accusé envoyé, pas d'accusé reçu.")
    }

    @Test
    fun `the calls info is named by the question it answers and uses the word of its subtitle`() {
        assertThat(fr("settings_privacy_calls_non_contacts_question")).isEqualTo("Les autres savent-ils que je refuse les appels ?")
        assertThat(Tree.entriesOf(null).getValue("settings_privacy_calls_non_contacts_question").text)
            .isEqualTo("Do others know I refuse calls?")
        assertThat(fr("settings_privacy_calls_non_contacts_subtitle")).contains("amis")
        assertThat(fr("settings_privacy_calls_non_contacts_info")).contains("amis")
        assertThat(fr("settings_privacy_calls_non_contacts_info")).doesNotContain("contacts")
        Tree.locales.filter { it != "fr" }.forEach { locale ->
            assertWithMessage("question copiée du français en $locale")
                .that(Tree.entriesOf(locale).getValue("settings_privacy_calls_non_contacts_question").text)
                .isNotEqualTo(Tree.entriesOf("fr").getValue("settings_privacy_calls_non_contacts_question").text)
        }
    }

    @Test
    fun `rows that write nothing are not drawn and their strings are gone from every locale`() {
        val screen = source("PrivacySettingsScreen.kt")
        assertThat(screen).doesNotContain("isComingSoon")
        assertThat(screen).doesNotContain("settings_privacy_coming_soon")
        assertThat(screen).contains("PrivacyCatalog.visibleToggles")
    }

    @Test
    fun `the share links row says what a link is for at rest`() {
        assertThat(Tree.entriesOf(null).getValue("settings_share_links_orientation").text)
            .isEqualTo("Invite people with a link: choose what they can do, for how long and how many can join.")
        assertThat(fr("settings_share_links_orientation"))
            .isEqualTo("Invitez avec un lien : choisissez ce que les invités peuvent faire, pour combien de temps et combien peuvent rejoindre.")
        Tree.locales.filter { it != "fr" }.forEach { locale ->
            assertWithMessage("orientation copiée du français en $locale")
                .that(Tree.entriesOf(locale).getValue("settings_share_links_orientation").text)
                .isNotEqualTo(Tree.entriesOf("fr").getValue("settings_share_links_orientation").text)
        }
    }

    @Test
    fun `the unattributed row takes the name of its block title`() {
        val screen = source("SelectiveCachePurgeScreen.kt")
        assertThat(screen).doesNotContain("R.string.purge_unattributed_label")
        assertThat(screen.split("R.string.purge_unattributed_title").size - 1).isAtLeast(2)
    }
}
