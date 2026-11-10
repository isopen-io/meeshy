package me.meeshy.sdk.model.relation

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Ce que la barre dit AVANT la fin (#17339) : en direct, un spectre lumineux ; hors ligne, une bande qui enregistre. */
class TalkieHeaderBarLookTest {

    @Test
    fun `en direct, un spectre miroir sous un point blanc qui pulse, avec lueur et liseré plein`() {
        val look = TalkieHeaderBarLook.resolve(TalkieHeaderDelivery.LIVE)
        assertThat(look.motif).isEqualTo(TalkieHeaderBarMotif.SPECTRUM)
        assertThat(look.dot).isEqualTo(TalkieHeaderBadgeDot.PULSE)
        assertThat(look.dashedBorder).isFalse()
        assertThat(look.dimAlpha).isEqualTo(0f)
        assertThat(look.glowAlpha > TalkieHeaderBarLook.resolve(TalkieHeaderDelivery.RELAYED).glowAlpha).isTrue()
    }

    @Test
    fun `hors ligne et enregistré, une bande assombrie au liseré pointillé sous un point rouge qui clignote`() {
        listOf(TalkieHeaderDelivery.RELAYED, TalkieHeaderDelivery.RECORDED).forEach { delivery ->
            val look = TalkieHeaderBarLook.resolve(delivery)
            assertThat(look.motif).isEqualTo(TalkieHeaderBarMotif.TAPE)
            assertThat(look.dot).isEqualTo(TalkieHeaderBadgeDot.BLINK)
            assertThat(look.dashedBorder).isTrue()
            assertThat(look.dimAlpha > 0f).isTrue()
        }
    }

    @Test
    fun `le point pulse sur 1,2 s et reste fixe à mi-course avec les animations réduites`() {
        assertThat(TalkieHeaderBarLook.pulse(0.0, reduceMotion = false)).isWithin(0.001f).of(0.5f)
        assertThat(TalkieHeaderBarLook.pulse(0.3, reduceMotion = false)).isWithin(0.001f).of(1f)
        assertThat(TalkieHeaderBarLook.pulse(0.3, reduceMotion = true)).isWithin(0.001f).of(0.5f)
    }

    @Test
    fun `le point rouge clignote à la seconde et reste plein avec les animations réduites`() {
        assertThat(TalkieHeaderBarLook.blink(0.25, reduceMotion = false)).isWithin(0.001f).of(1f)
        assertThat(TalkieHeaderBarLook.blink(0.75, reduceMotion = false)).isWithin(0.001f).of(0.35f)
        assertThat(TalkieHeaderBarLook.blink(0.75, reduceMotion = true)).isWithin(0.001f).of(1f)
    }

    @Test
    fun `seule la voix qui part s'annonce, celle qui arrive a déjà son indicateur`() {
        assertThat(TalkieHeaderBarLook.announces(TalkieHeaderVoice.OUTGOING)).isTrue()
        assertThat(TalkieHeaderBarLook.announces(TalkieHeaderVoice.INCOMING)).isFalse()
        assertThat(TalkieHeaderBarLook.announces(TalkieHeaderVoice.NONE)).isFalse()
    }

    @Test
    fun `une barre de spectre est plus opaque quand elle est plus haute`() {
        assertThat(TalkieHeaderBarLook.barAlpha(height = 4f, minHeight = 4f, maxHeight = 24f)).isWithin(0.001f).of(0.6f)
        assertThat(TalkieHeaderBarLook.barAlpha(height = 24f, minHeight = 4f, maxHeight = 24f)).isWithin(0.001f).of(1f)
        assertThat(TalkieHeaderBarLook.barAlpha(height = 4f, minHeight = 4f, maxHeight = 4f)).isWithin(0.001f).of(0.6f)
    }
}
