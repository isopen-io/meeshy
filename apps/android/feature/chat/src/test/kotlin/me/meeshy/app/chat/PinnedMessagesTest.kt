package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PinnedMessagesTest {

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
    fun `no messages yields no banner`() {
        assertThat(PinnedMessages.of(emptyList())).isNull()
    }

    @Test
    fun `no pinned message yields no banner`() {
        val messages = listOf(
            FakeMessage("a", pinnedAtIso = null),
            FakeMessage("b", pinnedAtIso = null),
        )
        assertThat(PinnedMessages.of(messages)).isNull()
    }

    @Test
    fun `a blank pinnedAt is not a pin`() {
        assertThat(PinnedMessages.of(listOf(FakeMessage("a", pinnedAtIso = "   ")))).isNull()
    }

    @Test
    fun `a single pinned message becomes the banner with count one`() {
        val banner = PinnedMessages.of(
            listOf(FakeMessage("a", pinnedAtIso = "2026-07-08T10:00:00Z", text = "pin me")),
        )
        assertThat(banner).isNotNull()
        assertThat(banner!!.messageId).isEqualTo("a")
        assertThat(banner.count).isEqualTo(1)
        assertThat(banner.snippet).isEqualTo(PinnedSnippet.Text("pin me"))
        assertThat(banner.senderName).isEqualTo("Alice")
    }

    @Test
    fun `a deleted pinned message is excluded`() {
        val banner = PinnedMessages.of(
            listOf(FakeMessage("a", pinnedAtIso = "2026-07-08T10:00:00Z", isDeleted = true)),
        )
        assertThat(banner).isNull()
    }

    @Test
    fun `a deleted pin is dropped from the count and never featured`() {
        val banner = PinnedMessages.of(
            listOf(
                FakeMessage("live", pinnedAtIso = "2026-07-08T10:00:00Z", text = "kept"),
                FakeMessage("gone", pinnedAtIso = "2026-07-08T12:00:00Z", isDeleted = true),
            ),
        )
        assertThat(banner!!.count).isEqualTo(1)
        assertThat(banner.messageId).isEqualTo("live")
    }

    @Test
    fun `the newest pin is featured and count is the total`() {
        val banner = PinnedMessages.of(
            listOf(
                FakeMessage("old", pinnedAtIso = "2026-07-08T09:00:00Z", text = "old"),
                FakeMessage("new", pinnedAtIso = "2026-07-08T11:00:00Z", text = "new"),
                FakeMessage("mid", pinnedAtIso = "2026-07-08T10:00:00Z", text = "mid"),
            ),
        )
        assertThat(banner!!.messageId).isEqualTo("new")
        assertThat(banner.count).isEqualTo(3)
        assertThat(banner.snippet).isEqualTo(PinnedSnippet.Text("new"))
    }

    @Test
    fun `an equal-instant tie keeps the earliest in list order`() {
        val banner = PinnedMessages.of(
            listOf(
                FakeMessage("first", pinnedAtIso = "2026-07-08T10:00:00Z", text = "first"),
                FakeMessage("second", pinnedAtIso = "2026-07-08T10:00:00Z", text = "second"),
            ),
        )
        assertThat(banner!!.messageId).isEqualTo("first")
        assertThat(banner.count).isEqualTo(2)
    }

    @Test
    fun `an unparseable instant never outranks a real one but still counts`() {
        val banner = PinnedMessages.of(
            listOf(
                FakeMessage("bad", pinnedAtIso = "not-a-date", text = "bad"),
                FakeMessage("good", pinnedAtIso = "2026-07-08T10:00:00Z", text = "good"),
            ),
        )
        assertThat(banner!!.messageId).isEqualTo("good")
        assertThat(banner.count).isEqualTo(2)
    }

    @Test
    fun `all-unparseable instants feature the first in list order`() {
        val banner = PinnedMessages.of(
            listOf(
                FakeMessage("x", pinnedAtIso = "bad-1", text = "x"),
                FakeMessage("y", pinnedAtIso = "bad-2", text = "y"),
            ),
        )
        assertThat(banner!!.messageId).isEqualTo("x")
    }

    @Test
    fun `a media-only pin previews as an image`() {
        val banner = PinnedMessages.of(
            listOf(FakeMessage("a", pinnedAtIso = "2026-07-08T10:00:00Z", text = "", hasImage = true)),
        )
        assertThat(banner!!.snippet).isEqualTo(PinnedSnippet.Image)
    }

    @Test
    fun `a file-only pin previews as a file`() {
        val banner = PinnedMessages.of(
            listOf(FakeMessage("a", pinnedAtIso = "2026-07-08T10:00:00Z", text = "", hasFile = true)),
        )
        assertThat(banner!!.snippet).isEqualTo(PinnedSnippet.File)
    }

    @Test
    fun `image beats file when both present with no text`() {
        val banner = PinnedMessages.of(
            listOf(
                FakeMessage("a", pinnedAtIso = "2026-07-08T10:00:00Z", text = "", hasImage = true, hasFile = true),
            ),
        )
        assertThat(banner!!.snippet).isEqualTo(PinnedSnippet.Image)
    }

    @Test
    fun `text wins over media in the preview`() {
        val banner = PinnedMessages.of(
            listOf(
                FakeMessage("a", pinnedAtIso = "2026-07-08T10:00:00Z", text = "caption", hasImage = true),
            ),
        )
        assertThat(banner!!.snippet).isEqualTo(PinnedSnippet.Text("caption"))
    }

    @Test
    fun `an empty pin with no media previews as empty`() {
        val banner = PinnedMessages.of(
            listOf(FakeMessage("a", pinnedAtIso = "2026-07-08T10:00:00Z", text = "  ")),
        )
        assertThat(banner!!.snippet).isEqualTo(PinnedSnippet.Empty)
    }

    @Test
    fun `the featured text is trimmed`() {
        val banner = PinnedMessages.of(
            listOf(FakeMessage("a", pinnedAtIso = "2026-07-08T10:00:00Z", text = "  spaced  ")),
        )
        assertThat(banner!!.snippet).isEqualTo(PinnedSnippet.Text("spaced"))
    }

    @Test
    fun `a blank sender name resolves to null and outgoing is carried`() {
        val banner = PinnedMessages.of(
            listOf(
                FakeMessage("a", pinnedAtIso = "2026-07-08T10:00:00Z", senderName = "   ", isOutgoing = true),
            ),
        )
        assertThat(banner!!.senderName).isNull()
        assertThat(banner.isOutgoing).isTrue()
    }
}
