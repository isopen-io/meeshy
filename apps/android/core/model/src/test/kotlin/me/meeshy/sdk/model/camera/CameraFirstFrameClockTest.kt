package me.meeshy.sdk.model.camera

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CameraFirstFrameClockTest {
    @Test
    fun `une session prechauffee est journalisee prewarmed`() {
        val clock = CameraFirstFrameClock().apply { start(prewarmed = true, atMs = 1_000) }
        val report = clock.report(atMs = 1_180)!!
        assertThat(report.elapsedMs).isEqualTo(180L)
        assertThat(report.kind).isEqualTo("prewarmed")
        assertThat(report.logLine).isEqualTo("camera first frame: 180 ms (prewarmed)")
    }

    @Test
    fun `une session a froid est journalisee cold`() {
        val clock = CameraFirstFrameClock().apply { start(prewarmed = false, atMs = 0) }
        assertThat(clock.report(atMs = 650)!!.logLine).isEqualTo("camera first frame: 650 ms (cold)")
    }

    @Test
    fun `seule la premiere trame rapporte`() {
        val clock = CameraFirstFrameClock().apply { start(prewarmed = true, atMs = 0) }
        assertThat(clock.report(atMs = 10)).isNotNull()
        assertThat(clock.report(atMs = 20)).isNull()
    }

    @Test
    fun `sans armement rien n'est rapporte et un rearmement repart de zero`() {
        val clock = CameraFirstFrameClock()
        assertThat(clock.report(atMs = 5)).isNull()
        clock.start(prewarmed = true, atMs = 100)
        clock.start(prewarmed = false, atMs = 200)
        assertThat(clock.report(atMs = 250)!!.logLine).isEqualTo("camera first frame: 50 ms (cold)")
    }
}
