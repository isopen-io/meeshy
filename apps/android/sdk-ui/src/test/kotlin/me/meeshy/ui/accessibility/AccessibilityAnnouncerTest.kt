package me.meeshy.ui.accessibility

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AccessibilityAnnouncerTest {
    private val received = mutableListOf<Pair<String, AnnouncementPriority>>()
    private fun announcer(active: Boolean) =
        AccessibilityAnnouncer({ active }, { text, priority -> received += text to priority })

    @Test fun `sans lecteur d ecran l annonceur ne fait rien`() {
        announcer(false).announce("Envoyé")
        assertThat(received).isEmpty()
    }

    @Test fun `avec lecteur d ecran une annonce est polie`() {
        announcer(true).announce("Envoyé")
        assertThat(received).containsExactly("Envoyé" to AnnouncementPriority.POLITE)
    }

    @Test fun `une erreur est assertive`() {
        announcer(true).announceError("Échec")
        assertThat(received).containsExactly("Échec" to AnnouncementPriority.ASSERTIVE)
    }

    @Test fun `un texte vide n est pas annonce`() {
        announcer(true).announce("  ")
        assertThat(received).isEmpty()
    }
}
