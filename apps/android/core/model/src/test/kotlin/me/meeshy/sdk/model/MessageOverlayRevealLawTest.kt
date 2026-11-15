package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MessageOverlayRevealLawTest {
    @Test fun `un menu qui tient deja n a rien a reduire`() {
        assertThat(MessageOverlayRevealLaw.floor(hiddenHeight = 0f, shrinkableHeight = 300f)).isEqualTo(1f)
        assertThat(MessageOverlayRevealLaw.floor(hiddenHeight = 50f, shrinkableHeight = 0f)).isEqualTo(1f)
    }

    @Test fun `le plancher degage juste le menu cache`() {
        assertThat(MessageOverlayRevealLaw.floor(hiddenHeight = 90f, shrinkableHeight = 300f)).isWithin(1e-4f).of(0.7f)
    }

    @Test fun `le plancher ne descend jamais sous quarante pour cent`() {
        assertThat(MessageOverlayRevealLaw.floor(hiddenHeight = 500f, shrinkableHeight = 300f)).isEqualTo(0.4f)
    }

    @Test fun `le doigt reduit d abord puis le reste va au geste existant`() {
        val split = MessageOverlayRevealLaw.split(translation = -150f, committed = 1f, floor = 0.7f, shrinkableHeight = 300f)
        assertThat(split.factor).isWithin(1e-4f).of(0.7f)
        assertThat(split.residual).isWithin(1e-3f).of(-60f)
    }

    @Test fun `la reduction se suit image par image et se defait en redescendant`() {
        val down = MessageOverlayRevealLaw.split(translation = -60f, committed = 1f, floor = 0.4f, shrinkableHeight = 300f)
        assertThat(down.factor).isWithin(1e-4f).of(0.8f)
        assertThat(down.residual).isWithin(1e-3f).of(0f)
        val back = MessageOverlayRevealLaw.split(translation = 30f, committed = 0.8f, floor = 0.4f, shrinkableHeight = 300f)
        assertThat(back.factor).isWithin(1e-4f).of(0.9f)
    }

    @Test fun `le facteur ne depasse jamais le repos`() {
        val split = MessageOverlayRevealLaw.split(translation = 100f, committed = 1f, floor = 0.5f, shrinkableHeight = 300f)
        assertThat(split.factor).isEqualTo(1f)
        assertThat(split.residual).isWithin(1e-3f).of(100f)
    }

    @Test fun `sans hauteur reductible tout le parcours va au geste`() {
        val split = MessageOverlayRevealLaw.split(translation = -40f, committed = 1f, floor = 0.5f, shrinkableHeight = 0f)
        assertThat(split).isEqualTo(MessageOverlayRevealLaw.Split(1f, -40f))
    }

    @Test fun `le menu remonte de ce que l apercu a cede`() {
        assertThat(MessageOverlayRevealLaw.rise(factor = 0.7f, shrinkableHeight = 300f)).isWithin(1e-3f).of(90f)
    }

    @Test fun `un lecteur d ecran ouvre l overlay deja reduit`() {
        assertThat(MessageOverlayRevealLaw.restingFactor(floor = 0.6f, assistiveReveal = true)).isEqualTo(0.6f)
        assertThat(MessageOverlayRevealLaw.restingFactor(floor = 0.6f, assistiveReveal = false)).isEqualTo(1f)
    }
}
