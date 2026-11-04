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

    // ── Le rôle CONNU : inconnu n'est pas MEMBER (garde de rôle du cache de la fiche, ADR-032) ──

    @Test
    fun the_known_role_prefers_the_server_computed_role() {
        val conv = conversation(listOf(ApiParticipant(id = "p1", userId = "me", role = "member")))
            .copy(currentUserRole = "ADMIN")

        assertThat(conv.knownUserRole("me")).isEqualTo(MemberRole.ADMIN)
    }

    @Test
    fun the_known_role_falls_back_on_the_roster() {
        val conv = conversation(listOf(ApiParticipant(id = "p1", userId = "me", role = "moderator")))

        assertThat(conv.knownUserRole("me")).isEqualTo(MemberRole.MODERATOR)
    }

    @Test
    fun a_reader_absent_from_the_roster_has_no_known_role() {
        val conv = conversation(listOf(ApiParticipant(id = "p1", userId = "someone-else", role = "creator")))

        assertThat(conv.knownUserRole("me")).isNull()
    }

    @Test
    fun without_a_reader_id_no_role_is_known() {
        val conv = conversation(listOf(ApiParticipant(id = "p1", userId = "me", role = "creator")))

        assertThat(conv.knownUserRole(null)).isNull()
    }
}
