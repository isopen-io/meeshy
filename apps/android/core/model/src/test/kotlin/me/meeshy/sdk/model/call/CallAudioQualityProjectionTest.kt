package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallAudioQualityProjectionTest {

    @Test
    fun `the five video tiers project onto the four gateway tiers`() {
        assertThat(VideoQualityLevel.EXCELLENT.gatewayTier()).isEqualTo(ConnectionQuality.EXCELLENT)
        assertThat(VideoQualityLevel.GOOD.gatewayTier()).isEqualTo(ConnectionQuality.GOOD)
        assertThat(VideoQualityLevel.FAIR.gatewayTier()).isEqualTo(ConnectionQuality.FAIR)
        assertThat(VideoQualityLevel.POOR.gatewayTier()).isEqualTo(ConnectionQuality.POOR)
    }

    @Test
    fun `critical is sent to the gateway as poor`() {
        assertThat(VideoQualityLevel.CRITICAL.gatewayTier().wireValue).isEqualTo("poor")
    }

    @Test
    fun `no tier ever yields a wire value the gateway does not know`() {
        val known = setOf("excellent", "good", "fair", "poor")
        VideoQualityLevel.values().forEach { assertThat(known).contains(it.gatewayTier().wireValue) }
    }
}
