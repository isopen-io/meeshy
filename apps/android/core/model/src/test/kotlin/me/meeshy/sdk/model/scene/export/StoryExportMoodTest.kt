package me.meeshy.sdk.model.scene.export

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StatusEntry
import org.junit.Test

/**
 * #13509 : le mood peint sur l'intro est celui que l'auteur porte ENCORE (miroir de `StoryExportIntroFactory.resolveMood`
 * iOS) — sa première entrée non expirée, à emoji non vide ; un mood expiré, vide ou d'un autre auteur ne se peint pas.
 */
class StoryExportMoodTest {

    private val now = 1_000_000_000_000L

    private fun iso(epochMillis: Long): String = java.time.Instant.ofEpochMilli(epochMillis).toString()

    private fun entry(id: String, userId: String, emoji: String, content: String? = null, expiresAt: String? = null) =
        StatusEntry(id = id, userId = userId, moodEmoji = emoji, content = content, expiresAt = expiresAt)

    @Test
    fun `the author's live mood travels with its message, another author's never does`() {
        val statuses = listOf(entry("s1", "u2", "🎉"), entry("s2", "u1", "😴", content = "sieste", expiresAt = iso(now + 60_000)))
        assertThat(StoryExportMood.liveIn(statuses, "u1", now)).isEqualTo(StoryExportMood("😴", "sieste"))
        assertThat(StoryExportMood.liveIn(statuses, "u3", now)).isNull()
    }

    @Test
    fun `an expired mood is not painted, an undated one is`() {
        assertThat(StoryExportMood.liveIn(listOf(entry("s1", "u1", "😴", expiresAt = iso(now - 1))), "u1", now)).isNull()
        assertThat(StoryExportMood.liveIn(listOf(entry("s1", "u1", "😴")), "u1", now)).isEqualTo(StoryExportMood("😴", null))
    }

    @Test
    fun `an expired entry gives way to the author's next live one`() {
        val statuses = listOf(entry("old", "u1", "🥱", expiresAt = iso(now - 1)), entry("new", "u1", "🔥", expiresAt = iso(now + 1)))
        assertThat(StoryExportMood.liveIn(statuses, "u1", now)?.emoji).isEqualTo("🔥")
    }

    @Test
    fun `a blank emoji is no mood`() {
        assertThat(StoryExportMood.liveIn(listOf(entry("s1", "u1", " ")), "u1", now)).isNull()
    }
}
