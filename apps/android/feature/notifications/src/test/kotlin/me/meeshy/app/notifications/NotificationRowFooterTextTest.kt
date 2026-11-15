package me.meeshy.app.notifications

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.NotificationRowFooter
import me.meeshy.sdk.model.RowContentKind
import me.meeshy.ui.format.RelativeTimeStrings
import org.junit.Test

class NotificationRowFooterTextTest {

    @Test
    fun `un pied de conversation rend le nom du groupe`() {
        assertThat(footerText(NotificationRowFooter.Conversation("Les Amis"), STRINGS, null, "Expired")).isEqualTo("Les Amis")
    }

    @Test
    fun `un contenu sans extrait retombe sur la nature et dit l'expiration`() {
        val footer = NotificationRowFooter.Content(RowContentKind.STORY, null, isExpired = true)
        assertThat(footerText(footer, STRINGS, "Story", "Expired")).isEqualTo("Story · Expired")
    }

    @Test
    fun `un contenu garde son extrait quand il existe`() {
        val footer = NotificationRowFooter.Content(RowContentKind.POST, "Belle vue")
        assertThat(footerText(footer, STRINGS, "Post", "Expired")).isEqualTo("Belle vue")
    }

    private companion object {
        val STRINGS = RelativeTimeStrings(
            now = "now", secondsAgo = "%d s", minutesAgo = "%d min", hoursAgo = "%d h",
            daysAgo = "%d d", weeksAgo = "%d w", monthsAgo = "%d mo",
        )
    }
}
