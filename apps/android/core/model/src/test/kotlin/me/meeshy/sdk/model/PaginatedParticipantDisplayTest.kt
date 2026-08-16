package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PaginatedParticipantDisplayTest {

    @Test
    fun the_display_name_wins_when_the_server_sent_one() {
        val member = PaginatedParticipant(
            id = "p1",
            username = "jdoe",
            firstName = "Jane",
            lastName = "Doe",
            displayName = "Jane D.",
        )

        assertThat(member.displayLabel).isEqualTo("Jane D.")
    }

    @Test
    fun a_blank_display_name_falls_through_to_the_full_name() {
        val member = PaginatedParticipant(
            id = "p1",
            username = "jdoe",
            firstName = "Jane",
            lastName = "Doe",
            displayName = "   ",
        )

        assertThat(member.displayLabel).isEqualTo("Jane Doe")
    }

    @Test
    fun a_first_name_alone_is_not_padded_with_a_trailing_space() {
        val member = PaginatedParticipant(id = "p1", firstName = "Jane", lastName = null)

        assertThat(member.displayLabel).isEqualTo("Jane")
    }

    @Test
    fun the_username_is_used_when_no_name_was_sent_at_all() {
        val member = PaginatedParticipant(id = "p1", username = "jdoe")

        assertThat(member.displayLabel).isEqualTo("jdoe")
    }

    @Test
    fun a_member_the_server_described_with_nothing_still_renders_a_placeholder() {
        assertThat(PaginatedParticipant(id = "p1").displayLabel).isEqualTo("?")
    }

    @Test
    fun an_absent_conversation_role_reads_as_a_plain_member() {
        assertThat(PaginatedParticipant(id = "p1").role).isEqualTo(MemberRole.MEMBER)
    }

    @Test
    fun the_conversation_role_is_parsed_case_insensitively() {
        assertThat(PaginatedParticipant(id = "p1", conversationRole = "ADMIN").role)
            .isEqualTo(MemberRole.ADMIN)
    }
}
