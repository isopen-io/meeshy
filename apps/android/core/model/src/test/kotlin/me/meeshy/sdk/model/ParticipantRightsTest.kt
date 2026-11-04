package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

/** Les droits d'un participant : l'écriture d'UN droit, le décodage de la charge réduite, les transitions du fil. */
class ParticipantRightsTest {

    private val wire = Json { ignoreUnknownKeys = true; encodeDefaults = false }

    private fun capabilities(canViewHistory: Boolean? = true) = ParticipantEntryCapabilities(
        canSendMessages = true, canSendFiles = true, canSendImages = true, canSendVideos = true,
        canSendAudios = true, canSendLocations = true, canSendLinks = true, canViewHistory = canViewHistory,
    )

    private fun profile(caps: ParticipantEntryCapabilities? = capabilities(), grant: String? = null) =
        ApiParticipantProfile(
            participantId = "p1", conversationId = "c1", userId = "u1", isAnonymous = false,
            entryCapabilities = caps, historyVisibleFrom = grant,
        )

    private fun event(payload: String): ParticipantRightsUpdatedEvent =
        wire.decodeFromString(ParticipantRightsUpdatedEventSerializer, payload)

    @Test fun `une ecriture n encode qu un seul droit`() {
        ParticipantCapability.entries.forEach { capability ->
            val body = wire.encodeToString(
                ParticipantRightsUpdate.serializer(),
                ParticipantRightsUpdate.single(capability, false),
            )
            val keys = wire.parseToJsonElement(body).let { (it as kotlinx.serialization.json.JsonObject).keys }
            assertThat(keys).hasSize(1)
        }
        assertThat(
            wire.encodeToString(
                ParticipantRightsUpdate.serializer(),
                ParticipantRightsUpdate.single(ParticipantCapability.CAN_SEND_LINKS, true),
            ),
        ).isEqualTo("""{"canSendLinks":true}""")
    }

    @Test fun `la cle historyVisibleFrom nulle explicite est conservee`() {
        assertThat(wire.encodeToString(HistoryGrantUpdate.serializer(), HistoryGrantUpdate(null)))
            .isEqualTo("""{"historyVisibleFrom":null}""")
    }

    @Test fun `with change une capacite et laisse les autres`() {
        val changed = capabilities().with(ParticipantCapability.CAN_SEND_AUDIOS, false)
        assertThat(changed.denied).containsExactly(ParticipantCapability.CAN_SEND_AUDIOS)
    }

    @Test fun `une charge reduite sans canViewHistory se decode et ne dit rien du droit`() {
        val decoded = event(
            """{"conversationId":"c1","participantId":"p1","rights":{"canSendMessages":false}}""",
        )
        assertThat(decoded.rights.canViewHistory).isNull()
        assertThat(decoded.carriesHistoryGrant).isFalse()
    }

    @Test fun `carriesHistoryGrant lit la presence de la cle, jamais sa valeur`() {
        val explicitNull = event("""{"conversationId":"c1","participantId":"p1","historyVisibleFrom":null}""")
        val absent = event("""{"conversationId":"c1","participantId":"p1"}""")
        assertThat(explicitNull.carriesHistoryGrant).isTrue()
        assertThat(explicitNull.historyVisibleFrom).isNull()
        assertThat(absent.carriesHistoryGrant).isFalse()
    }

    @Test fun `un evenement recouvre les droits servis et garde ceux qu il tait`() {
        val next = ParticipantProfileLive.applying(
            event("""{"conversationId":"c1","participantId":"p1","rights":{"canSendImages":false}}"""),
            profile(),
        )
        assertThat(next.entryCapabilities?.denied).containsExactly(ParticipantCapability.CAN_SEND_IMAGES)
        assertThat(next.entryCapabilities?.canViewHistory).isTrue()
    }

    @Test fun `l octroi est pose ou efface seulement si la cle est presente`() {
        val granted = profile(grant = "2026-01-01T00:00:00.000Z")
        val cleared = ParticipantProfileLive.applying(
            event("""{"conversationId":"c1","participantId":"p1","historyVisibleFrom":null}"""), granted,
        )
        val untouched = ParticipantProfileLive.applying(
            event("""{"conversationId":"c1","participantId":"p1"}"""), granted,
        )
        val set = ParticipantProfileLive.applying(
            event("""{"conversationId":"c1","participantId":"p1","historyVisibleFrom":"2026-02-02T00:00:00.000Z"}"""),
            profile(),
        )
        assertThat(cleared.historyVisibleFrom).isNull()
        assertThat(untouched.historyVisibleFrom).isEqualTo("2026-01-01T00:00:00.000Z")
        assertThat(set.historyVisibleFrom).isEqualTo("2026-02-02T00:00:00.000Z")
    }

    @Test fun `sans droits connus une charge incomplete n affirme rien`() {
        val next = ParticipantProfileLive.applying(
            event("""{"conversationId":"c1","participantId":"p1","rights":{"canSendImages":false}}"""),
            profile(caps = null),
        )
        assertThat(next.entryCapabilities).isNull()
    }

    @Test fun `user updated renomme un compte, ignore les autres et les visiteurs`() {
        val renamed = UserUpdatedEvent(userId = "u1", displayName = "Alice B", hasNameGroup = true)
        assertThat(ParticipantProfileLive.repainted(profile(), renamed)?.displayName).isEqualTo("Alice B")
        assertThat(ParticipantProfileLive.repainted(profile(), renamed.copy(userId = "u2"))).isNull()
        assertThat(ParticipantProfileLive.repainted(profile().copy(isAnonymous = true), renamed)).isNull()
        assertThat(ParticipantProfileLive.repainted(profile(), UserUpdatedEvent(userId = "u1"))).isNull()
    }
}
