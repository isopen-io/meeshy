package me.meeshy.sdk.model.conversationoptions

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiParticipant
import me.meeshy.sdk.model.MeeshyUser
import org.junit.Test

/**
 * Ce que les infos d'une conversation proposent (#13777) : l'onglet Options iOS
 * (`ConversationPreferencesTab`) et les boutons Partager / Quitter / Bloquer de
 * `ConversationInfoSheet`, rapportés à la loi des actions de conversation.
 */
class ConversationOptionsPlanTest {

    private fun me(id: String = "me") = MeeshyUser(id = id, username = "me", displayName = "Me", role = "USER", isAnonymous = false)

    private fun conversation(
        type: String = "group",
        currentUserRole: String? = "member",
        participants: List<ApiParticipant> = emptyList(),
    ) = ApiConversation(
        id = "c1",
        identifier = "c1",
        type = type,
        title = "Équipe",
        isActive = true,
        currentUserRole = currentUserRole,
        participants = participants,
    )

    private fun plan(
        conversation: ApiConversation,
        user: MeeshyUser? = me(),
        peerUserId: String? = null,
        peerBlocked: Boolean = false,
    ) = ConversationOptionsPlan.of(conversation, user, peerUserId, peerBlocked)

    @Test
    fun `a group member may leave the conversation and the group`() {
        val plan = plan(conversation(type = "group", currentUserRole = "member"))

        assertThat(plan.leave).isTrue()
        assertThat(plan.leaveGroup).isTrue()
        assertThat(plan.blockUserId).isNull()
    }

    @Test
    fun `sharing follows who may mint an invitation link`() {
        assertThat(plan(conversation(type = "group", currentUserRole = "member")).share).isFalse()
        assertThat(plan(conversation(type = "group", currentUserRole = "moderator")).share).isTrue()
        assertThat(plan(conversation(type = "public", currentUserRole = "member")).share).isTrue()
    }

    @Test
    fun `the creator of a group never sees leave the group in Options, as iOS`() {
        val plan = plan(conversation(type = "group", currentUserRole = "CREATOR"))

        assertThat(plan.leaveGroup).isFalse()
    }

    @Test
    fun `the creator role is read from the roster when the row does not carry it`() {
        val plan = plan(
            conversation(
                type = "group",
                currentUserRole = null,
                participants = listOf(ApiParticipant(id = "p1", userId = "me", role = "creator")),
            ),
        )

        assertThat(plan.leaveGroup).isFalse()
        assertThat(plan.leave).isTrue()
    }

    @Test
    fun `a direct conversation offers to block the peer and never to leave`() {
        val plan = plan(conversation(type = "direct", currentUserRole = "member"), peerUserId = "peer")

        assertThat(plan.blockUserId).isEqualTo("peer")
        assertThat(plan.leave).isFalse()
        assertThat(plan.leaveGroup).isFalse()
    }

    @Test
    fun `a peer already blocked, absent, or oneself is never offered to block`() {
        val direct = conversation(type = "direct")

        assertThat(plan(direct, peerUserId = "peer", peerBlocked = true).blockUserId).isNull()
        assertThat(plan(direct, peerUserId = null).blockUserId).isNull()
        assertThat(plan(direct, peerUserId = "me").blockUserId).isNull()
        assertThat(plan(conversation(type = "group"), peerUserId = "peer").blockUserId).isNull()
    }

    @Test
    fun `archive and delete for me are offered to a member`() {
        val plan = plan(conversation())

        assertThat(plan.toggleArchive).isTrue()
        assertThat(plan.deleteForMe).isTrue()
    }

    @Test
    fun `a viewer not loaded yet is offered nothing that writes on the server`() {
        val plan = plan(conversation(), user = null)

        assertThat(plan.share).isFalse()
        assertThat(plan.leave).isFalse()
        assertThat(plan.leaveGroup).isFalse()
        assertThat(plan.deleteForMe).isFalse()
    }
}
