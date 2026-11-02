package me.meeshy.sdk.model.call.group

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.PaginatedParticipant
import me.meeshy.sdk.model.call.ActiveCallParticipant
import me.meeshy.sdk.model.call.ActiveCallParticipantUser
import me.meeshy.sdk.model.call.ActiveCallSession
import org.junit.Test

/**
 * Un membre connu seulement par son offre est nommé, et l'appel se renomme quand le principal part — miroirs de iOS
 * `GroupCallMeshCoordinator.enrich` et `GroupCallRoster.callTitle` (#13754).
 */
class GroupCallDirectoryTest {

    private fun session(id: String = "call-1", vararg participants: ActiveCallParticipant) =
        ActiveCallSession(id = id, conversationId = "conv", mode = "p2p", status = "active", participants = participants.toList())

    private fun participant(userId: String, displayName: String? = null, username: String = userId, leftAt: String? = null) =
        ActiveCallParticipant(userId, ActiveCallParticipantUser(userId, username, displayName, avatar = "$userId.png"), leftAt)

    private fun roster(vararg ids: String) =
        ids.fold(GroupCallRoster(localUserId = "me")) { roster, id -> roster.admitting(GroupCallArrival(id)) }

    @Test
    fun `the active call names its present members and says who is still there`() {
        val directory = GroupCallDirectory.fromActiveCall(
            session("call-1", participant("ada", "Ada"), participant("bruno", username = "bruno_b"), participant("cleo", "Cléo", leftAt = "2026-10-29T10:00:00Z")),
            callId = "call-1",
        )

        assertThat(directory.names.keys).containsExactly("ada", "bruno")
        assertThat(directory.names.getValue("bruno").displayName).isEqualTo("bruno_b")
        assertThat(directory.names.getValue("ada").avatarUrl).isEqualTo("ada.png")
        assertThat(directory.presentIds).containsExactly("ada", "bruno")
        assertThat(GroupCallDirectory.fromActiveCall(session("call-2", participant("ada")), callId = "call-1")).isEqualTo(GroupCallDirectory.EMPTY)
    }

    @Test
    fun `the cached conversation names its members, and the active call read later completes it`() {
        val cached = GroupCallDirectory.fromConversation(
            groupTitle = "  ",
            members = listOf(
                PaginatedParticipant(id = "p1", userId = "ada", displayName = "Ada"),
                PaginatedParticipant(id = "p2", userId = "bruno", firstName = "Bruno", lastName = "B."),
                PaginatedParticipant(id = "p3", userId = null, displayName = "Invité"),
            ),
        )
        assertThat(cached.groupTitle).isNull()
        assertThat(cached.names.mapValues { it.value.displayName }).containsExactly("ada", "Ada", "bruno", "Bruno B.")

        val merged = cached.merging(GroupCallDirectory.fromActiveCall(session("call-1", participant("bruno", "Bruno")), "call-1"))
        assertThat(merged.names.getValue("bruno").displayName).isEqualTo("Bruno")
        assertThat(merged.names.getValue("ada").displayName).isEqualTo("Ada")
        assertThat(merged.presentIds).containsExactly("bruno")
    }

    @Test
    fun `a roster member known only by its offer takes the directory's name, nobody is admitted, an announced name stays`() {
        val directory = GroupCallDirectory(
            names = mapOf(
                "bruno" to GroupCallArrival("bruno", displayName = "Bruno", avatarUrl = "b.png"),
                "cleo" to GroupCallArrival("cleo", displayName = "Cléo C.", avatarUrl = "c.png"),
                "zoe" to GroupCallArrival("zoe", "Zoé"),
            ),
        )
        val announced = roster("ada", "bruno").admitting(GroupCallArrival("cleo", displayName = "Cléo"))

        val named = announced.named(directory)

        assertThat(named.members.map { it.userId to it.displayName })
            .containsExactly("ada" to "", "bruno" to "Bruno", "cleo" to "Cléo").inOrder()
        assertThat(named.member("bruno")!!.avatarUrl).isEqualTo("b.png")
        assertThat(named.member("cleo")!!.avatarUrl).isEqualTo("c.png")
        assertThat(roster("ada").named(GroupCallDirectory.EMPTY)).isEqualTo(roster("ada"))
    }

    @Test
    fun `when the primary's seat frees the call is named by the group, else by who remains`() {
        val named = roster("ada", "bruno", "cleo", "dan")
            .named(GroupCallDirectory(names = mapOf("ada" to GroupCallArrival("ada", "Ada"), "bruno" to GroupCallArrival("bruno", "Bruno"))))

        assertThat(GroupCallTitle.of(named, groupTitle = " Famille ")).isEqualTo(GroupCallTitle.Group("Famille"))
        assertThat(GroupCallTitle.of(named, groupTitle = null)).isEqualTo(GroupCallTitle.Members(listOf("Ada", "Bruno"), more = 2))
        assertThat(GroupCallTitle.of(roster("ada"), groupTitle = "")).isEqualTo(GroupCallTitle.Members(listOf(""), more = 0))
        assertThat(GroupCallTitle.of(roster(), groupTitle = null)).isEqualTo(GroupCallTitle.Everyone)
    }
}
