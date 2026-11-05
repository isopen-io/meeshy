package me.meeshy.sdk.model.sync

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiParticipant
import me.meeshy.sdk.model.ConversationViewerCapabilities
import me.meeshy.sdk.model.ParticipantBannedEvent
import me.meeshy.sdk.model.ParticipantLeftEvent
import me.meeshy.sdk.model.ParticipantRoleUpdatedEvent
import org.junit.Test

class ParticipantFoldTest {

    private fun group(memberCount: Int = 3, role: String? = "member") = ApiConversation(
        id = "c1",
        type = "group",
        participants = listOf(
            ApiParticipant(id = "p-me", userId = "me", role = "member"),
            ApiParticipant(id = "p-a", userId = "alice", role = "member"),
            ApiParticipant(id = "p-b", userId = "bob", role = "member"),
        ),
        serverMemberCount = memberCount,
        currentUserRole = role,
    )

    @Test
    fun `me leaving removes the conversation`() {
        val outcome = ParticipantFold.left(group(), ParticipantLeftEvent("c1", userId = "me"), "me")
        assertThat(outcome).isEqualTo(ParticipantFold.Outcome.Removed)
    }

    @Test
    fun `a guest naming me by participant id also removes the conversation`() {
        val outcome = ParticipantFold.left(group(), ParticipantLeftEvent("c1", participantId = "g1"), "g1")
        assertThat(outcome).isEqualTo(ParticipantFold.Outcome.Removed)
    }

    @Test
    fun `another member leaving drops their row and the count`() {
        val outcome = ParticipantFold.left(group(), ParticipantLeftEvent("c1", userId = "alice"), "me")
        val row = (outcome as ParticipantFold.Outcome.Updated).conversation
        assertThat(row.participants.map { it.userId }).containsExactly("me", "bob")
        assertThat(row.memberCount).isEqualTo(2)
    }

    @Test
    fun `replaying the same departure changes nothing`() {
        val first = ParticipantFold.left(group(), ParticipantLeftEvent("c1", userId = "alice"), "me")
        val row = (first as ParticipantFold.Outcome.Updated).conversation
        assertThat(ParticipantFold.left(row, ParticipantLeftEvent("c1", userId = "alice"), "me"))
            .isEqualTo(ParticipantFold.Outcome.Unchanged)
    }

    @Test
    fun `a departure outside a truncated roster still lowers the count`() {
        val truncated = group(memberCount = 40)
        val outcome = ParticipantFold.left(truncated, ParticipantLeftEvent("c1", userId = "zoe"), "me")
        assertThat((outcome as ParticipantFold.Outcome.Updated).conversation.memberCount).isEqualTo(39)
    }

    @Test
    fun `being banned removes the conversation and another ban shrinks it`() {
        assertThat(ParticipantFold.banned(group(), ParticipantBannedEvent("c1", userId = "me"), "me"))
            .isEqualTo(ParticipantFold.Outcome.Removed)
        val other = ParticipantFold.banned(group(), ParticipantBannedEvent("c1", userId = "bob"), "me")
        assertThat((other as ParticipantFold.Outcome.Updated).conversation.memberCount).isEqualTo(2)
    }

    @Test
    fun `my role change updates the reader rank and my roster row`() {
        val row = ParticipantFold.roleUpdated(group(), ParticipantRoleUpdatedEvent("c1", "me", "admin"), "me")!!
        assertThat(row.currentUserRole).isEqualTo("admin")
        assertThat(row.participants.first { it.userId == "me" }.role).isEqualTo("admin")
    }

    @Test
    fun `another member role change leaves the reader rank alone`() {
        val row = ParticipantFold.roleUpdated(group(), ParticipantRoleUpdatedEvent("c1", "alice", "moderator"), "me")!!
        assertThat(row.currentUserRole).isEqualTo("member")
        assertThat(row.participants.first { it.userId == "alice" }.role).isEqualTo("moderator")
    }

    @Test
    fun `the same role again or a blank role changes nothing`() {
        assertThat(ParticipantFold.roleUpdated(group(), ParticipantRoleUpdatedEvent("c1", "me", "member"), "me")).isNull()
        assertThat(ParticipantFold.roleUpdated(group(), ParticipantRoleUpdatedEvent("c1", "me", ""), "me")).isNull()
    }

    /** #15987 — promu, le lecteur prend la capacité que l'événement lui remet. */
    @Test
    fun `my promotion carries my recomputed capability`() {
        val stale = group().copy(viewerCapabilities = ConversationViewerCapabilities(canMakeObsolete = false))
        val event = ParticipantRoleUpdatedEvent("c1", "me", "admin", viewerCapabilities = ConversationViewerCapabilities(canMakeObsolete = true))

        val row = ParticipantFold.roleUpdated(stale, event, "me")!!

        assertThat(row.viewerCapabilities).isEqualTo(ConversationViewerCapabilities(canMakeObsolete = true))
    }

    /** Serveur antérieur : la capacité de l'ancien rang s'efface, la règle locale reprend. */
    @Test
    fun `my role change without a capability clears the stale one`() {
        val stale = group().copy(viewerCapabilities = ConversationViewerCapabilities(canMakeObsolete = false))

        val row = ParticipantFold.roleUpdated(stale, ParticipantRoleUpdatedEvent("c1", "me", "admin"), "me")!!

        assertThat(row.viewerCapabilities).isNull()
    }

    @Test
    fun `another member's capability never lands on my row`() {
        val mine = group().copy(viewerCapabilities = ConversationViewerCapabilities(canMakeObsolete = false))
        val event = ParticipantRoleUpdatedEvent("c1", "alice", "admin", viewerCapabilities = ConversationViewerCapabilities(canMakeObsolete = true))

        val row = ParticipantFold.roleUpdated(mine, event, "me")!!

        assertThat(row.viewerCapabilities).isEqualTo(ConversationViewerCapabilities(canMakeObsolete = false))
    }
}
