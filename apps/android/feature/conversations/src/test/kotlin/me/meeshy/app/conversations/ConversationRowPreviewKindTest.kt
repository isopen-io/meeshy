package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * The kind-aware overload of `conversationRowPreview` — the row calls this so a
 * summary kind (EXPIRED/HIDDEN/VIEW_ONCE/EPHEMERAL_ACTIVE) surfaces to the Compose
 * layer for styling (italic label, kind icon). Typing and draft still win over any
 * summary — those preview lines are always STANDARD kind (their styling is the accent).
 */
class ConversationRowPreviewKindTest {

    @Test
    fun `summary kind propagates when no typing or draft`() {
        val preview = conversationRowPreview(
            typingLine = null,
            draftLine = null,
            summary = SummaryLine("Message expiré", MessageSummaryKind.EXPIRED),
        )

        assertThat(preview).isEqualTo(
            RowPreview("Message expiré", isAccent = false, kind = MessageSummaryKind.EXPIRED)
        )
    }

    @Test
    fun `typing supersedes summary kind (typing is STANDARD accent)`() {
        val preview = conversationRowPreview(
            typingLine = "Alice écrit…",
            draftLine = "Brouillon : plus tard",
            summary = SummaryLine("Contenu masqué", MessageSummaryKind.HIDDEN),
        )

        assertThat(preview).isEqualTo(
            RowPreview("Alice écrit…", isAccent = true, kind = MessageSummaryKind.STANDARD)
        )
    }

    @Test
    fun `draft supersedes summary kind (draft is STANDARD accent)`() {
        val preview = conversationRowPreview(
            typingLine = null,
            draftLine = "Brouillon : plus tard",
            summary = SummaryLine("Vue unique", MessageSummaryKind.VIEW_ONCE),
        )

        assertThat(preview).isEqualTo(
            RowPreview("Brouillon : plus tard", isAccent = true, kind = MessageSummaryKind.STANDARD)
        )
    }

    @Test
    fun `standard summary kind renders in secondary colour`() {
        val preview = conversationRowPreview(
            typingLine = null,
            draftLine = null,
            summary = SummaryLine("Vous : yo", MessageSummaryKind.STANDARD),
        )

        assertThat(preview).isEqualTo(
            RowPreview("Vous : yo", isAccent = false, kind = MessageSummaryKind.STANDARD)
        )
    }

    @Test
    fun `ephemeral active summary preserves its kind for styling`() {
        val preview = conversationRowPreview(
            typingLine = null,
            draftLine = null,
            summary = SummaryLine("À bientôt", MessageSummaryKind.EPHEMERAL_ACTIVE),
        )

        assertThat(preview).isEqualTo(
            RowPreview("À bientôt", isAccent = false, kind = MessageSummaryKind.EPHEMERAL_ACTIVE)
        )
    }
}
