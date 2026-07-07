package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class TypingParticipantsTest {

    private fun participant(userId: String, name: String) = TypingParticipant(userId, name)

    @Test
    fun started_adds_the_first_typing_user() {
        val next = TypingParticipants.started(emptyList(), userId = "u1", name = "Alice")

        assertThat(next).containsExactly(participant("u1", "Alice"))
    }

    @Test
    fun started_appends_a_new_user_at_the_tail_preserving_earlier_ones() {
        val current = listOf(participant("u1", "Alice"))

        val next = TypingParticipants.started(current, userId = "u2", name = "Bob")

        assertThat(next).containsExactly(
            participant("u1", "Alice"),
            participant("u2", "Bob"),
        ).inOrder()
    }

    @Test
    fun started_from_the_same_user_refreshes_the_name_and_moves_them_to_the_tail() {
        val current = listOf(participant("u1", "Alice"), participant("u2", "Bob"))

        val next = TypingParticipants.started(current, userId = "u1", name = "Alice A.")

        assertThat(next).containsExactly(
            participant("u2", "Bob"),
            participant("u1", "Alice A."),
        ).inOrder()
    }

    @Test
    fun started_keeps_two_distinct_users_who_share_a_name_as_separate_entries() {
        val current = listOf(participant("u1", "Alex"))

        val next = TypingParticipants.started(current, userId = "u2", name = "Alex")

        assertThat(next).containsExactly(
            participant("u1", "Alex"),
            participant("u2", "Alex"),
        ).inOrder()
    }

    @Test
    fun started_excludes_the_local_user_from_their_own_typing_roster() {
        val next = TypingParticipants.started(
            emptyList(),
            userId = "me",
            name = "Me",
            selfId = "me",
        )

        assertThat(next).isEmpty()
    }

    @Test
    fun started_still_admits_other_users_when_a_self_id_is_provided() {
        val next = TypingParticipants.started(
            emptyList(),
            userId = "u1",
            name = "Alice",
            selfId = "me",
        )

        assertThat(next).containsExactly(participant("u1", "Alice"))
    }

    @Test
    fun started_falls_back_to_the_user_id_when_the_resolved_name_is_blank() {
        val next = TypingParticipants.started(emptyList(), userId = "u1", name = "   ")

        assertThat(next).containsExactly(participant("u1", "u1"))
    }

    @Test
    fun started_ignores_a_blank_user_id() {
        val current = listOf(participant("u1", "Alice"))

        val next = TypingParticipants.started(current, userId = "  ", name = "Ghost")

        assertThat(next).isEqualTo(current)
    }

    @Test
    fun stopped_removes_the_matching_user() {
        val current = listOf(participant("u1", "Alice"), participant("u2", "Bob"))

        val next = TypingParticipants.stopped(current, userId = "u1")

        assertThat(next).containsExactly(participant("u2", "Bob"))
    }

    @Test
    fun stopped_removes_only_the_matching_user_not_a_same_named_other() {
        val current = listOf(participant("u1", "Alex"), participant("u2", "Alex"))

        val next = TypingParticipants.stopped(current, userId = "u1")

        assertThat(next).containsExactly(participant("u2", "Alex"))
    }

    @Test
    fun stopped_for_an_unknown_user_is_inert() {
        val current = listOf(participant("u1", "Alice"))

        val next = TypingParticipants.stopped(current, userId = "u9")

        assertThat(next).isEqualTo(current)
    }

    @Test
    fun stopped_on_an_empty_roster_stays_empty() {
        assertThat(TypingParticipants.stopped(emptyList(), userId = "u1")).isEmpty()
    }
}
