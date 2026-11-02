package me.meeshy.sdk.model.mood

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StatusEntry
import org.junit.Test

class MoodSpotlightRulesTest {

    private val now = 1_800_000_000_000L
    private fun entry(expiresAt: String?, user: String = "u1") =
        StatusEntry(id = "s", userId = user, moodEmoji = "😀", expiresAt = expiresAt)

    @Test fun `une humeur expiree n est plus vivante`() {
        assertThat(MoodSpotlightRules.isLive(entry("2001-01-01T00:00:00Z"), now)).isFalse()
        assertThat(MoodSpotlightRules.isLive(entry("2999-01-01T00:00:00Z"), now)).isTrue()
        assertThat(MoodSpotlightRules.isLive(entry(null), now)).isTrue()
    }

    @Test fun `on ne repond pas a sa propre humeur`() {
        assertThat(MoodSpotlightRules.canReply(entry(null, user = "me"), "me")).isFalse()
        assertThat(MoodSpotlightRules.canReply(entry(null), "me")).isTrue()
        assertThat(MoodSpotlightRules.canReply(null, "me")).isFalse()
    }

    @Test fun `l envoi exige un texte non vide et aucun envoi en cours`() {
        assertThat(MoodSpotlightRules.canSend(true, false, "  ")).isFalse()
        assertThat(MoodSpotlightRules.canSend(true, true, "salut")).isFalse()
        assertThat(MoodSpotlightRules.canSend(false, false, "salut")).isFalse()
        assertThat(MoodSpotlightRules.canSend(true, false, "salut")).isTrue()
    }
}
