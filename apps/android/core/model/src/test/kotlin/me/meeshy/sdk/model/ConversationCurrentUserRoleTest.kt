package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ConversationCurrentUserRoleTest {

    private fun conversation(participants: List<ApiParticipant>) =
        ApiConversation(id = "c1", participants = participants)

    @Test
    fun the_creator_participant_resolves_to_CREATOR() {
        val conv = conversation(
            listOf(
                ApiParticipant(id = "p1", userId = "me", role = "creator"),
                ApiParticipant(id = "p2", userId = "friend", role = "member"),
            ),
        )

        assertThat(conv.currentUserRole("me")).isEqualTo(MemberRole.CREATOR)
    }

    @Test
    fun a_plain_member_resolves_to_MEMBER() {
        val conv = conversation(listOf(ApiParticipant(id = "p1", userId = "me", role = "member")))

        assertThat(conv.currentUserRole("me")).isEqualTo(MemberRole.MEMBER)
    }

    @Test
    fun an_absent_current_user_id_defaults_to_MEMBER() {
        val conv = conversation(listOf(ApiParticipant(id = "p1", userId = "me", role = "creator")))

        assertThat(conv.currentUserRole(null)).isEqualTo(MemberRole.MEMBER)
    }

    @Test
    fun a_user_not_in_the_participant_list_defaults_to_MEMBER() {
        val conv = conversation(listOf(ApiParticipant(id = "p1", userId = "someone-else", role = "creator")))

        assertThat(conv.currentUserRole("me")).isEqualTo(MemberRole.MEMBER)
    }
}
