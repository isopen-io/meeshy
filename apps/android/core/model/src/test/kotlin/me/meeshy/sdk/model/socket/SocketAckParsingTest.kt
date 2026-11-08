package me.meeshy.sdk.model.socket

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Test

class SocketAckParsingTest {

    private fun accepted(raw: String, source: SocketAckPayloadSource = SocketAckPayloadSource.AUTO) =
        (SocketAckParsing.parse(raw, source) as SocketAck.Accepted).payload

    private fun refusal(raw: String) = (SocketAckParsing.parse(raw) as SocketAck.Refused).refusal

    @Test
    fun `la charge se lit sous data en automatique`() {
        assertThat(accepted("""{"success":true,"data":{"id":"a"}}""")!!["id"]).isEqualTo(JsonPrimitive("a"))
    }

    @Test
    fun `la charge se lit a la racine quand data est absent`() {
        assertThat(accepted("""{"success":true,"id":"b"}""")!!["id"]).isEqualTo(JsonPrimitive("b"))
    }

    @Test
    fun `la charge demandee a la racine ignore data`() {
        assertThat(accepted("""{"success":true,"id":"r","data":{"id":"d"}}""", SocketAckPayloadSource.ROOT)!!["id"]).isEqualTo(JsonPrimitive("r"))
    }

    @Test
    fun `la charge demandee sous data est absente quand data manque`() {
        assertThat(accepted("""{"success":true,"id":"r"}""", SocketAckPayloadSource.DATA)).isNull()
    }

    @Test
    fun `sans charge attendue l'accuse est accepte sans charge`() {
        assertThat(accepted("""{"success":true,"data":{"id":"d"}}""", SocketAckPayloadSource.NONE)).isNull()
    }

    @Test
    fun `une erreur objet donne code message et fin d'appel`() {
        val r = refusal("""{"success":false,"error":{"code":"CALL_ENDED","message":"over","endReason":"missed"}}""")
        assertThat(r.code).isEqualTo("CALL_ENDED")
        assertThat(r.message).isEqualTo("over")
        assertThat(r.endReason).isEqualTo("missed")
        assertThat(r.errorCode).isEqualTo("CALL_ENDED")
    }

    @Test
    fun `une erreur chaine donne le message sans code`() {
        val r = refusal("""{"success":false,"error":"boom"}""")
        assertThat(r.message).isEqualTo("boom")
        assertThat(r.code).isNull()
    }

    @Test
    fun `le code de la racine prime sur celui de l'erreur`() {
        val r = refusal("""{"success":false,"code":"RATE_LIMITED","error":{"code":"OTHER"}}""")
        assertThat(r.code).isEqualTo("RATE_LIMITED")
        assertThat(r.errorCode).isEqualTo("OTHER")
    }

    @Test
    fun `tous les codes d'ensemble sont rendus tels quels`() {
        SocketAckCodes.ALL.forEach { code ->
            assertThat(refusal("""{"success":false,"code":"$code"}""").code).isEqualTo(code)
        }
    }

    @Test
    fun `une limite du jour reutilise la loi REST`() {
        val limit = refusal("""{"success":false,"code":"DAILY_REACTION_LIMIT","resetAt":"2026-11-03T22:00:00.000Z","limit":200}""").dailyGestureLimit!!
        assertThat(limit.gesture).isEqualTo(me.meeshy.sdk.model.feedback.DailyGestureLimit.Gesture.REACTION)
        assertThat(limit.limit).isEqualTo(200)
        assertThat(limit.resetAtEpochMillis).isEqualTo(me.meeshy.sdk.model.feedback.DailyGestureLimit.parseInstant("2026-11-03T22:00:00Z"))
    }

    @Test
    fun `le mode lent arrondit retryAfter au-dessus`() {
        assertThat(refusal("""{"success":false,"code":"NEWCOMER_SLOW_MODE","retryAfter":12.2}""").newcomerSlowMode?.retryAfterSeconds).isEqualTo(13)
        assertThat(refusal("""{"success":false,"code":"NEWCOMER_SLOW_MODE"}""").newcomerSlowMode?.retryAfterSeconds).isEqualTo(1)
        assertThat(refusal("""{"success":false,"code":"RATE_LIMITED","retryAfter":3}""").newcomerSlowMode).isNull()
        assertThat(refusal("""{"success":false,"code":"RATE_LIMITED","retryAfter":3}""").retryAfter).isEqualTo(3)
    }

    @Test
    fun `un autre refus n'est pas une limite du jour`() {
        assertThat(refusal("""{"success":false,"code":"FORBIDDEN"}""").dailyGestureLimit).isNull()
    }

    @Test
    fun `l'absence d'accuse ou un accuse qui n'est pas un objet est une echeance`() {
        assertThat(SocketAckParsing.parse(null as String?)).isEqualTo(SocketAck.Timeout)
        assertThat(SocketAckParsing.parse("\"No Ack\"")).isEqualTo(SocketAck.Timeout)
        assertThat(SocketAckParsing.parse("pas du json {")).isEqualTo(SocketAck.Timeout)
    }

    @Test
    fun `success absent ou faux est un refus`() {
        assertThat(SocketAckParsing.parse("{}")).isInstanceOf(SocketAck.Refused::class.java)
        assertThat(SocketAckParsing.parse("""{"success":"true"}""")).isInstanceOf(SocketAck.Refused::class.java)
    }
}
