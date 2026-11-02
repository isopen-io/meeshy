package me.meeshy.sdk.model.scene.export

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.UserPresence
import org.junit.Test

/**
 * #13997 : l'intro d'un export porte la PROJECTION de la présence servie (jamais décidée par le client), le mood de l'auteur et,
 * à partir de Proche, le logo de son cercle. Pas ami ⇒ aucune information de présence.
 */
class StoryExportIdentityTest {

    private val now = 1_000_000_000_000L

    private fun iso(epochMillis: Long): String = java.time.Instant.ofEpochMilli(epochMillis).toString()

    private fun author(isOwn: Boolean = false, presence: UserPresence? = null) = StoryExportAuthorFacts(
        userId = "u1", displayName = "Aïcha", username = "aicha", avatarUrl = "https://x/a.png", bannerUrl = null,
        accentHex = "6366F1", isOwn = isOwn, servedPresence = presence,
    )

    private fun identity(
        author: StoryExportAuthorFacts = author(),
        mood: StoryExportMood? = null,
        level: String? = null,
    ) = StoryExportIdentity.of(author, mood, level, now)

    @Test
    fun `a presence the server did not serve paints no dot`() {
        assertThat(identity(author(presence = null)).presence).isNull()
    }

    @Test
    fun `served presence projects through the platform mirror`() {
        assertThat(identity(author(presence = UserPresence(isOnline = true, lastActiveAt = iso(now - 5_000)))).presence).isEqualTo(PresenceState.ONLINE)
        assertThat(identity(author(presence = UserPresence(isOnline = false, lastActiveAt = iso(now - 120_000)))).presence).isEqualTo(PresenceState.AWAY)
        assertThat(identity(author(presence = UserPresence(isOnline = false, lastActiveAt = iso(now - 240_000)))).presence).isEqualTo(PresenceState.IDLE)
    }

    @Test
    fun `an offline author paints no dot`() {
        assertThat(identity(author(presence = UserPresence(isOnline = false, lastActiveAt = iso(now - 3_600_000)))).presence).isNull()
        assertThat(identity(author(presence = UserPresence(isOnline = false, lastActiveAt = null))).presence).isNull()
    }

    @Test
    fun `one's own story is always online even when nothing was served`() {
        assertThat(identity(author(isOwn = true, presence = null)).presence).isEqualTo(PresenceState.ONLINE)
    }

    @Test
    fun `the circle logo follows the served level from close up and nothing below`() {
        assertThat(identity(level = "CLOSE").badge).isEqualTo("🔥")
        assertThat(identity(level = "BLOOD").badge).isEqualTo("🩸")
        assertThat(identity(level = "FRIEND").badge).isNull()
        assertThat(identity(level = null).badge).isNull()
    }

    @Test
    fun `one's own story never carries a circle logo`() {
        assertThat(identity(author(isOwn = true), level = "CLOSE").badge).isNull()
    }

    @Test
    fun `the mood travels with its message and a blank mood is dropped`() {
        val with = identity(mood = StoryExportMood("😴", "sieste"))
        assertThat(with.moodEmoji).isEqualTo("😴")
        assertThat(with.moodMessage).isEqualTo("sieste")

        val blank = identity(mood = StoryExportMood(" ", "orphelin"))
        assertThat(blank.moodEmoji).isNull()
        assertThat(blank.moodMessage).isNull()
        assertThat(identity(mood = StoryExportMood("🎉", " ")).moodMessage).isNull()
    }
}
