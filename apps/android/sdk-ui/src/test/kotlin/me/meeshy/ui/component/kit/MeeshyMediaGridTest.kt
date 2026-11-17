package me.meeshy.ui.component.kit

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** K49 — la grille de médias : elle montre, elle ne range rien pour toi. */
class MeeshyMediaGridTest {

    @Test
    fun `deux ou trois colonnes, trois par defaut`() {
        assertThat(MeeshyMediaGridRecipe.columns(null)).isEqualTo(3)
        assertThat(MeeshyMediaGridRecipe.columns(1)).isEqualTo(2)
        assertThat(MeeshyMediaGridRecipe.columns(7)).isEqualTo(3)
    }

    @Test
    fun `l ecart suit la densite et le rayon est de 18`() {
        val tight = MeeshyMediaGridRecipe.resolve(spacing = MeeshyMediaGridSpacing.Tight)
        assertThat(tight.gapDp).isEqualTo(6f)
        assertThat(tight.radiusDp).isEqualTo(18f)
        assertThat(MeeshyMediaGridRecipe.resolve().gapDp).isEqualTo(8f)
    }

    @Test
    fun `le rapport suit la forme et la mise en page`() {
        assertThat(MeeshyMediaGridRecipe.resolve(shape = MeeshyMediaTileShape.Square).aspect).isEqualTo(1f)
        assertThat(MeeshyMediaGridRecipe.resolve(shape = MeeshyMediaTileShape.Tall).aspect).isWithin(1e-6f).of(0.75f)
        assertThat(MeeshyMediaGridRecipe.resolve(shape = MeeshyMediaTileShape.Free).aspect).isNull()
        assertThat(MeeshyMediaGridRecipe.resolve(layout = MeeshyMediaGridLayout.Masonry).aspect).isNull()
        assertThat(MeeshyMediaGridRecipe.resolve(layout = MeeshyMediaGridLayout.Row, shape = MeeshyMediaTileShape.Tall).aspect).isEqualTo(1f)
    }

    @Test
    fun `seules les tuiles media et texte se touchent`() {
        assertThat(MeeshyMediaGridRecipe.resolve(kind = MeeshyMediaTileKind.Media).isInteractive).isTrue()
        assertThat(MeeshyMediaGridRecipe.resolve(kind = MeeshyMediaTileKind.Text).isInteractive).isTrue()
        assertThat(MeeshyMediaGridRecipe.resolve(kind = MeeshyMediaTileKind.Ghost).isInteractive).isFalse()
        val skeleton = MeeshyMediaGridRecipe.resolve(kind = MeeshyMediaTileKind.Skeleton, isPressed = true)
        assertThat(skeleton.scale).isEqualTo(1f)
        assertThat(skeleton.veil).isEqualTo(0f)
    }

    @Test
    fun `pressee 0,96 et voile de 12, survolee 1,025 et ombre de 8, calme en mouvement reduit`() {
        val pressed = MeeshyMediaGridRecipe.resolve(isPressed = true)
        assertThat(pressed.scale).isEqualTo(0.96f)
        assertThat(pressed.veil).isEqualTo(0.12f)
        val hovered = MeeshyMediaGridRecipe.resolve(isHovered = true)
        assertThat(hovered.scale).isEqualTo(1.025f)
        assertThat(hovered.elevationDp).isEqualTo(8f)
        assertThat(hovered.showsHoverActions).isTrue()
        assertThat(MeeshyMediaGridRecipe.resolve(isPressed = true, reduceMotion = true).scale).isEqualTo(1f)
        assertThat(MeeshyMediaGridRecipe.resolve(isFocused = true).showsHoverActions).isTrue()
    }

    @Test
    fun `la maconnerie pose chaque tuile dans la colonne la plus courte, la premiere a egalite`() {
        val p = MeeshyMediaGridRecipe.placement(aspects = listOf(1f, 0.5f, 1f, 1f), columns = 2, spacingDp = 0f, widthDp = 200f)
        assertThat(p.columns).containsExactly(listOf(0, 2, 3), listOf(1)).inOrder()
        assertThat(p.heights).containsExactly(300f, 200f).inOrder()
    }

    @Test
    fun `un rapport illisible vaut 1 et l ecart s ajoute entre tuiles seulement`() {
        val p = MeeshyMediaGridRecipe.placement(aspects = listOf(null, 0f, Float.NaN), columns = 1, spacingDp = 10f, widthDp = 100f)
        assertThat(p.columns).containsExactly(listOf(0, 1, 2))
        assertThat(p.heights).containsExactly(320f)
    }
}
