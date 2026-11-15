package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SwipeReplyResistanceTest {

    @Test
    fun `un glisse franchement horizontal engage la ligne`() {
        assertThat(SwipeReplyResistance.shouldEngage(dx = 40f, dy = 5f)).isTrue()
    }

    @Test
    fun `un glisse sous la distance minimale appartient au defilement`() {
        assertThat(SwipeReplyResistance.shouldEngage(dx = 20f, dy = 0f)).isFalse()
    }

    @Test
    fun `un glisse trop vertical n'engage pas`() {
        assertThat(SwipeReplyResistance.shouldEngage(dx = 60f, dy = 25f)).isFalse()
    }

    @Test
    fun `la piste suit le doigt un pour un dans la zone d'action`() {
        assertThat(SwipeReplyResistance.trackedOffset(50f)).isEqualTo(50f)
        assertThat(SwipeReplyResistance.trackedOffset(72f)).isEqualTo(72f)
    }

    @Test
    fun `au dela de la zone la piste devient elastique`() {
        assertThat(SwipeReplyResistance.trackedOffset(172f)).isWithin(0.001f).of(72f + 100f * 0.15f)
    }

    @Test
    fun `seul le glisse vers la droite deplace la ligne`() {
        assertThat(SwipeReplyResistance.offset(-80f)).isEqualTo(0f)
        assertThat(SwipeReplyResistance.offset(30f)).isEqualTo(30f)
    }

    @Test
    fun `relacher au seuil repond et en deca annule`() {
        assertThat(SwipeReplyResistance.repliesOnRelease(66f)).isTrue()
        assertThat(SwipeReplyResistance.repliesOnRelease(65f)).isFalse()
    }

    @Test
    fun `l'avancement va de zero a un jusqu'au seuil`() {
        assertThat(SwipeReplyResistance.progress(0f)).isEqualTo(0f)
        assertThat(SwipeReplyResistance.progress(33f)).isWithin(0.001f).of(0.5f)
        assertThat(SwipeReplyResistance.progress(500f)).isEqualTo(1f)
    }
}
