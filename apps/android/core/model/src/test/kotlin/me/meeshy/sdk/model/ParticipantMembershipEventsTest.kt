package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

class ParticipantMembershipEventsTest {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    @Test
    fun `une adhesion porte l'effectif absolu et son plafond`() {
        val e = json.decodeFromString(
            ParticipantJoinedEvent.serializer(),
            """{"conversationId":"c","userId":"u","displayName":"Ana","joinedAt":"2026-10-01T10:00:00.000Z","memberCount":199,"memberCountCapped":true}""",
        )

        assertThat(e.memberCount).isEqualTo(199)
        assertThat(e.memberCountCapped).isTrue()
        assertThat(e.displayName).isEqualTo("Ana")
    }

    @Test
    fun `une adhesion d'un serveur ancien sans effectif se decode`() {
        val e = json.decodeFromString(ParticipantJoinedEvent.serializer(), """{"conversationId":"c","userId":"u"}""")

        assertThat(e.memberCount).isNull()
        assertThat(e.memberCountCapped).isNull()
    }

    @Test
    fun `une levee de bannissement d'un visiteur sans compte se decode et se reconnait par son participantId`() {
        val e = json.decodeFromString(
            ParticipantUnbannedEvent.serializer(),
            """{"conversationId":"c","participantId":"p1","userId":null,"membershipRestored":false,"memberCount":12}""",
        )

        assertThat(e.userId).isNull()
        assertThat(e.names("p1")).isTrue()
        assertThat(e.names("")).isFalse()
        assertThat(e.membershipRestored).isFalse()
        assertThat(e.memberCount).isEqualTo(12)
    }
}
