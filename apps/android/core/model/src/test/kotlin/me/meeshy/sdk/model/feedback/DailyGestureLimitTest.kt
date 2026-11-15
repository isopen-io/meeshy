package me.meeshy.sdk.model.feedback

import com.google.common.truth.Truth.assertThat
import java.time.ZoneId
import java.util.Locale
import org.junit.Test

class DailyGestureLimitTest {
    @Test fun `les deux codes de limite sont reconnus`() {
        assertThat(DailyGestureLimit.from("DAILY_COMMENT_LIMIT", null)?.gesture).isEqualTo(DailyGestureLimit.Gesture.COMMENT)
        assertThat(DailyGestureLimit.from("DAILY_REACTION_LIMIT", null)?.gesture).isEqualTo(DailyGestureLimit.Gesture.REACTION)
    }

    @Test fun `un autre code n est pas une limite du jour`() {
        assertThat(DailyGestureLimit.from("RATE_LIMITED", "2026-11-03T00:00:00Z")).isNull()
        assertThat(DailyGestureLimit.from(null, null)).isNull()
    }

    @Test fun `l heure de remise a zero suit le fuseau de l appareil`() {
        val limit = DailyGestureLimit.from("DAILY_COMMENT_LIMIT", "2026-11-03T00:00:00Z")!!
        val paris = limit.resetTimeLabel(ZoneId.of("Europe/Paris"), Locale.FRANCE)
        val tokyo = limit.resetTimeLabel(ZoneId.of("Asia/Tokyo"), Locale.FRANCE)
        assertThat(paris).contains("01")
        assertThat(tokyo).contains("09")
    }

    @Test fun `sans heure ou avec une heure illisible il n y a pas d etiquette`() {
        assertThat(DailyGestureLimit.from("DAILY_REACTION_LIMIT", null)!!.resetTimeLabel()).isNull()
        assertThat(DailyGestureLimit.from("DAILY_REACTION_LIMIT", "pas une date")!!.resetTimeLabel()).isNull()
    }

    @Test
    fun `l'accuse socket porte le code, resetAt et limit`() {
        val limit = DailyGestureLimit.fromAck(
            mapOf("success" to false, "code" to "DAILY_REACTION_LIMIT", "resetAt" to "2026-11-03T22:00:00.000Z", "limit" to 200),
        )!!
        assertThat(limit.gesture).isEqualTo(DailyGestureLimit.Gesture.REACTION)
        assertThat(limit.resetAtEpochMillis).isEqualTo(1_793_743_200_000L)
        assertThat(limit.limit).isEqualTo(200)
    }

    @Test
    fun `l'accuse d'un autre refus ou sans code n'est pas une limite du jour`() {
        assertThat(DailyGestureLimit.fromAck(mapOf("code" to "FORBIDDEN"))).isNull()
        assertThat(DailyGestureLimit.fromAck(emptyMap())).isNull()
    }

    @Test
    fun `la limite d'une enveloppe REST garde son plafond`() {
        assertThat(DailyGestureLimit.from("DAILY_COMMENT_LIMIT", "2026-11-03T22:00:00Z", 50)?.limit).isEqualTo(50)
        assertThat(DailyGestureLimit.from("DAILY_COMMENT_LIMIT", null)?.limit).isNull()
    }

    @Test
    fun `parseInstant accepte avec ou sans millisecondes et refuse le reste`() {
        assertThat(DailyGestureLimit.parseInstant("2026-11-03T22:00:00Z")).isEqualTo(DailyGestureLimit.parseInstant("2026-11-03T22:00:00.000Z"))
        assertThat(DailyGestureLimit.parseInstant("")).isNull()
        assertThat(DailyGestureLimit.parseInstant("demain")).isNull()
    }

    @Test
    fun `la raison d'echec de la file se relit sans perte`() {
        val limit = DailyGestureLimit(DailyGestureLimit.Gesture.COMMENT, 1_793_743_200_000L, 50)
        assertThat(limit.reason).contains("DAILY_COMMENT_LIMIT")
        assertThat(DailyGestureLimit.fromReason(limit.reason)).isEqualTo(limit)
    }

    @Test
    fun `une raison sans heure ni plafond reste une limite du jour`() {
        val limit = DailyGestureLimit.fromReason("Refused: HTTP 429 DAILY_REACTION_LIMIT")
        assertThat(limit).isEqualTo(DailyGestureLimit(DailyGestureLimit.Gesture.REACTION, null, null))
        assertThat(DailyGestureLimit.fromReason("Refused: HTTP 404 POST_NOT_FOUND")).isNull()
        assertThat(DailyGestureLimit.fromReason(null)).isNull()
    }
}
