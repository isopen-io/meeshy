package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.UserStateMutation.*
import org.junit.Test

class UserStateMutationCoalescingTest {

    @Test
    fun `two pins share a key so the last writer wins`() {
        assertThat(SetPinned(true).coalescingKey()).isEqualTo(SetPinned(false).coalescingKey())
    }

    @Test
    fun `tag edits share one key`() {
        val keys = listOf(SetTags(listOf("a")), AddTag("b"), RemoveTag("c")).map { it.coalescingKey() }
        assertThat(keys.toSet()).containsExactly("tags")
    }

    @Test
    fun `read and unread share the readState key`() {
        assertThat(MarkAsRead.coalescingKey()).isEqualTo(MarkAsUnread.coalescingKey())
    }

    @Test
    fun `deleteForUser is never merged with another deleteForUser`() {
        assertThat(DeleteForUser.coalescingKey()).isNotEqualTo(DeleteForUser.coalescingKey())
    }

    @Test
    fun `leave is never merged with another leave`() {
        assertThat(Leave.coalescingKey()).isNotEqualTo(Leave.coalescingKey())
    }

    @Test
    fun `only setLocked is local-only`() {
        assertThat(SetLocked(true).isLocalOnly).isTrue()
        assertThat(SetPinned(true).isLocalOnly).isFalse()
        assertThat(DeleteForUser.isLocalOnly).isFalse()
    }

    @Test
    fun `every mutation survives an encode decode round trip`() {
        val all = listOf(
            SetPinned(true), SetMuted(false), SetMentionsOnly(true), SetArchived(true),
            SetCustomName("Nom"), SetCustomName(null), SetReaction("❤️"), SetSection("cat1"),
            SetSection(null), SetOrderInCategory(3), SetTags(listOf("a", "b")), AddTag("x"),
            RemoveTag("y"), SetClearHistoryBefore("2026-01-01T00:00:00Z"), MarkAsRead,
            MarkAsUnread, DeleteForUser, Leave, SetLocked(true),
        )
        all.forEach { assertThat(UserStateMutation.decode(it.encode())).isEqualTo(it) }
    }

    @Test
    fun `an unknown type from a newer build decodes to null instead of crashing`() {
        assertThat(UserStateMutation.decode("""{"type":"setFuture","value":1}""")).isNull()
        assertThat(UserStateMutation.decode("not json")).isNull()
    }

    @Test
    fun `optimistic application updates the row before the network`() {
        val s = ConversationUserState(unreadCount = 4)
        assertThat(s.applying(SetPinned(true), "t").isPinned).isTrue()
        assertThat(s.applying(MarkAsRead, "t").unreadCount).isEqualTo(0)
        assertThat(s.applying(DeleteForUser, "T").deletedForUserAt).isEqualTo("T")
        assertThat(s.applying(AddTag("a"), "t").applying(AddTag("a"), "t").tags).containsExactly("a")
    }
}
