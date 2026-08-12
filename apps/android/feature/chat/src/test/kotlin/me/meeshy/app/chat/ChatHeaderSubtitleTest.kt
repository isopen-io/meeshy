package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ChatHeaderSubtitleTest {

    private fun roster(vararg names: String) =
        names.mapIndexed { index, name -> TypingParticipant("u$index", name) }

    @Test
    fun a_direct_conversation_with_nobody_typing_shows_no_subtitle() {
        assertThat(
            ChatHeaderSubtitle.of(memberCount = 2, isGroup = false, typing = emptyList()),
        ).isEqualTo(ChatHeaderSubtitle.None)
    }

    @Test
    fun a_group_with_nobody_typing_shows_its_member_count() {
        assertThat(
            ChatHeaderSubtitle.of(memberCount = 5, isGroup = true, typing = emptyList()),
        ).isEqualTo(ChatHeaderSubtitle.Members(5))
    }

    @Test
    fun a_group_of_a_single_member_still_shows_the_count() {
        assertThat(
            ChatHeaderSubtitle.of(memberCount = 1, isGroup = true, typing = emptyList()),
        ).isEqualTo(ChatHeaderSubtitle.Members(1))
    }

    @Test
    fun a_group_with_a_zero_member_count_shows_no_subtitle() {
        assertThat(
            ChatHeaderSubtitle.of(memberCount = 0, isGroup = true, typing = emptyList()),
        ).isEqualTo(ChatHeaderSubtitle.None)
    }

    @Test
    fun a_group_with_a_negative_member_count_never_renders_a_count() {
        assertThat(
            ChatHeaderSubtitle.of(memberCount = -3, isGroup = true, typing = emptyList()),
        ).isEqualTo(ChatHeaderSubtitle.None)
    }

    @Test
    fun typing_supersedes_the_member_count_in_a_group() {
        assertThat(
            ChatHeaderSubtitle.of(memberCount = 8, isGroup = true, typing = roster("Alice")),
        ).isEqualTo(ChatHeaderSubtitle.Typing(TypingLabel.One("Alice")))
    }

    @Test
    fun typing_shows_in_a_direct_conversation_too() {
        assertThat(
            ChatHeaderSubtitle.of(memberCount = 2, isGroup = false, typing = roster("Bob")),
        ).isEqualTo(ChatHeaderSubtitle.Typing(TypingLabel.One("Bob")))
    }

    @Test
    fun two_typists_propagate_the_two_label() {
        assertThat(
            ChatHeaderSubtitle.of(memberCount = 4, isGroup = true, typing = roster("Alice", "Bob")),
        ).isEqualTo(ChatHeaderSubtitle.Typing(TypingLabel.Two("Alice", "Bob")))
    }

    @Test
    fun three_or_more_typists_propagate_the_many_count() {
        assertThat(
            ChatHeaderSubtitle.of(
                memberCount = 10,
                isGroup = true,
                typing = roster("Alice", "Bob", "Cara"),
            ),
        ).isEqualTo(ChatHeaderSubtitle.Typing(TypingLabel.Many(3)))
    }
}
