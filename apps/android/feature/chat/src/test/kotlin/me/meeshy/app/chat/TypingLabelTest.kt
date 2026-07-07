package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class TypingLabelTest {

    private fun roster(vararg names: String) =
        names.mapIndexed { index, name -> TypingParticipant("u$index", name) }

    @Test
    fun an_empty_roster_yields_none() {
        assertThat(TypingLabel.of(emptyList())).isEqualTo(TypingLabel.None)
    }

    @Test
    fun a_single_typist_yields_one_with_their_name() {
        assertThat(TypingLabel.of(roster("Alice"))).isEqualTo(TypingLabel.One("Alice"))
    }

    @Test
    fun two_typists_yield_two_with_both_names_in_order() {
        assertThat(TypingLabel.of(roster("Alice", "Bob")))
            .isEqualTo(TypingLabel.Two("Alice", "Bob"))
    }

    @Test
    fun three_typists_yield_many_with_the_count() {
        assertThat(TypingLabel.of(roster("Alice", "Bob", "Cara")))
            .isEqualTo(TypingLabel.Many(3))
    }

    @Test
    fun many_typists_are_counted_not_named() {
        assertThat(TypingLabel.of(roster("A", "B", "C", "D", "E")))
            .isEqualTo(TypingLabel.Many(5))
    }
}
