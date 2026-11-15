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

    /**
     * `senderId` ne voyage PAS sur ce fil — il ne sert qu'à router l'émission côté passerelle
     * (`FriendRequestRejectedEventData` porte `{ friendRequestId, rejecterId }`). Le miroir le
     * déclarait, donc il valait toujours `null` : piège armé retiré (#18159). Ce témoin garde ce
     * qui compte — la clé en trop sur le fil est TOLÉRÉE, elle ne fait pas tomber la trame.
     */
    @Test
    fun `une demande refusee nomme celui qui refuse, une cle en trop ne la casse pas`() {
        val event = json.decodeFromString<FriendRequestRejectedEvent>(
            """{"friendRequestId":"r1","senderId":"u1","rejecterId":"u3"}""",
        )
        assertThat(event.rejecterId).isEqualTo("u3")
        assertThat(event.friendRequestId).isEqualTo("r1")
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

    /**
     * Le titre de ce témoin AFFIRMAIT que la passerelle sert une raison. Elle ne le fait pas :
     * `announceConversationClosed.ts` émet `{ conversationId, closedBy, closedAt }`, et le contrat
     * ne déclare rien d'autre. Le champ `reason` du miroir valait donc toujours `null` — piège armé
     * retiré (#18159). Ce qui RESTE à garder est l'horodatage, qui lui voyage, et la tolérance aux
     * clés en trop.
     */
    @Test
    fun `une fermeture porte son horodatage, et une cle en trop ne la casse pas`() {
        val closed = json.decodeFromString<ConversationClosedSocketEvent>(
            """{"conversationId":"c1","closedBy":"u1","closedAt":"2026-11-01T00:00:00Z","reason":"creator_deleted"}""",
        )
        val old = json.decodeFromString<ConversationClosedSocketEvent>("""{"conversationId":"c1","closedBy":"u1"}""")
        assertThat(closed.closedAt).isEqualTo("2026-11-01T00:00:00Z")
        assertThat(old.closedAt).isNull()
    }

    @Test
    fun `join-error est decode avec son motif`() {
        val error = json.decodeFromString<ConversationJoinErrorEvent>("""{"conversationId":"c1","reason":"banned"}""")
        assertThat(error.isMembershipDenied).isTrue()
    }
}
