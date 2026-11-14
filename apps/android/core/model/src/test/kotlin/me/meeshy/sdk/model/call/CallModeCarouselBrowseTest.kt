package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * #18192 — mêmes vecteurs que iOS `CallModeRulesTests` (`CallModeCarouselBrowse`) : sous TalkBack, un pas PARCOURT
 * sans rien appliquer ; seule l'activation (double toucher) applique ce qui est annoncé, ou confirme si c'est déjà posé.
 */
class CallModeCarouselBrowseTest {
    private val looks = listOf("a", "b", "c", "d")

    private fun declinations(item: String): List<String> = if (item == "b") listOf("b", "b.1", "b.2") else emptyList()

    private fun posedB1(item: String): String = if (item == "b") "b.1" else item

    @Test
    fun `at rest the applied effect is announced and activation only confirms`() {
        val browse = CallModeCarouselBrowse<String>()
        assertThat(browse.isBrowsing).isFalse()
        assertThat(browse.position("b")).isEqualTo("b")
        assertThat(browse.activation("b")).isEqualTo(CallModeCarouselActivation.Confirm)
    }

    @Test
    fun `adjusting moves the announced position without applying anything`() {
        val first = CallModeCarouselBrowse<String>().step(1, looks, "a")!!
        val browse = first.step(1, looks, "a")!!
        assertThat(browse.isBrowsing).isTrue()
        assertThat(browse.position("a")).isEqualTo("c")
        assertThat(browse.activation("a")).isEqualTo(CallModeCarouselActivation.Apply("c"))
    }

    @Test
    fun `at the edge nothing moves`() {
        val browse = CallModeCarouselBrowse<String>()
        assertThat(browse.step(-1, looks, "a")).isNull()
        assertThat(browse.step(1, looks, "d")).isNull()
        assertThat(browse.position("d")).isEqualTo("d")
    }

    @Test
    fun `back on the applied look activation only confirms`() {
        val browse = CallModeCarouselBrowse<String>().step(1, looks, "b")!!.step(-1, looks, "b")!!
        assertThat(browse.position("b")).isEqualTo("b")
        assertThat(browse.activation("b")).isEqualTo(CallModeCarouselActivation.Confirm)
    }

    @Test
    fun `leaving forgets the position`() {
        val browse = CallModeCarouselBrowse<String>().step(2, looks, "a")!!.leave()
        assertThat(browse.isBrowsing).isFalse()
        assertThat(browse.position("a")).isEqualTo("a")
    }

    @Test
    fun `the ordinal is one based and null outside the list`() {
        assertThat(CallModeCarouselRule.ordinal("c", looks)).isEqualTo(CallModeCarouselOrdinal(rank = 3, count = 4))
        assertThat(CallModeCarouselRule.ordinal("a", looks)).isEqualTo(CallModeCarouselOrdinal(rank = 1, count = 4))
        assertThat(CallModeCarouselRule.ordinal("z", looks)).isNull()
    }

    @Test
    fun `a variant starts from the posed declination and is not applied`() {
        val browse = CallModeCarouselBrowse<String>().stepVariant(1, "b", ::declinations, ::posedB1)!!
        assertThat(browse.variant).isEqualTo("b.2")
        assertThat(browse.isBrowsing).isTrue()
        assertThat(browse.activation("b", ::posedB1)).isEqualTo(CallModeCarouselActivation.Apply("b.2"))
    }

    @Test
    fun `back to the plain frame applies it when a declination is posed`() {
        val browse = CallModeCarouselBrowse<String>().stepVariant(-1, "b", ::declinations, ::posedB1)!!
        assertThat(browse.variant).isEqualTo("b")
        assertThat(browse.activation("b", ::posedB1)).isEqualTo(CallModeCarouselActivation.Apply("b"))
    }

    @Test
    fun `on the posed declination activation only confirms`() {
        val browse = CallModeCarouselBrowse<String>()
            .stepVariant(1, "b", ::declinations, ::posedB1)!!
            .stepVariant(-1, "b", ::declinations, ::posedB1)!!
        assertThat(browse.activation("b", ::posedB1)).isEqualTo(CallModeCarouselActivation.Confirm)
    }

    @Test
    fun `a variant follows the browsed frame not the applied one and never loops`() {
        val onFrame = CallModeCarouselBrowse<String>().step(1, looks, "a")!!
        val first = onFrame.stepVariant(1, "a", ::declinations) { it }!!
        assertThat(first.variant).isEqualTo("b.1")
        val last = first.stepVariant(5, "a", ::declinations) { it }!!
        assertThat(last.variant).isEqualTo("b.2")
        assertThat(last.stepVariant(1, "a", ::declinations) { it }).isNull()
    }

    @Test
    fun `without declinations a variant step does not move`() {
        val browse = CallModeCarouselBrowse<String>()
        assertThat(browse.stepVariant(1, "a", ::declinations) { it }).isNull()
        assertThat(browse.variant).isNull()
        assertThat(browse.isBrowsing).isFalse()
    }

    @Test
    fun `moving to another frame forgets the variant`() {
        val onVariant = CallModeCarouselBrowse<String>().stepVariant(1, "b", ::declinations) { it }!!
        val browse = onVariant.step(1, looks, "b")!!
        assertThat(browse.variant).isNull()
        assertThat(browse.activation("b")).isEqualTo(CallModeCarouselActivation.Apply("c"))
    }
}
