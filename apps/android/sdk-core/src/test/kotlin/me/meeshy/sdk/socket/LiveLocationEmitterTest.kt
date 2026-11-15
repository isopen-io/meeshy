package me.meeshy.sdk.socket

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.LiveLocationDuration
import me.meeshy.sdk.model.LiveLocationFix
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class LiveLocationEmitterTest {
    private val fix = LiveLocationFix(latitude = 1.0, longitude = 2.0, speed = 3.0)

    @Test
    fun `start update stop are emitted in order when connected`() {
        val fake = FakeCallSocket()
        val emitter = LiveLocationEmitter(fake.socket)
        assertThat(emitter.start("c1", fix, LiveLocationDuration.THIRTY_MINUTES)).isTrue()
        assertThat(emitter.update("c1", fix)).isTrue()
        assertThat(emitter.stop("c1")).isTrue()
        assertThat(fake.emitted.map { it.first })
            .containsExactly("location:live-start", "location:live-update", "location:live-stop").inOrder()
        assertThat(fake.emitted[0].second.getInt("durationMinutes")).isEqualTo(30)
        assertThat(fake.emitted[1].second.getDouble("speed")).isEqualTo(3.0)
        assertThat(fake.emitted[2].second.getString("conversationId")).isEqualTo("c1")
    }

    @Test
    fun `nothing is emitted offline`() {
        val fake = FakeCallSocket(connected = false)
        val emitter = LiveLocationEmitter(fake.socket)
        assertThat(emitter.start("c1", fix, LiveLocationDuration.DEFAULT)).isFalse()
        assertThat(emitter.update("c1", fix)).isFalse()
        assertThat(emitter.stop("c1")).isFalse()
        assertThat(fake.emitted).isEmpty()
    }
}
