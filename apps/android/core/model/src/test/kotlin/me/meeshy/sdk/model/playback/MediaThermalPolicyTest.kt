package me.meeshy.sdk.model.playback

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.media.DeviceThermalState
import org.junit.Test

class MediaThermalPolicyTest {
    private val cool = listOf(DeviceThermalState.NOMINAL, DeviceThermalState.FAIR)
    private val hot = listOf(DeviceThermalState.SERIOUS, DeviceThermalState.CRITICAL)

    @Test
    fun `la cadence des ticks ralentit sous la contrainte thermique`() {
        cool.forEach { assertThat(MediaThermalPolicy.tickIntervalMs(it)).isEqualTo(200L) }
        hot.forEach { assertThat(MediaThermalPolicy.tickIntervalMs(it)).isEqualTo(500L) }
    }

    @Test
    fun `le decodage anticipe vaut une seconde et se reduit a chaud`() {
        cool.forEach { assertThat(MediaThermalPolicy.forwardBufferMs(it)).isEqualTo(1_000L) }
        hot.forEach { assertThat(MediaThermalPolicy.forwardBufferMs(it)).isEqualTo(500L) }
        assertThat(MediaThermalPolicy.watchedForwardBufferMs(DeviceThermalState.NOMINAL)).isEqualTo(2_000L)
        assertThat(MediaThermalPolicy.watchedForwardBufferMs(DeviceThermalState.SERIOUS)).isEqualTo(1_000L)
    }

    @Test
    fun `le debit est toujours borne et le prechauffage est plus sobre que le regarde`() {
        DeviceThermalState.entries.forEach { thermal ->
            val watched = MediaThermalPolicy.peakBitrateBps(thermal, isPrerolling = false)
            val preroll = MediaThermalPolicy.peakBitrateBps(thermal, isPrerolling = true)
            assertThat(watched).isAtMost(1_500_000)
            assertThat(watched).isGreaterThan(0)
            assertThat(preroll).isLessThan(watched)
        }
        assertThat(MediaThermalPolicy.peakBitrateBps(DeviceThermalState.NOMINAL, false)).isEqualTo(1_500_000)
    }

    @Test
    fun `le prechauffage du reel suivant ne se suspend qu'a chaud critique`() {
        assertThat(MediaThermalPolicy.shouldPrefetchVideo(DeviceThermalState.SERIOUS)).isTrue()
        assertThat(MediaThermalPolicy.shouldPrefetchVideo(DeviceThermalState.CRITICAL)).isFalse()
    }
}
