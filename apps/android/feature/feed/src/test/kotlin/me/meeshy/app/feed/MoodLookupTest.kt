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
    fun `une humeur vide n est pas une humeur`() {
        val lookup = MoodLookup.from(StatusesUiState(statuses = listOf(entry("s1", "u1", " "))))
        assertThat(lookup.emojiOf("u1")).isNull()
    }
}
