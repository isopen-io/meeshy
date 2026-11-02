package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.socket.SocketEventNames
import org.junit.Test

class ConversationNewEventTest {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    private val wire = """{"conversationId":"c1","conversationType":"group","title":"Equipe","creatorId":"u1","participantIds":["u1","u2"],"createdAt":"2026-10-29T10:00:00.000Z"}"""

    @Test
    fun `le nom sur le fil est celui que la passerelle emet`() {
        assertThat(SocketEventNames.CONVERSATION_NEW).isEqualTo("conversation:new")
        assertThat(SocketEventNames.all).contains("conversation:new")
    }

    @Test
    fun `la charge de la passerelle se decode`() {
        val e = json.decodeFromString(ConversationNewEvent.serializer(), wire)

        assertThat(e.conversationId).isEqualTo("c1")
        assertThat(e.conversationType).isEqualTo("group")
        assertThat(e.title).isEqualTo("Equipe")
        assertThat(e.creatorId).isEqualTo("u1")
        assertThat(e.participantIds).containsExactly("u1", "u2").inOrder()
    }

    @Test
    fun `un titre null et des champs absents se decodent sans perdre l'identifiant`() {
        val e = json.decodeFromString(
            ConversationNewEvent.serializer(),
            """{"conversationId":"c2","title":null,"futureField":1}""",
        )

        assertThat(e.conversationId).isEqualTo("c2")
        assertThat(e.title).isNull()
        assertThat(e.participantIds).isEmpty()
    }

    @Test
    fun `la conversation concerne un compte seulement s'il en est participant`() {
        val e = json.decodeFromString(ConversationNewEvent.serializer(), wire)

        assertThat(e.concerns("u2")).isTrue()
        assertThat(e.concerns("u9")).isFalse()
    }

    @Test
    fun `un compte inconnu ou une liste vide ne concerne personne`() {
        val e = json.decodeFromString(ConversationNewEvent.serializer(), wire)

        assertThat(e.concerns(null)).isFalse()
        assertThat(e.concerns("")).isFalse()
        assertThat(ConversationNewEvent(conversationId = "c").concerns("u1")).isFalse()
    }
}
