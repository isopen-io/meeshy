package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import java.time.ZoneOffset
import me.meeshy.ui.component.bubble.BubbleContent
import org.junit.Test

private fun bubble(id: String, createdAtIso: String?) = BubbleContent(
    messageId = id,
    text = "m",
    isOutgoing = false,
    isTranslated = false,
    originalText = null,
    senderName = null,
    showSenderName = false,
    isEdited = false,
    isDeleted = false,
    createdAtIso = createdAtIso,
)

class ChatListItemsTest {

    private val zone = ZoneOffset.UTC

    @Test
    fun `an empty list yields no items`() {
        assertThat(buildChatListItems(emptyList(), zone)).isEmpty()
    }

    @Test
    fun `messages of a single day get one header before the first message`() {
        val items = buildChatListItems(
            listOf(
                bubble("m1", "2026-06-11T08:00:00Z"),
                bubble("m2", "2026-06-11T09:00:00Z"),
            ),
            zone,
        )

        assertThat(items).hasSize(3)
        assertThat(items[0]).isInstanceOf(ChatListItem.DayHeader::class.java)
        assertThat((items[1] as ChatListItem.Message).bubble.messageId).isEqualTo("m1")
        assertThat((items[2] as ChatListItem.Message).bubble.messageId).isEqualTo("m2")
    }

    @Test
    fun `a day change inserts a new header`() {
        val items = buildChatListItems(
            listOf(
                bubble("m1", "2026-06-10T23:50:00Z"),
                bubble("m2", "2026-06-11T00:10:00Z"),
            ),
            zone,
        )

        val headers = items.filterIsInstance<ChatListItem.DayHeader>()
        assertThat(headers).hasSize(2)
        assertThat(items.map { it.key }).containsExactly(
            headers[0].key, "m1", headers[1].key, "m2",
        ).inOrder()
    }

    @Test
    fun `the day boundary follows the provided zone not utc`() {
        val items = buildChatListItems(
            listOf(
                bubble("m1", "2026-06-10T23:30:00Z"),
                bubble("m2", "2026-06-11T00:10:00Z"),
            ),
            ZoneOffset.ofHours(2),
        )

        assertThat(items.filterIsInstance<ChatListItem.DayHeader>()).hasSize(1)
    }

    @Test
    fun `a message without timestamp rides with the previous group`() {
        val items = buildChatListItems(
            listOf(
                bubble("m1", "2026-06-11T08:00:00Z"),
                bubble("m2", null),
            ),
            zone,
        )

        assertThat(items.filterIsInstance<ChatListItem.DayHeader>()).hasSize(1)
        assertThat(items.last()).isInstanceOf(ChatListItem.Message::class.java)
    }

    @Test
    fun `a leading message without timestamp gets no header`() {
        val items = buildChatListItems(listOf(bubble("m1", null)), zone)

        assertThat(items).hasSize(1)
        assertThat(items[0]).isInstanceOf(ChatListItem.Message::class.java)
    }

    @Test
    fun `no unread id inserts no separator`() {
        val items = buildChatListItems(
            listOf(bubble("m1", "2026-06-11T08:00:00Z"), bubble("m2", "2026-06-11T09:00:00Z")),
            zone,
            firstUnreadId = null,
        )

        assertThat(items.filterIsInstance<ChatListItem.UnreadSeparator>()).isEmpty()
    }

    @Test
    fun `the separator is inserted immediately before the first unread message`() {
        val items = buildChatListItems(
            listOf(
                bubble("m1", "2026-06-11T08:00:00Z"),
                bubble("m2", "2026-06-11T09:00:00Z"),
                bubble("m3", "2026-06-11T10:00:00Z"),
            ),
            zone,
            firstUnreadId = "m2",
        )

        val idx = items.indexOfFirst { it is ChatListItem.UnreadSeparator }
        assertThat(idx).isAtLeast(0)
        assertThat((items[idx + 1] as ChatListItem.Message).bubble.messageId).isEqualTo("m2")
        // Only one separator, ever.
        assertThat(items.filterIsInstance<ChatListItem.UnreadSeparator>()).hasSize(1)
    }

    @Test
    fun `the separator follows the day header when the first unread opens a new day`() {
        val items = buildChatListItems(
            listOf(
                bubble("m1", "2026-06-10T23:50:00Z"),
                bubble("m2", "2026-06-11T00:10:00Z"),
            ),
            zone,
            firstUnreadId = "m2",
        )

        // header(day1), m1, header(day2), SEPARATOR, m2
        assertThat(items[2]).isInstanceOf(ChatListItem.DayHeader::class.java)
        assertThat(items[3]).isInstanceOf(ChatListItem.UnreadSeparator::class.java)
        assertThat((items[4] as ChatListItem.Message).bubble.messageId).isEqualTo("m2")
    }

