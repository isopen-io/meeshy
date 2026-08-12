package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * [PinnedMessagesList.of] — the SSOT for the pinned-messages sheet: every currently
 * pinned message, newest-pin first. Shares the pin predicate / snippet / sender
 * projection with the banner ([PinnedMessages]) so the two never disagree about
 * which messages are pinned or what their preview reads.
 */
class PinnedMessagesListTest {

    private data class FakeMessage(
        override val id: String,
        override val pinnedAtIso: String? = null,
        override val isDeleted: Boolean = false,
        override val isOutgoing: Boolean = false,
        override val senderName: String? = "Alice",
        override val text: String = "hello",
        override val hasImage: Boolean = false,
        override val hasFile: Boolean = false,
    ) : PinnableMessage

    @Test
    fun `no messages yields an empty list`() {
        assertThat(PinnedMessagesList.of(emptyList())).isEmpty()
    }

    @Test
    fun `messages with no pin yield an empty list`() {
        val messages = listOf(FakeMessage("a"), FakeMessage("b"))

        assertThat(PinnedMessagesList.of(messages)).isEmpty()
    }

    @Test
    fun `a blank pinnedAt is not a pin`() {
        assertThat(PinnedMessagesList.of(listOf(FakeMessage("a", pinnedAtIso = "   ")))).isEmpty()
    }

    @Test
    fun `a deleted pinned message is excluded`() {
        val messages = listOf(
            FakeMessage("a", pinnedAtIso = "2026-07-08T10:00:00Z", isDeleted = true),
            FakeMessage("b", pinnedAtIso = "2026-07-08T11:00:00Z"),
        )

        assertThat(PinnedMessagesList.of(messages).map { it.messageId }).containsExactly("b")
    }

    @Test
    fun `a single pinned message maps every field`() {
        val row = PinnedMessagesList.of(
            listOf(
                FakeMessage(
                    "a",
                    pinnedAtIso = "2026-07-08T10:00:00Z",
                    isOutgoing = true,
                    senderName = "Bob",
                    text = "  keep this  ",
                ),
            ),
        ).single()

        assertThat(row.messageId).isEqualTo("a")
        assertThat(row.senderName).isEqualTo("Bob")
        assertThat(row.isOutgoing).isTrue()
        assertThat(row.snippet).isEqualTo(PinnedSnippet.Text("keep this"))
    }

    @Test
    fun `pinned messages are ordered newest pin first`() {
        val messages = listOf(
            FakeMessage("old", pinnedAtIso = "2026-07-08T10:00:00Z"),
            FakeMessage("new", pinnedAtIso = "2026-07-08T12:00:00Z"),
            FakeMessage("mid", pinnedAtIso = "2026-07-08T11:00:00Z"),
        )

        assertThat(PinnedMessagesList.of(messages).map { it.messageId })
            .containsExactly("new", "mid", "old").inOrder()
    }

    @Test
    fun `equal pin instants keep their incoming list order (stable)`() {
        val ts = "2026-07-08T11:00:00Z"
        val messages = listOf(
            FakeMessage("first", pinnedAtIso = ts),
            FakeMessage("second", pinnedAtIso = ts),
        )

        assertThat(PinnedMessagesList.of(messages).map { it.messageId })
            .containsExactly("first", "second").inOrder()
    }

    @Test
    fun `an unparseable pin instant still counts but sorts to the end`() {
        val messages = listOf(
            FakeMessage("bad", pinnedAtIso = "not-a-date"),
            FakeMessage("good", pinnedAtIso = "2026-07-08T11:00:00Z"),
        )

        assertThat(PinnedMessagesList.of(messages).map { it.messageId })
            .containsExactly("good", "bad").inOrder()
    }

    @Test
    fun `text wins over media in the snippet`() {
        val row = PinnedMessagesList.of(
            listOf(FakeMessage("a", pinnedAtIso = "2026-07-08T10:00:00Z", text = "hi", hasImage = true)),
        ).single()

        assertThat(row.snippet).isEqualTo(PinnedSnippet.Text("hi"))
    }

    @Test
    fun `image beats file when there is no text`() {
        val row = PinnedMessagesList.of(
            listOf(FakeMessage("a", pinnedAtIso = "2026-07-08T10:00:00Z", text = "  ", hasImage = true, hasFile = true)),
        ).single()

        assertThat(row.snippet).isEqualTo(PinnedSnippet.Image)
    }

    @Test
    fun `a file-only pin previews as file`() {
        val row = PinnedMessagesList.of(
            listOf(FakeMessage("a", pinnedAtIso = "2026-07-08T10:00:00Z", text = "", hasFile = true)),
        ).single()

        assertThat(row.snippet).isEqualTo(PinnedSnippet.File)
    }

    @Test
    fun `a pin with neither text nor media previews as empty`() {
        val row = PinnedMessagesList.of(
            listOf(FakeMessage("a", pinnedAtIso = "2026-07-08T10:00:00Z", text = "")),
        ).single()

        assertThat(row.snippet).isEqualTo(PinnedSnippet.Empty)
    }

    @Test
    fun `a blank sender name resolves to null`() {
        val row = PinnedMessagesList.of(
            listOf(FakeMessage("a", pinnedAtIso = "2026-07-08T10:00:00Z", senderName = "   ")),
        ).single()

        assertThat(row.senderName).isNull()
    }

    @Test
    fun `the banner features the first row and counts the whole list`() {
        val messages = listOf(
            FakeMessage("old", pinnedAtIso = "2026-07-08T10:00:00Z"),
            FakeMessage("new", pinnedAtIso = "2026-07-08T12:00:00Z"),
        )

        val rows = PinnedMessagesList.of(messages)
        val banner = PinnedMessages.of(messages)

        assertThat(banner).isNotNull()
        assertThat(banner!!.messageId).isEqualTo(rows.first().messageId)
        assertThat(banner.count).isEqualTo(rows.size)
    }
}
