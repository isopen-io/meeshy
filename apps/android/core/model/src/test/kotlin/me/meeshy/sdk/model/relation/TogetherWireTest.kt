package me.meeshy.sdk.model.relation

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.boolean
import org.junit.Test

/** Le fil d'« ensemble » vu du transport Android (#17100) — iso `MessageSocketManager+Together.swift`. */
class TogetherWireTest {
    private fun parse(raw: String): JsonElement = Json.parseToJsonElement(raw)

    private val playback = """{"playing":true,"positionMs":1200,"at":1700000000000,"rev":3,"byUserId":"u1"}"""

    @Test
    fun `l'invitation porte les trois identifiants et rien d'autre`() {
        val payload = TogetherWire.invitePayload(toUserId = "u2", conversationId = "c1", attachmentId = "a1")
        assertThat(payload.keys).containsExactly("toUserId", "conversationId", "attachmentId")
        assertThat(payload.getValue("attachmentId").jsonPrimitive.content).isEqualTo("a1")
    }

    @Test
    fun `rejoindre et quitter ne portent que la seance`() {
        assertThat(TogetherWire.sessionPayload("s1").keys).containsExactly("sessionId")
    }

    @Test
    fun `une synchronisation envoie une position entiere, bornee a zero et a vingt-quatre heures`() {
        val payload = TogetherWire.syncPayload(sessionId = "s1", playing = true, positionMs = 1234.6)
        assertThat(payload.keys).containsExactly("sessionId", "playing", "positionMs")
        assertThat(payload.getValue("playing").jsonPrimitive.boolean).isTrue()
        assertThat(payload.getValue("positionMs").jsonPrimitive.int).isEqualTo(1235)
        assertThat(TogetherWire.syncPayload("s1", false, -5.0).getValue("positionMs").jsonPrimitive.int).isEqualTo(0)
        assertThat(TogetherWire.syncPayload("s1", false, Double.NaN).getValue("positionMs").jsonPrimitive.int).isEqualTo(0)
        assertThat(TogetherWire.syncPayload("s1", false, 1e12).getValue("positionMs").jsonPrimitive.int)
            .isEqualTo(TogetherContract.MAX_POSITION_MS.toInt())
    }

    @Test
    fun `l'accuse d'une synchronisation rend l'etat retenu par le serveur, un refus ne rend rien`() {
        val kept = TogetherWire.syncAck(parse("""{"success":true,"data":{"playback":$playback}}"""))
        assertThat(kept?.rev).isEqualTo(3)
        assertThat(kept?.positionMs).isEqualTo(1200.0)
        assertThat(TogetherWire.syncAck(parse("""{"success":false,"error":"x","code":"TOGETHER_NOT_ALLOWED"}"""))).isNull()
        assertThat(TogetherWire.syncAck(parse("""{"success":true,"data":{}}"""))).isNull()
        assertThat(TogetherWire.syncAck(null)).isNull()
    }

    @Test
    fun `les quatre evenements entrants se lisent chacun dans son type`() {
        val invited = TogetherWire.inbound(
            TogetherEvents.INVITED,
            parse("""{"sessionId":"s1","fromUserId":"u1","conversationId":"c1","attachmentId":"a1","media":"video","expiresAt":"2026-11-13T15:00:00Z"}"""),
        )
        assertThat((invited as TogetherInbound.Invited).data.media).isEqualTo(TogetherMediaKind.VIDEO)

        val started = TogetherWire.inbound(
            TogetherEvents.STARTED,
            parse("""{"sessionId":"s1","hostUserId":"u1","guestUserId":"u2","conversationId":"c1","attachmentId":"a1","media":"audio","playback":$playback}"""),
        )
        assertThat((started as TogetherInbound.Started).data.partner("u2")).isEqualTo("u1")

        val synced = TogetherWire.inbound(TogetherEvents.SYNCED, parse("""{"sessionId":"s1","playback":$playback}"""))
        assertThat((synced as TogetherInbound.Synced).data.playback.playing).isTrue()

        val ended = TogetherWire.inbound(TogetherEvents.ENDED, parse("""{"sessionId":"s1","reason":"declined","endedAt":"2026-11-13T15:00:00Z"}"""))
        assertThat((ended as TogetherInbound.Ended).data.reason).isEqualTo(TogetherEndReason.DECLINED)
    }

    @Test
    fun `une charge illisible ou un evenement etranger ne produit rien`() {
        assertThat(TogetherWire.inbound(TogetherEvents.ENDED, parse("""{"sessionId":"s1","reason":"moonwalk","endedAt":"x"}"""))).isNull()
        assertThat(TogetherWire.inbound(TogetherEvents.SYNCED, parse("""{"sessionId":"s1"}"""))).isNull()
        assertThat(TogetherWire.inbound(TogetherEvents.INVITE, parse("""{"sessionId":"s1"}"""))).isNull()
        assertThat(TogetherWire.inbound("talkie:chunk", parse("{}"))).isNull()
    }

    @Test
    fun `seuls les quatre evenements serveur vers client sont ecoutes`() {
        assertThat(TogetherWire.INBOUND).containsExactly(
            TogetherEvents.INVITED,
            TogetherEvents.STARTED,
            TogetherEvents.SYNCED,
            TogetherEvents.ENDED,
        )
    }
}