    @Test
    fun `an unread id absent from the list inserts no separator`() {
        val items = buildChatListItems(
            listOf(bubble("m1", "2026-06-11T08:00:00Z")),
            zone,
            firstUnreadId = "ghost",
        )

        assertThat(items.filterIsInstance<ChatListItem.UnreadSeparator>()).isEmpty()
    }

    @Test
    fun `no encryption notice is inserted by default`() {
        val items = buildChatListItems(
            listOf(bubble("m1", "2026-06-11T08:00:00Z")),
            zone,
        )

        assertThat(items.filterIsInstance<ChatListItem.EncryptionNotice>()).isEmpty()
    }

    @Test
    fun `the encryption notice sits at the very top above the first day header`() {
        val items = buildChatListItems(
            listOf(
                bubble("m1", "2026-06-11T08:00:00Z"),
                bubble("m2", "2026-06-11T09:00:00Z"),
            ),
            zone,
            showEncryptionNotice = true,
        )

        assertThat(items[0]).isInstanceOf(ChatListItem.EncryptionNotice::class.java)
        assertThat(items[1]).isInstanceOf(ChatListItem.DayHeader::class.java)
        // Only one notice, ever.
        assertThat(items.filterIsInstance<ChatListItem.EncryptionNotice>()).hasSize(1)
    }

    @Test
    fun `the encryption notice renders on an empty conversation as the only row`() {
        val items = buildChatListItems(
            emptyList(),
            zone,
            showEncryptionNotice = true,
        )

        assertThat(items).hasSize(1)
        assertThat(items[0]).isInstanceOf(ChatListItem.EncryptionNotice::class.java)
    }

    @Test
    fun `the notice and the unread separator coexist without disturbing the boundary`() {
        val items = buildChatListItems(
            listOf(
                bubble("m1", "2026-06-11T08:00:00Z"),
                bubble("m2", "2026-06-11T09:00:00Z"),
            ),
            zone,
            firstUnreadId = "m2",
            showEncryptionNotice = true,
        )

        assertThat(items[0]).isInstanceOf(ChatListItem.EncryptionNotice::class.java)
        val sepIdx = items.indexOfFirst { it is ChatListItem.UnreadSeparator }
        assertThat((items[sepIdx + 1] as ChatListItem.Message).bubble.messageId).isEqualTo("m2")
        assertThat(items.filterIsInstance<ChatListItem.EncryptionNotice>()).hasSize(1)
        assertThat(items.filterIsInstance<ChatListItem.UnreadSeparator>()).hasSize(1)
    }
}

class LayoutKeysTest {

    private fun message(id: String, cmid: String? = null) =
        ChatListItem.Message(bubble(id, "2026-10-27T10:00:00Z").copy(clientMessageId = cmid))

    @Test
    fun `a sent bubble keeps its layout key when the ack rekeys its id`() {
        val pending = layoutKeys(listOf(message("cid_1", cmid = "cid_1")))
        val acked = layoutKeys(listOf(message("srv9", cmid = "cid_1")))
        assertThat(acked).isEqualTo(pending)
    }

    @Test
    fun `a received bubble is keyed by its message id`() {
        assertThat(layoutKeys(listOf(message("srv1")))).containsExactly("m-srv1")
    }

    @Test
    fun `a repeated key is made unique so the lazy list never crashes`() {
        val keys = layoutKeys(listOf(message("a", "c"), message("b", "c"), message("c")))
        assertThat(keys.toSet()).hasSize(3)
    }
}

class FocalCellsTest {

    private class Row(
        override val index: Int,
        override val key: Any,
        override val offset: Int = 0,
        override val size: Int = 100,
    ) : androidx.compose.foundation.lazy.LazyListItemInfo

    @Test
    fun `a focal cell is named by the message id the passage compares, not by its layout key`() {
        val rendered = listOf(ChatListItem.Message(bubble("srv9", "2026-10-27T10:00:00Z").copy(clientMessageId = "cid_1")))
        val visible = listOf(Row(index = 0, key = layoutKeys(rendered).single()))

        val cells = focalCells(visible, rendered, viewportHeight = 1000.0, beforePadding = 0.0, density = 1.0)

        assertThat(cells.map { it.id }).containsExactly(rendered.single().key)
    }
}
