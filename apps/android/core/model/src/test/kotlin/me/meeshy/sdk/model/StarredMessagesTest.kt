package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StarredMessagesTest {

    private fun snapshot(
        id: String,
        conversationId: String = "c1",
        starredAtMillis: Long = 0L,
    ) = StarredMessage(
        messageId = id,
        conversationId = conversationId,
        starredAtMillis = starredAtMillis,
    )

    @Test
    fun an_empty_set_stars_nothing() {
        assertThat(StarredMessages().isStarred("m1")).isFalse()
        assertThat(StarredMessages().ids).isEmpty()
    }

    @Test
    fun starring_a_message_marks_it_starred_and_keeps_the_snapshot() {
        val snap = snapshot("m1")
        val starred = StarredMessages().star(snap)

        assertThat(starred.isStarred("m1")).isTrue()
        assertThat(starred.ids).containsExactly("m1")
        assertThat(starred.items).containsExactly(snap)
    }

    @Test
    fun starring_leaves_other_messages_unstarred() {
        val starred = StarredMessages().star(snapshot("m1"))

        assertThat(starred.isStarred("m2")).isFalse()
    }

    @Test
    fun starring_an_already_starred_message_returns_the_same_instance_and_keeps_the_first_snapshot() {
        val first = snapshot("m1", starredAtMillis = 10)
        val once = StarredMessages().star(first)
        val twice = once.star(snapshot("m1", starredAtMillis = 999))

        assertThat(twice).isSameInstanceAs(once)
        assertThat(twice.items.single().starredAtMillis).isEqualTo(10)
    }

    @Test
    fun starring_a_blank_id_is_a_no_op_and_returns_the_same_instance() {
        val start = StarredMessages().star(snapshot("m1"))
        val afterBlank = start.star(snapshot("   "))

        assertThat(afterBlank).isSameInstanceAs(start)
        assertThat(afterBlank.ids).containsExactly("m1")
    }

    @Test
    fun starring_a_second_distinct_message_accumulates() {
        val starred = StarredMessages().star(snapshot("m1")).star(snapshot("m2"))

        assertThat(starred.ids).containsExactly("m1", "m2")
    }

    @Test
    fun unstarring_removes_the_snapshot() {
        val starred = StarredMessages().star(snapshot("m1")).star(snapshot("m2"))
        val after = starred.unstar("m1")

        assertThat(after.isStarred("m1")).isFalse()
        assertThat(after.ids).containsExactly("m2")
    }

    @Test
    fun unstarring_a_message_that_is_not_starred_returns_the_same_instance() {
        val starred = StarredMessages().star(snapshot("m1"))
        val after = starred.unstar("m2")

        assertThat(after).isSameInstanceAs(starred)
    }

    @Test
    fun toggle_stars_an_absent_message() {
        val after = StarredMessages().toggle(snapshot("m1"))

        assertThat(after.isStarred("m1")).isTrue()
    }

    @Test
    fun toggle_unstars_an_already_starred_message() {
        val starred = StarredMessages().star(snapshot("m1"))
        val after = starred.toggle(snapshot("m1"))

        assertThat(after.isStarred("m1")).isFalse()
    }

    @Test
    fun toggle_ignores_the_incoming_snapshot_when_unstarring() {
        val original = snapshot("m1", starredAtMillis = 10)
        val starred = StarredMessages().star(original)
        val after = starred.toggle(snapshot("m1", starredAtMillis = 999))

        assertThat(after.items).isEmpty()
    }

    @Test
    fun sorted_orders_by_starred_at_descending() {
        val a = snapshot("a", starredAtMillis = 100)
        val b = snapshot("b", starredAtMillis = 300)
        val c = snapshot("c", starredAtMillis = 200)
        val starred = StarredMessages(listOf(a, b, c))

        assertThat(starred.sortedByStarredAtDesc.map { it.messageId })
            .containsExactly("b", "c", "a")
            .inOrder()
    }

    @Test
    fun sorted_keeps_insertion_order_on_equal_timestamps() {
        val a = snapshot("a", starredAtMillis = 50)
        val b = snapshot("b", starredAtMillis = 50)
        val starred = StarredMessages(listOf(a, b))

        assertThat(starred.sortedByStarredAtDesc.map { it.messageId })
            .containsExactly("a", "b")
            .inOrder()
    }

    @Test
    fun sorted_over_an_empty_set_is_empty() {
        assertThat(StarredMessages().sortedByStarredAtDesc).isEmpty()
    }

    @Test
    fun remove_conversation_drops_only_that_conversations_stars() {
        val starred = StarredMessages()
            .star(snapshot("m1", conversationId = "c1"))
            .star(snapshot("m2", conversationId = "c2"))
            .star(snapshot("m3", conversationId = "c1"))
        val after = starred.removeConversation("c1")

        assertThat(after.ids).containsExactly("m2")
    }

    @Test
    fun remove_conversation_with_no_matches_returns_the_same_instance() {
        val starred = StarredMessages().star(snapshot("m1", conversationId = "c1"))
        val after = starred.removeConversation("c2")

        assertThat(after).isSameInstanceAs(starred)
    }
}
