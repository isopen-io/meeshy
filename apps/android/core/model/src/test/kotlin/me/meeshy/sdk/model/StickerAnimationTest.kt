package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StickerAnimationTest {

    @Test
    fun `un coup unique donne la pose finale apres sa duree`() {
        listOf(StickerAnimation.POP, StickerAnimation.TADA).forEach {
            assertThat(it.pose(it.period)).isEqualTo(StickerAnimation.Pose.IDENTITY)
            assertThat(it.pose(it.period * 10)).isEqualTo(StickerAnimation.Pose.IDENTITY)
            assertThat(it.pose(it.period / 2)).isNotEqualTo(StickerAnimation.Pose.IDENTITY)
        }
    }

    @Test
    fun `une animation continue boucle`() {
        StickerAnimation.entries.filterNot { it.isOneShot }.forEach {
            val t = it.period * 0.3
            assertThat(it.pose(t + it.period).scale).isWithin(1e-9).of(it.pose(t).scale)
            assertThat(it.pose(t + 3 * it.period).offsetY).isWithin(1e-9).of(it.pose(t).offsetY)
        }
    }

    @Test
    fun `deux appels au meme instant rendent la meme pose`() {
        StickerAnimation.entries.forEach { assertThat(it.pose(0.37)).isEqualTo(it.pose(0.37)) }
    }

    @Test
    fun `hors ecran la lecture est immobile`() {
        assertThat(StickerAnimation.PULSE.poseSince(null, 5_000)).isEqualTo(StickerAnimation.Pose.IDENTITY)
    }

    @Test
    fun `la pose se compte depuis l apparition`() {
        val a = StickerAnimation.WOBBLE
        assertThat(a.poseSince(10_000, 10_400)).isEqualTo(a.pose(0.4))
        assertThat(a.poseSince(10_000, 9_000)).isEqualTo(StickerAnimation.Pose.IDENTITY)
    }

    @Test
    fun `seul un coup unique se pose et laisse l horloge s arreter`() {
        assertThat(StickerAnimation.POP.isSettled(0.59)).isFalse()
        assertThat(StickerAnimation.POP.isSettled(0.6)).isTrue()
        assertThat(StickerAnimation.SPIN.isSettled(1_000.0)).isFalse()
    }
}
