package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StatusEntry
import org.junit.Test

class MoodLookupTest {

    private fun entry(id: String, userId: String, mood: String) = StatusEntry(id = id, userId = userId, moodEmoji = mood)

    @Test
    fun `chaque auteur retrouve son humeur et la porte vers son ecran`() {
        val lookup = MoodLookup.from(StatusesUiState(statuses = listOf(entry("s1", "u1", "🔥"), entry("s2", "u2", "😴"))))
        assertThat(lookup.emojiOf("u1")).isEqualTo("🔥")
        assertThat(lookup.statusIdOf("u2")).isEqualTo("s2")
        assertThat(lookup.emojiOf("inconnu")).isNull()
        assertThat(lookup.statusIdOf("inconnu")).isNull()
    }

    @Test
    fun `l humeur du compte courant se lit sans passer par un anneau`() {
        val mine = entry("s9", "me", "😀")
        val lookup = MoodLookup.from(StatusesUiState(statuses = listOf(mine), myStatus = mine))
        assertThat(lookup.myEmoji).isEqualTo("😀")
        assertThat(MoodLookup.from(StatusesUiState()).myEmoji).isNull()
    }

    @Test
    fun `l humeur la plus recente d un auteur gagne, comme iOS statusForUser`() {
        val newest = entry("s-new", "u1", "🔥")
        val older = entry("s-old", "u1", "😴")
        val lookup = MoodLookup.from(StatusesUiState(statuses = listOf(newest, older)))
        assertThat(lookup.emojiOf("u1")).isEqualTo("🔥")
        assertThat(lookup.statusIdOf("u1")).isEqualTo("s-new")
    }

    @Test
    fun `une humeur expiree que le cache sert encore ne se pose plus sur l avatar`() {
        val now = java.time.Instant.parse("2026-10-29T12:00:00Z")
        val expired = StatusEntry(id = "s1", userId = "u1", moodEmoji = "🔥", expiresAt = now.minusSeconds(1).toString())
        val live = StatusEntry(id = "s2", userId = "u2", moodEmoji = "😴", expiresAt = now.plusSeconds(600).toString())
        val mineExpired = StatusEntry(id = "s3", userId = "me", moodEmoji = "😀", expiresAt = now.minusSeconds(60).toString())
        val lookup = MoodLookup.from(
            StatusesUiState(statuses = listOf(expired, live), myStatus = mineExpired),
            nowMillis = now.toEpochMilli(),
        )
        assertThat(lookup.emojiOf("u1")).isNull()
        assertThat(lookup.statusIdOf("u1")).isNull()
        assertThat(lookup.emojiOf("u2")).isEqualTo("😴")
        assertThat(lookup.myEmoji).isNull()
    }

    @Test
    fun `une humeur vide n est pas une humeur`() {
        val lookup = MoodLookup.from(StatusesUiState(statuses = listOf(entry("s1", "u1", " "))))
        assertThat(lookup.emojiOf("u1")).isNull()
    }
}
