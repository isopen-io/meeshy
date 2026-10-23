package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ConversationRowAccessibilityTest {

    private val strings = ConversationRowAccessibility.Strings(
        conversationWith = { "Conversation avec $it" },
        lastMessage = { "dernier message : $it" },
        unread = { "$it messages non lus" },
        muted = "en silence",
        pinned = "épinglée",
        pendingSync = "synchronisation en attente",
    )

    private fun label(
        preview: String? = "Salut",
        time: String? = "5 min",
        unread: Int = 0,
        muted: Boolean = false,
        pinned: Boolean = false,
        sync: Boolean = false,
    ) = ConversationRowAccessibility.label("Alice", preview, time, unread, muted, pinned, sync, strings)

    @Test
    fun `a quiet row reads name, preview and time`() {
        assertThat(label()).isEqualTo("Conversation avec Alice, dernier message : Salut, 5 min")
    }

    @Test
    fun `every state is spoken in order`() {
        assertThat(label(unread = 3, muted = true, pinned = true, sync = true)).isEqualTo(
            "Conversation avec Alice, dernier message : Salut, 5 min, 3 messages non lus, " +
                "en silence, épinglée, synchronisation en attente",
        )
    }

    @Test
    fun `a pending sync alone adds only its phrase`() {
        assertThat(label(sync = true)).endsWith(", synchronisation en attente")
        assertThat(label(sync = true)).doesNotContain("en silence")
    }

    @Test
    fun `a missing preview or time is skipped without a stray separator`() {
        assertThat(label(preview = null, time = null)).isEqualTo("Conversation avec Alice")
        assertThat(label(preview = "  ")).isEqualTo("Conversation avec Alice, 5 min")
    }

    @Test
    fun `a draft is spoken with its label`() {
        val draft = RowPreview(text = "à tout à l'heure", isAccent = false, draftLabel = "Brouillon :")

        assertThat(ConversationRowAccessibility.spokenPreview(draft)).isEqualTo("Brouillon : à tout à l'heure")
    }

    @Test
    fun `a plain preview is spoken as is`() {
        assertThat(ConversationRowAccessibility.spokenPreview(RowPreview("Salut", isAccent = false)))
            .isEqualTo("Salut")
    }
}
