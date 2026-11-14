package me.meeshy.sdk.model.reading.focal

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import me.meeshy.sdk.model.CallSummaryMetadata
import me.meeshy.sdk.model.CallSummaryMetadata.MediaType
import me.meeshy.sdk.model.CallSummaryMetadata.Outcome
import me.meeshy.sdk.model.CallSummaryParticipant
import org.junit.Test

/**
 * A1.2 — la ligne des participants sous le titre de la carte d'appel. Mêmes vecteurs que
 * `CallSummaryMetadataTests.swift` (iOS `participantsLine`) : « Awa, Karim, Lina et vous ».
 */
class FocalCallParticipantsTest {

    private val team = listOf(
        CallSummaryParticipant("u_awa", "Awa"),
        CallSummaryParticipant("u_me", "Charles"),
        CallSummaryParticipant("u_karim", "Karim"),
        CallSummaryParticipant("u_lina", "Lina"),
    )

    private fun summary(participants: List<CallSummaryParticipant>?) = CallSummaryMetadata(
        callId = "c1", initiatorId = "u_a", callType = MediaType.VIDEO, outcome = Outcome.COMPLETED, durationSeconds = 760,
        bytesTotal = null, bytesEstimated = false, networkQuality = null, participants = participants,
    )

    private fun metadata(participantsJson: String?): JsonObject {
        val tail = participantsJson?.let { ""","participants":$it""" }.orEmpty()
        return Json.parseToJsonElement(
            """{"kind":"call","callId":"c1","initiatorId":"u","callType":"audio","outcome":"completed","durationSeconds":42$tail}""",
        ) as JsonObject
    }

    @Test fun `les pairs d'abord puis moi, jamais mon propre nom`() {
        val roster = FocalCallParticipants.of(summary(team), viewerId = "u_me")
        assertThat(roster?.others).containsExactly("Awa", "Karim", "Lina").inOrder()
        assertThat(roster?.viewerTookPart).isTrue()
        assertThat(roster?.names("vous")).containsExactly("Awa", "Karim", "Lina", "vous").inOrder()
    }

    @Test fun `la ligne se resout par lecteur, depuis le meme message`() {
        val roster = FocalCallParticipants.of(summary(team), viewerId = "u_awa")
        assertThat(roster?.names("vous")).containsExactly("Charles", "Karim", "Lina", "vous").inOrder()
    }

    @Test fun `un duo se lit en deux noms`() {
        val duo = listOf(team[0], team[1])
        assertThat(FocalCallParticipants.of(summary(duo), "u_me")?.names("vous")).containsExactly("Awa", "vous").inOrder()
    }

    @Test fun `un lecteur qui n'a pas pris part n'est pas ajoute comme moi`() {
        val roster = FocalCallParticipants.of(summary(listOf(team[0], team[2])), viewerId = "u_me")
        assertThat(roster?.viewerTookPart).isFalse()
        assertThat(roster?.names("vous")).containsExactly("Awa", "Karim").inOrder()
    }

    @Test fun `un identifiant de lecteur vide n'est jamais moi`() {
        val roster = FocalCallParticipants.of(summary(team), viewerId = "")
        assertThat(roster?.viewerTookPart).isFalse()
        assertThat(roster?.others).hasSize(4)
    }

    @Test fun `aucune ligne quand aucun autre nom n'est servi`() {
        assertThat(FocalCallParticipants.of(summary(null), "u_me")).isNull()
        assertThat(FocalCallParticipants.of(summary(emptyList()), "u_me")).isNull()
        assertThat(FocalCallParticipants.of(summary(listOf(team[1])), "u_me")).isNull()
        assertThat(FocalCallParticipants.of(summary(listOf(CallSummaryParticipant("u_x", "  "), team[1])), "u_me")).isNull()
    }

    @Test fun `les noms servis sont rognes`() {
        val roster = FocalCallParticipants.of(summary(listOf(CallSummaryParticipant("u_x", "  Awa "), team[1])), "u_me")
        assertThat(roster?.names("vous")).containsExactly("Awa", "vous").inOrder()
    }

    @Test fun `le decodeur lit les participants servis`() {
        val parsed = CallSummaryMetadata.parse(metadata("""[{"userId":"u_awa","displayName":"Awa"},{"userId":"u_me","displayName":"Charles"}]"""))
        assertThat(parsed?.participants).containsExactly(CallSummaryParticipant("u_awa", "Awa"), CallSummaryParticipant("u_me", "Charles")).inOrder()
    }

    @Test fun `la cle absente laisse participants nul`() {
        assertThat(CallSummaryMetadata.parse(metadata(null))?.participants).isNull()
    }

    @Test fun `une cle malformee ne fait jamais echouer le decodage de la carte`() {
        listOf(""""Awa"""", "42", "{}", """[{"userId":"u_awa"}]""", """["x"]""", """[{"userId":7,"displayName":null}]""", "null").forEach { raw ->
            val parsed = CallSummaryMetadata.parse(metadata(raw))
            assertThat(parsed).isNotNull()
            assertThat(parsed?.callId).isEqualTo("c1")
            assertThat(parsed?.participants).isNull()
        }
    }
}
