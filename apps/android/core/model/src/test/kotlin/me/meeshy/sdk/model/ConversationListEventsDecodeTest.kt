package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

class ConversationListEventsDecodeTest {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false; coerceInputValues = true }

    @Test
    fun `une demande annulee nomme l'autre partie`() {
        val event = json.decodeFromString<FriendRequestCancelledEvent>("""{"friendRequestId":"r1","cancelledBy":"u2"}""")
        assertThat(event.cancelledBy).isEqualTo("u2")
        assertThat(event.friendRequestId).isEqualTo("r1")
    }

    @Test
    fun `une demande annulee sans identifiant de demande reste lisible`() {
        assertThat(json.decodeFromString<FriendRequestCancelledEvent>("""{"cancelledBy":"u2"}""").friendRequestId).isNull()
    }

    @Test
    fun `une demande refusee nomme celui qui refuse, senderId n'est pas requis`() {
        val event = json.decodeFromString<FriendRequestRejectedEvent>("""{"friendRequestId":"r1","rejecterId":"u3"}""")
        assertThat(event.rejecterId).isEqualTo("u3")
        assertThat(event.senderId).isNull()
    }

    @Test
    fun `le changement de role porte les infos du participant`() {
        val event = json.decodeFromString<ParticipantRoleUpdatedEvent>(
            """{"conversationId":"c1","userId":"u1","newRole":"admin","updatedBy":"u9",
               "participant":{"id":"p1","role":"USER","conversationRole":"admin","displayName":"Ana","userId":"u1"}}""",
        )
        assertThat(event.role).isEqualTo("admin")
        assertThat(event.updatedBy).isEqualTo("u9")
        assertThat(event.participant?.conversationRole).isEqualTo("admin")
        assertThat(event.participant?.displayName).isEqualTo("Ana")
    }

    @Test
    fun `un bloc participant nul ou malforme ne jette pas l'evenement`() {
        val nul = json.decodeFromString<ParticipantRoleUpdatedEvent>(
            """{"conversationId":"c1","userId":"u1","newRole":"member","participant":null}""",
        )
        val malforme = json.decodeFromString<ParticipantRoleUpdatedEvent>(
            """{"conversationId":"c1","userId":"u1","newRole":"member","participant":"x"}""",
        )
        assertThat(nul.participant).isNull()
        assertThat(malforme.participant).isNull()
        assertThat(malforme.role).isEqualTo("member")
    }

    @Test
    fun `une fermeture porte sa raison quand la passerelle la sert`() {
        val closed = json.decodeFromString<ConversationClosedSocketEvent>(
            """{"conversationId":"c1","closedBy":"u1","closedAt":"2026-11-01T00:00:00Z","reason":"creator_deleted"}""",
        )
        val old = json.decodeFromString<ConversationClosedSocketEvent>("""{"conversationId":"c1","closedBy":"u1"}""")
        assertThat(closed.reason).isEqualTo("creator_deleted")
        assertThat(old.reason).isNull()
    }

    @Test
    fun `join-error est decode avec son motif`() {
        val error = json.decodeFromString<ConversationJoinErrorEvent>("""{"conversationId":"c1","reason":"banned"}""")
        assertThat(error.isMembershipDenied).isTrue()
    }
}
