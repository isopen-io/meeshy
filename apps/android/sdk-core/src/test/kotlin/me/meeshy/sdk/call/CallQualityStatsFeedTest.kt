package me.meeshy.sdk.call

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallQualityTick
import org.junit.Test

class CallQualityStatsFeedTest {
    private fun tick(atMs: Long, audio: Long) = CallQualityTick(atMs, 40.0, 0.0, 5.0, audio, 0L, relayed = false)

    @Test
    fun `aucune lecture avant le premier tick, sans toucher à WebRTC`() {
        assertThat(CallQualityStatsFeed().readings.value).isNull()
    }

    @Test
    fun `le débit se dérive du tick précédent`() {
        val feed = CallQualityStatsFeed()
        feed.record(tick(0, 0))
        feed.record(tick(5_000, 5_000))
        assertThat(feed.readings.value?.audioKbps).isWithin(1e-9).of(8.0)
    }

    @Test
    fun `reset efface la lecture et oublie le tick précédent`() {
        val feed = CallQualityStatsFeed()
        feed.record(tick(0, 0))
        feed.reset()
        assertThat(feed.readings.value).isNull()
        feed.record(tick(5_000, 99_000))
        assertThat(feed.readings.value?.audioKbps).isEqualTo(0.0)
    }
}
