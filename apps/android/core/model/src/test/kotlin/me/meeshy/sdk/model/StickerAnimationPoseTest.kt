package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StickerAnimationPoseTest {

    private val continuous = StickerAnimation.entries.filterNot { it.isOneShot }

    @Test
    fun `les neuf mouvements continus et deux coups uniques existent`() {
        assertThat(continuous.map { it.wireName }).containsExactly(
            "pulse", "heartbeat", "wobble", "bounce", "float", "spin", "blink", "shake", "swing",
        )
        assertThat(StickerAnimation.entries.filter { it.isOneShot }.map { it.wireName }).containsExactly("pop", "tada")
    }

    @Test
    fun `a t egal zero toute animation est l identite`() {
        StickerAnimation.entries.forEach { assertThat(it.pose(0.0)).isEqualTo(StickerAnimation.Pose.IDENTITY) }
    }

    @Test
    fun `un temps negatif ou non fini est l identite`() {
        StickerAnimation.entries.forEach {
            assertThat(it.pose(-1.0).isIdentity).isTrue()
            assertThat(it.pose(Double.NaN).isIdentity).isTrue()
            assertThat(it.pose(Double.POSITIVE_INFINITY).isIdentity).isTrue()
        }
    }

    @Test
    fun `chaque mouvement continu est periodique`() {
        continuous.forEach { animation ->
            listOf(0.13, 0.37, 0.61, 0.9).forEach { phase ->
                val t = phase * animation.period
                val a = animation.pose(t)
                val b = animation.pose(t + 3 * animation.period)
                assertThat(b.scale).isWithin(1e-9).of(a.scale)
                assertThat(b.offsetX).isWithin(1e-9).of(a.offsetX)
                assertThat(b.offsetY).isWithin(1e-9).of(a.offsetY)
                assertThat(b.opacity).isWithin(1e-9).of(a.opacity)
            }
        }
    }

    @Test
    fun `un coup unique se tient immobile une fois joue`() {
        StickerAnimation.entries.filter { it.isOneShot }.forEach {
            assertThat(it.pose(it.period).isIdentity).isTrue()
            assertThat(it.pose(it.period * 10).isIdentity).isTrue()
        }
    }

    @Test
    fun `toute pose est bornee`() {
        StickerAnimation.entries.forEach { animation ->
            (1..400).forEach { i ->
                val pose = animation.pose(i * animation.period / 100.0)
                assertThat(pose.scale).isIn(com.google.common.collect.Range.closed(0.7, 1.3))
                assertThat(Math.abs(pose.offsetX)).isLessThan(0.2)
                assertThat(Math.abs(pose.offsetY)).isLessThan(0.2)
                assertThat(pose.opacity).isAtLeast(0.70)
                assertThat(pose.opacity).isAtMost(1.0)
            }
        }
    }

    @Test
    fun `le clignotement baisse l opacite et pulse gonfle`() {
        assertThat(StickerAnimation.BLINK.pose(StickerAnimation.BLINK.period / 2).opacity).isLessThan(1.0)
        assertThat(StickerAnimation.PULSE.pose(StickerAnimation.PULSE.period / 2).scale).isGreaterThan(1.0)
    }

    @Test
    fun `un nom inconnu n est pas un mouvement`() {
        assertThat(StickerAnimation.fromWire("pulse")).isEqualTo(StickerAnimation.PULSE)
        assertThat(StickerAnimation.fromWire("levitate")).isNull()
        assertThat(StickerAnimation.fromWire(null)).isNull()
    }
}
