package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class LiveLocationEmissionTest {
    private val fix = LiveLocationFix(latitude = 48.85, longitude = 2.35)

    @Test
    fun `start carries the initial position and the duration in minutes`() {
        val payload = LiveLocationEmission.start("c1", fix, LiveLocationDuration.ONE_HOUR)
        assertThat(payload).containsExactly(
            "conversationId", "c1", "latitude", 48.85, "longitude", 2.35, "durationMinutes", 60,
        )
    }

    @Test
    fun `update omits the motion fields the device did not report`() {
        assertThat(LiveLocationEmission.update("c1", fix).keys)
            .containsExactly("conversationId", "latitude", "longitude")
    }

    @Test
    fun `update carries every reported motion field`() {
        val full = fix.copy(altitude = 35.0, accuracy = 4.0, speed = 1.5, heading = 90.0)
        val payload = LiveLocationEmission.update("c1", full)
        assertThat(payload["altitude"]).isEqualTo(35.0)
        assertThat(payload["accuracy"]).isEqualTo(4.0)
        assertThat(payload["speed"]).isEqualTo(1.5)
        assertThat(payload["heading"]).isEqualTo(90.0)
    }

    @Test
    fun `stop carries only the conversation id`() {
        assertThat(LiveLocationEmission.stop("c1")).containsExactly("conversationId", "c1")
    }

    @Test
    fun `remaining time never goes negative past the deadline`() {
        val sharing = LiveLocationSharingState.Sharing("c1", expiresAtMillis = 1_000L)
        assertThat(sharing.remainingMillis(400L)).isEqualTo(600L)
        assertThat(sharing.remainingMillis(5_000L)).isEqualTo(0L)
    }
}
