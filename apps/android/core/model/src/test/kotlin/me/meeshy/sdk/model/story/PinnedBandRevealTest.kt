package me.meeshy.sdk.model.story

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PinnedBandRevealTest {

    @Test
    fun `au repos la bande n'est pas materialisee`() {
        val reveal = PinnedBandReveal.of(scrollOffsetDp = 0f)
        assertThat(reveal.fraction).isEqualTo(0f)
        assertThat(reveal.isMaterialized).isFalse()
        assertThat(reveal.heightDp).isEqualTo(0f)
        assertThat(reveal.acceptsTouches).isFalse()
    }

    @Test
    fun `jusqu'au seuil de debut de bascule rien n'est materialise`() {
        assertThat(PinnedBandReveal.of(-78f).isMaterialized).isFalse()
        assertThat(PinnedBandReveal.of(-60f).isMaterialized).isFalse()
    }

    @Test
    fun `la bande se materialise des que la bascule commence`() {
        assertThat(PinnedBandReveal.of(-78.5f).isMaterialized).isTrue()
    }

    @Test
    fun `la fraction suit la courbe de l'en-tete repliable`() {
        assertThat(PinnedBandReveal.of(-113f).fraction).isWithin(1e-6f).of(0.5f)
        assertThat(PinnedBandReveal.of(-148f).fraction).isEqualTo(1f)
        assertThat(PinnedBandReveal.of(-400f).fraction).isEqualTo(1f)
    }

    @Test
    fun `la hauteur suit la revelation jusqu'a 48 dp`() {
        assertThat(PinnedBandReveal.of(-113f).heightDp).isWithin(1e-4f).of(24f)
        assertThat(PinnedBandReveal.of(-148f).heightDp).isEqualTo(48f)
    }

    @Test
    fun `la bande ne recoit les gestes qu'au dela de 0,6`() {
        assertThat(PinnedBandReveal.of(-119f).acceptsTouches).isFalse()
        assertThat(PinnedBandReveal.of(-121f).acceptsTouches).isTrue()
    }

    @Test
    fun `au dela du premier element de la liste la bande est entierement revelee`() {
        assertThat(PinnedBandReveal.scrollOffsetDp(firstVisibleItemIndex = 1, firstVisibleItemOffsetDp = 0f)).isAtMost(-148f)
        assertThat(PinnedBandReveal.of(PinnedBandReveal.scrollOffsetDp(3, 12f)).fraction).isEqualTo(1f)
    }

    @Test
    fun `sur le premier element le decalage est celui du defilement`() {
        assertThat(PinnedBandReveal.scrollOffsetDp(0, 100f)).isEqualTo(-100f)
        assertThat(PinnedBandReveal.scrollOffsetDp(0, 0f)).isEqualTo(0f)
    }
}
