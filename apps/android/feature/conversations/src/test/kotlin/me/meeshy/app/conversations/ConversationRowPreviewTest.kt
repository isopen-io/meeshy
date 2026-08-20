package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ConversationRowPreviewTest {

    private val typingFormat = "%1\$s écrit…"

    @Test
    fun `typingPreview formats the name with the template`() {
        assertThat(typingPreview("Alice", typingFormat)).isEqualTo("Alice écrit…")
    }

    @Test
    fun `typingPreview is null for a null or blank name`() {
        assertThat(typingPreview(null, typingFormat)).isNull()
        assertThat(typingPreview("", typingFormat)).isNull()
        assertThat(typingPreview("   ", typingFormat)).isNull()
    }

    @Test
    fun `typingPreview trims surrounding whitespace before formatting`() {
        assertThat(typingPreview("  Bob  ", typingFormat)).isEqualTo("Bob écrit…")
    }

    @Test
    fun `typing supersedes both draft and last message and paints accent`() {
        val preview = conversationRowPreview(
            typingLine = "Alice écrit…",
            draftLine = "Brouillon : hi",
            lastMessage = "Vous : yo",
        )

        assertThat(preview).isEqualTo(RowPreview("Alice écrit…", isAccent = true))
    }

    @Test
    fun `draft wins over the last message when nobody is typing and paints accent`() {
        val preview = conversationRowPreview(
            typingLine = null,
            draftLine = "Brouillon : hi",
            lastMessage = "Vous : yo",
        )

        assertThat(preview).isEqualTo(RowPreview("Brouillon : hi", isAccent = true))
    }

    @Test
    fun `the last message shows in the secondary colour when there is no typing and no draft`() {
        val preview = conversationRowPreview(
            typingLine = null,
            draftLine = null,
            lastMessage = "Vous : yo",
        )

        assertThat(preview).isEqualTo(RowPreview("Vous : yo", isAccent = false))
    }
}
