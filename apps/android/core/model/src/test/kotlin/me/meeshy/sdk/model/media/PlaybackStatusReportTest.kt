package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MeeshyMediaConsumption
import org.junit.Test

class PlaybackStatusReportTest {

    private val ended = listOf(PlaybackStretch(0, 9_000, StretchEnd.COMPLETED))
    private val paused = listOf(PlaybackStretch(0, 2_000, StretchEnd.PAUSE))

    @Test fun `sans plage il n'y a rien a rapporter`() {
        assertThat(PlaybackStatusReport.build("listened", emptyList(), 0, 9_000)).isNull()
    }

    @Test fun `une plage terminee par la fin du media complete le rapport`() {
        assertThat(PlaybackStatusReport.build("listened", ended, 9_000, 9_000)!!.complete).isTrue()
        assertThat(PlaybackStatusReport.build("listened", paused, 2_000, 9_000)!!.complete).isFalse()
    }

    @Test fun `l'ecoute complete met a jour listenedComplete`() {
        val body = PlaybackStatusReport.build("listened", ended, 9_000, 9_000)!!

        val consumption = PlaybackStatusReport.project(null, body)

        assertThat(consumption!!.listenedComplete).isTrue()
        assertThat(consumption.lastPlayPositionMs).isEqualTo(9_000)
        assertThat(consumption.watchedComplete).isFalse()
    }

    @Test fun `le visionnage complet met a jour watchedComplete`() {
        val body = PlaybackStatusReport.build("watched", ended, 9_000, 9_000)!!

        assertThat(PlaybackStatusReport.project(null, body)!!.watchedComplete).isTrue()
    }

    @Test fun `une completion acquise ne se perd jamais`() {
        val body = PlaybackStatusReport.build("listened", paused, 2_000, 9_000)!!
        val before = MeeshyMediaConsumption(listenedComplete = true, lastPlayPositionMs = 9_000)

        val after = PlaybackStatusReport.project(before, body)!!

        assertThat(after.listenedComplete).isTrue()
        assertThat(after.lastPlayPositionMs).isEqualTo(2_000)
    }

    @Test fun `une action etrangere laisse la consommation intacte`() {
        val body = AttachmentStatusBody("viewed", 0, 0, true)

        assertThat(PlaybackStatusReport.project(null, body)).isNull()
    }
}
