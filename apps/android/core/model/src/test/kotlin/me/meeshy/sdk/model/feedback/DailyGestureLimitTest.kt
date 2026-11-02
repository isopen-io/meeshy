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
}
