package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class TypingAvatarStackTest {

    private fun participant(userId: String, name: String, avatarUrl: String? = null) =
        TypingParticipant(userId = userId, name = name, avatarUrl = avatarUrl)

    @Test
    fun an_empty_roster_produces_no_chips_and_no_overflow() {
        val stack = TypingAvatarStack.of(emptyList())

        assertThat(stack.visible).isEmpty()
        assertThat(stack.overflow).isEqualTo(0)
    }

    @Test
    fun a_single_typer_yields_one_chip_and_no_overflow() {
        val stack = TypingAvatarStack.of(listOf(participant("u1", "Alice", "alice.png")))

        assertThat(stack.visible).containsExactly(
            TypingAvatarChip(userId = "u1", name = "Alice", avatarUrl = "alice.png"),
        )
        assertThat(stack.overflow).isEqualTo(0)
    }

    @Test
    fun the_chip_carries_a_null_avatar_when_the_participant_has_none() {
        val stack = TypingAvatarStack.of(listOf(participant("u1", "Alice", avatarUrl = null)))

        assertThat(stack.visible.single().avatarUrl).isNull()
    }

    @Test
    fun a_roster_at_the_visible_cap_shows_every_chip_with_no_overflow() {
        val stack = TypingAvatarStack.of(
            listOf(
                participant("u1", "Alice"),
                participant("u2", "Bob"),
                participant("u3", "Carol"),
            ),
        )

        assertThat(stack.visible.map { it.userId }).containsExactly("u1", "u2", "u3").inOrder()
        assertThat(stack.overflow).isEqualTo(0)
    }

    @Test
    fun a_roster_beyond_the_cap_truncates_and_reports_the_overflow_count() {
        val stack = TypingAvatarStack.of(
            listOf(
                participant("u1", "Alice"),
                participant("u2", "Bob"),
                participant("u3", "Carol"),
                participant("u4", "Dan"),
                participant("u5", "Eve"),
            ),
        )

        assertThat(stack.visible.map { it.userId }).containsExactly("u1", "u2", "u3").inOrder()
        assertThat(stack.overflow).isEqualTo(2)
    }

    @Test
    fun the_visible_chips_preserve_roster_order() {
        val stack = TypingAvatarStack.of(
            listOf(
                participant("u3", "Carol"),
                participant("u1", "Alice"),
                participant("u2", "Bob"),
                participant("u4", "Dan"),
            ),
        )

        assertThat(stack.visible.map { it.name }).containsExactly("Carol", "Alice", "Bob").inOrder()
        assertThat(stack.overflow).isEqualTo(1)
    }

    @Test
    fun a_zero_cap_shows_nothing_and_folds_everyone_into_the_overflow() {
        val stack = TypingAvatarStack.of(
            listOf(participant("u1", "Alice"), participant("u2", "Bob")),
            maxVisible = 0,
        )

        assertThat(stack.visible).isEmpty()
        assertThat(stack.overflow).isEqualTo(2)
    }

    @Test
    fun a_negative_cap_is_treated_as_zero() {
        val stack = TypingAvatarStack.of(
            listOf(participant("u1", "Alice")),
            maxVisible = -5,
        )

        assertThat(stack.visible).isEmpty()
        assertThat(stack.overflow).isEqualTo(1)
    }

    @Test
    fun a_cap_of_one_shows_the_first_and_overflows_the_rest() {
        val stack = TypingAvatarStack.of(
            listOf(participant("u1", "Alice"), participant("u2", "Bob")),
            maxVisible = 1,
        )

        assertThat(stack.visible.map { it.userId }).containsExactly("u1")
        assertThat(stack.overflow).isEqualTo(1)
    }
}
