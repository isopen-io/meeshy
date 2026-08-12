package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ScrollControlContentTest {

    private fun typist(userId: String, name: String) = TypingParticipant(userId, name)

    private fun unreadState(
        count: Int,
        preview: UnreadPreview? = UnreadPreview(
            messageId = "m$count",
            senderName = "Bob",
            text = "hello",
            kind = UnreadPreviewKind.Text,
        ),
    ) = ScrollAffordanceState(
        isAtBottom = false,
        unreadCount = count,
        lastAcknowledgedId = "anchor",
        preview = preview,
    )

    @Test
    fun at_the_bottom_the_control_is_hidden_even_when_someone_is_typing() {
        val content = ScrollControlContent.of(
            affordance = ScrollAffordanceState(isAtBottom = true),
            typing = listOf(typist("u1", "Alice")),
        )

        assertThat(content).isEqualTo(ScrollControlContent.Hidden)
    }

    @Test
    fun at_the_bottom_the_control_is_hidden_even_with_unread() {
        val content = ScrollControlContent.of(
            affordance = unreadState(count = 3).copy(isAtBottom = true),
            typing = emptyList(),
        )

        assertThat(content).isEqualTo(ScrollControlContent.Hidden)
    }

    @Test
    fun scrolled_away_with_one_typist_shows_a_typing_label() {
        val content = ScrollControlContent.of(
            affordance = ScrollAffordanceState(isAtBottom = false),
            typing = listOf(typist("u1", "Alice")),
        )

        assertThat(content).isEqualTo(ScrollControlContent.Typing(TypingLabel.One("Alice")))
    }

    @Test
    fun scrolled_away_with_two_typists_shows_a_two_label() {
        val content = ScrollControlContent.of(
            affordance = ScrollAffordanceState(isAtBottom = false),
            typing = listOf(typist("u1", "Alice"), typist("u2", "Bob")),
        )

        assertThat(content).isEqualTo(ScrollControlContent.Typing(TypingLabel.Two("Alice", "Bob")))
    }

    @Test
    fun scrolled_away_with_three_typists_shows_a_many_label() {
        val content = ScrollControlContent.of(
            affordance = ScrollAffordanceState(isAtBottom = false),
            typing = listOf(typist("u1", "A"), typist("u2", "B"), typist("u3", "C")),
        )

        assertThat(content).isEqualTo(ScrollControlContent.Typing(TypingLabel.Many(3)))
    }

    @Test
    fun typing_takes_priority_over_the_unread_count() {
        val content = ScrollControlContent.of(
            affordance = unreadState(count = 5),
            typing = listOf(typist("u1", "Alice")),
        )

        assertThat(content).isEqualTo(ScrollControlContent.Typing(TypingLabel.One("Alice")))
    }

    @Test
    fun scrolled_away_with_unread_and_nobody_typing_shows_the_unread_count_and_preview() {
        val preview = UnreadPreview(
            messageId = "m1",
            senderName = "Bob",
            text = "hi",
            kind = UnreadPreviewKind.Text,
        )
        val content = ScrollControlContent.of(
            affordance = unreadState(count = 2, preview = preview),
            typing = emptyList(),
        )

        assertThat(content).isEqualTo(ScrollControlContent.Unread(count = 2, preview = preview))
    }

    @Test
    fun an_unread_state_missing_its_preview_still_reports_the_count() {
        val content = ScrollControlContent.of(
            affordance = unreadState(count = 4, preview = null),
            typing = emptyList(),
        )

        assertThat(content).isEqualTo(ScrollControlContent.Unread(count = 4, preview = null))
    }

    @Test
    fun scrolled_away_with_nothing_unread_and_nobody_typing_shows_a_plain_control() {
        val content = ScrollControlContent.of(
            affordance = ScrollAffordanceState(isAtBottom = false, unreadCount = 0),
            typing = emptyList(),
        )

        assertThat(content).isEqualTo(ScrollControlContent.Plain)
    }

    @Test
    fun a_blank_only_typing_roster_falls_through_to_the_unread_state() {
        val content = ScrollControlContent.of(
            affordance = unreadState(count = 1),
            typing = emptyList(),
        )

        assertThat(content).isInstanceOf(ScrollControlContent.Unread::class.java)
    }
}
