package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class DegradedLinkTrackerTest {
    private fun fold(vararg levels: VideoQualityLevel) =
        levels.fold(DegradedLinkTracker()) { tracker, level -> tracker.record(level) }

    @Test
    fun `un seul tick dégradé n'alerte pas`() {
        assertThat(fold(VideoQualityLevel.POOR).isDegraded).isFalse()
    }

    @Test
    fun `le deuxième tick dégradé consécutif alerte`() {
        assertThat(fold(VideoQualityLevel.POOR, VideoQualityLevel.CRITICAL).isDegraded).isTrue()
    }

    @Test
    fun `un tick sain efface aussitôt et repart de zéro`() {
        val cleared = fold(VideoQualityLevel.POOR, VideoQualityLevel.POOR, VideoQualityLevel.GOOD)
        assertThat(cleared.isDegraded).isFalse()
        assertThat(cleared.record(VideoQualityLevel.POOR).isDegraded).isFalse()
    }

    @Test
    fun `fair n'alerte jamais et rompt la série`() {
        assertThat(fold(VideoQualityLevel.FAIR, VideoQualityLevel.FAIR, VideoQualityLevel.FAIR).isDegraded).isFalse()
        assertThat(fold(VideoQualityLevel.POOR, VideoQualityLevel.FAIR, VideoQualityLevel.POOR).isDegraded).isFalse()
    }
}
