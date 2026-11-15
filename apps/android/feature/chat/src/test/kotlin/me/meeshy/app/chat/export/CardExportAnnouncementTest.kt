package me.meeshy.app.chat.export

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import org.junit.Test

/**
 * #14557 — « Imager » : Enregistrer et Partager annoncent leur fin par l'annonceur de l'application, le bandeau du
 * compositeur, qui survit à la fermeture de la feuille. Jamais un toast système. Un refus ou un échec reste dans la feuille,
 * qui ne se ferme pas.
 */
class CardExportAnnouncementTest {

    @Test
    fun `saved and shared are announced, a refusal or a failure stays in the sheet`() {
        val announced = CardOutcome.entries.associateWith { cardExportAnnouncement(it, saved = "Enregistrée", shared = "Prête")?.message }

        assertThat(announced[CardOutcome.GALLERY]).isEqualTo("Enregistrée")
        assertThat(announced[CardOutcome.SHARED]).isEqualTo("Prête")
        assertThat(announced.filterKeys { it != CardOutcome.GALLERY && it != CardOutcome.SHARED }.values.toSet()).containsExactly(null)
    }

    @Test
    fun `the card workshop never speaks by toast and announces through the application's announcer`() {
        val sources = File("src/main/kotlin/me/meeshy/app/chat/export").walkTopDown()
            .filter { it.isFile && it.extension == "kt" }
            .associate { it.name to it.readText() }

        sources.forEach { (name, text) -> assertWithMessage(name).that(text).doesNotContain("Toast.") }
        assertThat(sources.getValue("CardExportSheet.kt")).contains("rememberExportAnnouncer()")
    }

    @Test
    fun `the application hosts the one announcer, above every screen`() {
        val root = File("../../app/src/main/kotlin/me/meeshy/app/navigation/ShareLaunchHost.kt").readText()

        assertThat(root).contains("LocalExportAnnouncer provides")
        assertThat(root).contains("ExportAnnouncerHost(")
    }
}
