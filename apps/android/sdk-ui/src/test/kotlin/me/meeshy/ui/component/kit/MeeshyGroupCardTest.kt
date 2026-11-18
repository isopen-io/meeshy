package me.meeshy.ui.component.kit

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** K43 — la carte de groupe : sept fonds, cinq gabarits, le rouge annonce une conséquence et ne décore pas. */
class MeeshyGroupCardTest {

    private fun resolve(
        surface: MeeshyGroupCardSurface = MeeshyGroupCardSurface.Raised,
        layout: MeeshyGroupCardLayout = MeeshyGroupCardLayout.Content,
        isPressable: Boolean = false,
        isPressed: Boolean = false,
        isLocked: Boolean = false,
        isFeatured: Boolean = false,
        isBubble: Boolean = false,
    ) = MeeshyGroupCardRecipe.resolve(surface, layout, isPressable, isPressed, isLocked, isFeatured, isBubble)

    @Test
    fun `le rayon est 26 en page 30 sur un media et 24 pour la carte d action`() {
        assertThat(resolve().cornerRadius).isEqualTo(26.0)
        assertThat(resolve(surface = MeeshyGroupCardSurface.Glass).cornerRadius).isEqualTo(30.0)
        assertThat(resolve(layout = MeeshyGroupCardLayout.Action).cornerRadius).isEqualTo(24.0)
        assertThat(resolve(surface = MeeshyGroupCardSurface.Glass, layout = MeeshyGroupCardLayout.Action).cornerRadius).isEqualTo(30.0)
    }

    @Test
    fun `le coin de bulle est 8 quand la carte est une bulle`() {
        assertThat(resolve(isBubble = true).bubbleCornerRadius).isEqualTo(8.0)
        assertThat(resolve().bubbleCornerRadius).isEqualTo(26.0)
    }

    @Test
    fun `le pointille est un bord de 1,5 sans fond et l aplat n a pas de bord et porte une encre sombre`() {
        val dashed = resolve(surface = MeeshyGroupCardSurface.Dashed)
        assertThat(dashed.isBorderDashed).isTrue()
        assertThat(dashed.hasFill).isFalse()
        assertThat(dashed.borderWidth).isEqualTo(1.5)
        val solid = resolve(surface = MeeshyGroupCardSurface.Solid)
        assertThat(solid.borderWidth).isEqualTo(0.0)
        assertThat(solid.usesDarkInk).isTrue()
        assertThat(resolve().usesDarkInk).isFalse()
    }

    @Test
    fun `le lavis d accent est 22 pour cent son bord 30 et le danger 8 et 34 avec des filets rougis`() {
        assertThat(resolve(surface = MeeshyGroupCardSurface.Accent).washOpacity).isEqualTo(0.22)
        assertThat(resolve(surface = MeeshyGroupCardSurface.Accent).borderOpacity).isEqualTo(0.30)
        val danger = resolve(surface = MeeshyGroupCardSurface.Danger)
        assertThat(danger.washOpacity).isEqualTo(0.08)
        assertThat(danger.borderOpacity).isEqualTo(0.34)
        assertThat(danger.dividerOpacity).isEqualTo(0.24)
        assertThat(resolve().dividerOpacity).isEqualTo(1.0)
    }

    @Test
    fun `le verre ne vient que de K01`() {
        assertThat(resolve(surface = MeeshyGroupCardSurface.Glass).usesGlass).isTrue()
        assertThat(resolve().usesGlass).isFalse()
    }

    @Test
    fun `n enfants rendent n moins un filets et zero ou un enfant aucun`() {
        assertThat(MeeshyGroupCardRecipe.dividerCount(4)).isEqualTo(3)
        assertThat(MeeshyGroupCardRecipe.dividerCount(1)).isEqualTo(0)
        assertThat(MeeshyGroupCardRecipe.dividerCount(0)).isEqualTo(0)
    }

    @Test
    fun `l en tete n existe que s il porte un sur titre ou un accessoire`() {
        assertThat(MeeshyGroupCardRecipe.showsHeader(hasOverline = false, hasAccessory = false)).isFalse()
        assertThat(MeeshyGroupCardRecipe.showsHeader(hasOverline = true, hasAccessory = false)).isTrue()
        assertThat(MeeshyGroupCardRecipe.showsHeader(hasOverline = false, hasAccessory = true)).isTrue()
    }

    @Test
    fun `presse la carte se tasse et s eclaircit mais verrouillee elle ne reagit pas et passe a 42 pour cent`() {
        val pressed = resolve(isPressable = true, isPressed = true)
        assertThat(pressed.scale).isEqualTo(0.97)
        assertThat(pressed.lighten).isEqualTo(0.12)
        val locked = resolve(isPressable = true, isPressed = true, isLocked = true)
        assertThat(locked.scale).isEqualTo(1.0)
        assertThat(locked.contentOpacity).isEqualTo(0.42)
        assertThat(locked.isActive).isFalse()
        assertThat(resolve(isPressed = true).scale).isEqualTo(1.0)
    }

    @Test
    fun `la carte d action a une hauteur minimale de 148 et le gabarit groupe un padding de 6`() {
        assertThat(resolve(layout = MeeshyGroupCardLayout.Action).minHeight).isEqualTo(148.0)
        assertThat(resolve(layout = MeeshyGroupCardLayout.Group).verticalPadding).isEqualTo(6.0)
        assertThat(resolve().minHeight).isEqualTo(0.0)
    }

    @Test
    fun `mise en avant la carte porte un halo de 4 a 18 pour cent`() {
        assertThat(resolve(isFeatured = true).haloWidth).isEqualTo(4.0)
        assertThat(resolve(isFeatured = true).haloOpacity).isEqualTo(0.18)
        assertThat(resolve().haloWidth).isEqualTo(0.0)
    }
}
