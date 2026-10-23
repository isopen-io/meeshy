package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Parité iOS `ThemedConversationRow.conversationAccessibilityLabel` : un seul libellé, dans CET ordre. */
class ConversationRowAccessibilityTest {

    private fun label(
        preview: String? = "last message: hi",
        time: String? = "5 min",
        unread: String? = "3 unread",
        muted: String? = "muted",
        pinned: String? = "pinned",
        locked: String? = null,
        points: String? = null,
        pendingSync: String? = null,
    ) = ConversationRowAccessibility.label(
        title = "Conversation with Ana",
        preview = preview,
        time = time,
        unread = unread,
        muted = muted,
        pinned = pinned,
        locked = locked,
        points = points,
        pendingSync = pendingSync,
    )

    @Test
    fun `the label reads name, preview, time, unread, muted, pinned in that order`() {
        assertThat(label())
            .isEqualTo("Conversation with Ana, last message: hi, 5 min, 3 unread, muted, pinned")
    }

    @Test
    fun `absent and blank parts leave no hole`() {
        assertThat(label(preview = null, time = " ", unread = null, muted = null))
            .isEqualTo("Conversation with Ana, pinned")
    }

    @Test
    fun `the engagement points are spoken last, after the lock`() {
        assertThat(label(muted = null, pinned = null, unread = null, locked = "locked", points = "4 day streak"))
            .isEqualTo("Conversation with Ana, last message: hi, 5 min, locked, 4 day streak")
    }

    @Test
    fun `a pending sync is spoken after the pin, before the lock and the points`() {
        assertThat(label(pendingSync = "sync pending", locked = "locked", points = "4 day streak")).isEqualTo(
            "Conversation with Ana, last message: hi, 5 min, 3 unread, muted, pinned, sync pending, " +
                "locked, 4 day streak",
        )
    }

    @Test
    fun `a pending sync alone adds only its phrase`() {
        val spoken = label(unread = null, muted = null, pinned = null, pendingSync = "sync pending")

        assertThat(spoken).isEqualTo("Conversation with Ana, last message: hi, 5 min, sync pending")
    }

    @Test
    fun `no pending sync says nothing about sync`() {
        assertThat(label()).doesNotContain("sync")
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
