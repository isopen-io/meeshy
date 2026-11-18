package me.meeshy.ui.component.kit

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** K32 — l'action libellée et sa grille : le disque est celui de K02, mis à l'échelle ; la grille ne laisse jamais une action seule. */
class MeeshyLabeledActionTest {

    private fun action(
        kind: MeeshyGlassButtonKind = MeeshyGlassButtonKind.Normal,
        size: MeeshyLabeledActionSize = MeeshyLabeledActionSize.S60,
        isPending: Boolean = false,
        isFeatured: Boolean = false,
        isEnabled: Boolean = true,
    ) = MeeshyLabeledActionRecipe.resolve(kind, size, isPending, isFeatured, isEnabled, hasValue = false)

    private fun grid(
        width: Double,
        count: Int,
        columns: MeeshyActionColumns = MeeshyActionColumns.Adaptive(MeeshyActionGridRecipe.PHONE_MAX_COLUMNS),
        textScale: Double = 1.0,
    ) = MeeshyActionGridRecipe.resolve(width, count, columns, textScale)

    @Test
    fun `le disque fait 56 60 ou 64 et l echelle de K02 est le diametre sur 48`() {
        assertThat(MeeshyLabeledActionSize.entries.map { action(size = it).diameter }).containsExactly(56.0, 60.0, 64.0).inOrder()
        assertThat(action(size = MeeshyLabeledActionSize.S60).faceScale).isWithin(1e-9).of(60.0 / 48.0)
    }

    @Test
    fun `le glyphe est 26 28 ou 30 et 40 pour l action mise en avant de 96`() {
        assertThat(MeeshyLabeledActionSize.entries.map { action(size = it).glyphSize }).containsExactly(26.0, 28.0, 30.0).inOrder()
        assertThat(action(isFeatured = true).diameter).isEqualTo(96.0)
        assertThat(action(isFeatured = true).glyphSize).isEqualTo(40.0)
    }

    @Test
    fun `le destructif va dans la bande a 56 quelle que soit la taille`() {
        val destructive = action(kind = MeeshyGlassButtonKind.Destructive, size = MeeshyLabeledActionSize.S64)
        assertThat(destructive.diameter).isEqualTo(56.0)
        assertThat(destructive.isInDestructiveBand).isTrue()
        assertThat(action().isInDestructiveBand).isFalse()
    }

    @Test
    fun `la cible fait au moins 76 sur 88`() {
        assertThat(action().minTargetWidth).isEqualTo(76.0)
        assertThat(action().minTargetHeight).isEqualTo(88.0)
    }

    @Test
    fun `en attente le glyphe baisse a 45 pour cent et un anneau tourne sans action possible`() {
        val pending = action(isPending = true)
        assertThat(pending.glyphOpacity).isEqualTo(0.45)
        assertThat(pending.showsRing).isTrue()
        assertThat(pending.isActionable).isFalse()
        assertThat(action().isActionable).isTrue()
    }

    @Test
    fun `inactive l action est a 40 pour cent et n agit pas`() {
        assertThat(action(isEnabled = false).opacity).isEqualTo(0.4)
        assertThat(action(isEnabled = false).isActionable).isFalse()
    }

    @Test
    fun `la grille loge autant de colonnes de 76 que la largeur le permet jusqu au plafond du telephone`() {
        assertThat(grid(390.0, 8).columns).isEqualTo(4)
        assertThat(grid(300.0, 8).columns).isEqualTo(3)
        assertThat(grid(100.0, 8).columns).isEqualTo(1)
        assertThat(grid(390.0, 8, MeeshyActionColumns.Fixed(3)).columns).isEqualTo(3)
        assertThat(grid(390.0, 8, MeeshyActionColumns.Fixed(0)).columns).isEqualTo(1)
    }

    @Test
    fun `une grande largeur n est plus plafonnee au telephone et le grand texte elargit la colonne`() {
        assertThat(grid(700.0, 8).columns).isEqualTo(8)
        assertThat(grid(390.0, 8, textScale = 1.6).columns).isEqualTo(3)
    }

    @Test
    fun `la largeur de colonne retranche les gouttieres de 8`() {
        assertThat(grid(390.0, 8).columnWidth).isWithin(1e-9).of((390.0 - 24.0) / 4.0)
    }

    @Test
    fun `jamais une action seule sur la derniere rangee quand on peut l eviter`() {
        assertThat(MeeshyActionGridRecipe.distribute(5, 4)).containsExactly(3, 2).inOrder()
        assertThat(MeeshyActionGridRecipe.distribute(9, 4)).containsExactly(3, 3, 3).inOrder()
        assertThat(MeeshyActionGridRecipe.distribute(8, 4)).containsExactly(4, 4).inOrder()
        assertThat(MeeshyActionGridRecipe.distribute(6, 4)).containsExactly(4, 2).inOrder()
        assertThat(MeeshyActionGridRecipe.distribute(1, 4)).containsExactly(1)
        assertThat(MeeshyActionGridRecipe.distribute(0, 4)).isEmpty()
    }

    @Test
    fun `le disque suit la largeur 56 sous 360 60 jusqu a 560 puis 64`() {
        assertThat(MeeshyActionGridRecipe.autoSize(359.0)).isEqualTo(MeeshyLabeledActionSize.S56)
        assertThat(MeeshyActionGridRecipe.autoSize(360.0)).isEqualTo(MeeshyLabeledActionSize.S60)
        assertThat(MeeshyActionGridRecipe.autoSize(560.0)).isEqualTo(MeeshyLabeledActionSize.S64)
        assertThat(grid(Double.NaN, 3).columns).isEqualTo(1)
    }
}
