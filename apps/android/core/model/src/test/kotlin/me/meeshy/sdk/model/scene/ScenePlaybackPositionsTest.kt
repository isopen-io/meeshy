package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ScenePlaybackPositionsTest {

    private class Clock(var now: Long = 0L)

    private fun positions(clock: Clock) = ScenePlaybackPositions { clock.now }

    @Test
    fun `la cle compose le porteur et le rang`() {
        assertThat(ScenePlaybackPositions.key("post1", 2)).isEqualTo("post1#2")
        assertThat(ScenePlaybackPositions.key(null, 0)).isNull()
        assertThat(ScenePlaybackPositions.key("", 0)).isNull()
    }

    @Test
    fun `une position publiee est relue a l ouverture`() {
        val p = positions(Clock())
        p.publish(4.5, "k")
        assertThat(p.position("k")).isEqualTo(4.5)
    }

    @Test
    fun `une position perimee n est plus une reprise`() {
        val clock = Clock()
        val p = positions(clock)
        p.publish(4.5, "k")
        clock.now = ScenePlaybackPositions.FRESHNESS_MS
        assertThat(p.position("k")).isEqualTo(4.5)
        clock.now = ScenePlaybackPositions.FRESHNESS_MS + 1
        assertThat(p.position("k")).isNull()
    }

    @Test
    fun `une position nulle ou invalide ouvre a zero`() {
        val p = positions(Clock())
        p.publish(0.0, "zero")
        p.publish(-1.0, "neg")
        p.publish(Double.NaN, "nan")
        assertThat(p.position("zero")).isNull()
        assertThat(p.position("neg")).isNull()
        assertThat(p.position("nan")).isNull()
        assertThat(p.position(null)).isNull()
    }

    @Test
    fun `la capacite evince l entree la plus ancienne`() {
        val p = positions(Clock())
        repeat(ScenePlaybackPositions.CAPACITY + 1) { p.publish(1.0 + it, "k$it") }
        assertThat(p.position("k0")).isNull()
        assertThat(p.position("k1")).isEqualTo(2.0)
        assertThat(p.position("k${ScenePlaybackPositions.CAPACITY}")).isEqualTo(ScenePlaybackPositions.CAPACITY + 1.0)
    }

    @Test
    fun `republier une cle existante ne consomme pas de place`() {
        val p = positions(Clock())
        repeat(ScenePlaybackPositions.CAPACITY) { p.publish(1.0, "k$it") }
        p.publish(9.0, "k0")
        assertThat(p.position("k0")).isEqualTo(9.0)
        assertThat(p.position("k1")).isEqualTo(1.0)
    }

    @Test
    fun `reset vide la memoire`() {
        val p = positions(Clock())
        p.publish(3.0, "k")
        p.reset()
        assertThat(p.position("k")).isNull()
    }
}
