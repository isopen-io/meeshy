package me.meeshy.ui.component.kit

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** K41 — la loi du compte et la recette de la pastille : un compte à zéro ne rend rien, la teinte est un sens. */
class MeeshyBadgeTest {

    private fun resolve(
        surface: MeeshyBadgeSurface = MeeshyBadgeSurface.Tonal,
        kind: MeeshyBadgeKind = MeeshyBadgeKind.Neutral,
        size: MeeshyBadgeSize = MeeshyBadgeSize.S22,
        shape: MeeshyBadgeShape = MeeshyBadgeShape.Capsule,
        content: MeeshyBadgeContentShape = MeeshyBadgeContentShape.Word,
        isMultiLine: Boolean = false,
        isCurrent: Boolean = false,
        isStale: Boolean = false,
        isInteractive: Boolean = false,
        isPressed: Boolean = false,
        isEnabled: Boolean = true,
    ) = MeeshyBadgeRecipe.resolve(surface, kind, size, shape, content, isMultiLine, isCurrent, isStale, isInteractive, isPressed, isEnabled)

    @Test
    fun `un compte a zero ou negatif ne rend rien et ne prend aucune place`() {
        assertThat(MeeshyBadgeCount.text(0)).isNull()
        assertThat(MeeshyBadgeCount.text(-4)).isNull()
        assertThat(MeeshyBadgeCount.isVisible(0)).isFalse()
    }

    @Test
    fun `au dela du plafond la pastille ecrit 99+ et la voix dit le vrai nombre`() {
        assertThat(MeeshyBadgeCount.text(7)).isEqualTo("7")
        assertThat(MeeshyBadgeCount.text(99)).isEqualTo("99")
        assertThat(MeeshyBadgeCount.text(100)).isEqualTo("99+")
        assertThat(MeeshyBadgeCount.text(25, cap = 20)).isEqualTo("20+")
        assertThat(MeeshyBadgeCount.spoken(1234)).isEqualTo(1234)
        assertThat(MeeshyBadgeCount.spoken(-3)).isEqualTo(0)
    }

    @Test
    fun `le quota s'ecrit 2 sur 3 en chiffres, borne par son total`() {
        assertThat(MeeshyBadgeCount.quota(2, of = 3)).isEqualTo("2 / 3")
        assertThat(MeeshyBadgeCount.quota(0, of = 3)).isEqualTo("0 / 3")
        assertThat(MeeshyBadgeCount.quota(-1, of = 3)).isEqualTo("0 / 3")
    }

    @Test
    fun `quatre hauteurs 18 22 28 36 et le texte 10 11 12 12,5`() {
        assertThat(MeeshyBadgeSize.entries.map { resolve(size = it).heightDp }).containsExactly(18, 22, 28, 36).inOrder()
        assertThat(MeeshyBadgeSize.entries.map { resolve(size = it).textSp }).containsExactly(10f, 11f, 12f, 12.5f).inOrder()
    }

    @Test
    fun `une pastille inerte n'a ni cible ni role ; touchable, elle a 44 qui debordent`() {
        assertThat(resolve().hitDp).isNull()
        assertThat(resolve(isInteractive = true, size = MeeshyBadgeSize.S22).hitDp).isEqualTo(44)
        assertThat(resolve(isInteractive = true, size = MeeshyBadgeSize.S36).hitDp).isEqualTo(44)
        assertThat(resolve(isInteractive = true).isButton).isTrue()
        assertThat(resolve().isButton).isFalse()
    }

    @Test
    fun `presse - echelle 0,94 ; desactive - 40 pour cent`() {
        assertThat(resolve(isInteractive = true, isPressed = true).scale).isEqualTo(0.94f)
        assertThat(resolve(isInteractive = true, isEnabled = false).opacity).isEqualTo(0.4f)
    }

    @Test
    fun `perime - desature et a 62 pour cent`() {
        val stale = resolve(isStale = true)
        assertThat(stale.opacity).isEqualTo(0.62f)
        assertThat(stale.isDesaturated).isTrue()
    }

    @Test
    fun `sur Android le verre rend la surface tonale de rayon 12`() {
        val glass = resolve(surface = MeeshyBadgeSurface.Glass)
        assertThat(glass.surface).isEqualTo(MeeshyBadgeSurface.Tonal)
        assertThat(glass.cornerRadiusDp).isEqualTo(12)
        assertThat(resolve(surface = MeeshyBadgeSurface.Solid).cornerRadiusDp).isEqualTo(MeeshyBadgeRecipe.FULL_RADIUS_DP)
    }

    @Test
    fun `la teinte tonale est a 16 pour cent, le contour a 1,5`() {
        assertThat(resolve(surface = MeeshyBadgeSurface.Tonal).tonalAlpha).isEqualTo(0.16f)
        assertThat(resolve(surface = MeeshyBadgeSurface.Outline).outlineDp).isEqualTo(1.5f)
        assertThat(resolve(surface = MeeshyBadgeSurface.Tonal).outlineDp).isEqualTo(0f)
    }

    @Test
    fun `l'etat courant porte un bord d'accent`() {
        assertThat(resolve(isCurrent = true).hasAccentBorder).isTrue()
        assertThat(resolve().hasAccentBorder).isFalse()
    }

    @Test
    fun `une bulle a la queue au bord de debut, en bas - 16 16 16 4`() {
        val bubble = resolve(shape = MeeshyBadgeShape.Bubble)
        assertThat(bubble.bubbleCornersDp).containsExactly(16, 16, 16, 4).inOrder()
        assertThat(resolve().bubbleCornersDp).isNull()
    }

    @Test
    fun `un chiffre est un disque, un code a le rayon 7, le multi-ligne le rayon 14`() {
        assertThat(resolve(content = MeeshyBadgeContentShape.Digit).isDisc).isTrue()
        assertThat(resolve(content = MeeshyBadgeContentShape.Glyph).isDisc).isTrue()
        assertThat(resolve(content = MeeshyBadgeContentShape.Code).cornerRadiusDp).isEqualTo(7)
        val multi = resolve(isMultiLine = true)
        assertThat(multi.cornerRadiusDp).isEqualTo(14)
        assertThat(multi.fillsWidth).isTrue()
    }

    @Test
    fun `le detourage est de 3, decale d'un quart de la hauteur`() {
        assertThat(MeeshyBadgeRecipe.CUTOUT_DP).isEqualTo(3)
        assertThat(MeeshyBadgeRecipe.anchorOffsetDp(MeeshyBadgeSize.S28)).isEqualTo(7f)
        assertThat(MeeshyBadgeRecipe.anchorOffsetDp(MeeshyBadgeSize.S18)).isEqualTo(4.5f)
    }

    @Test
    fun `chiffres et heures en chasse fixe, mots et glyphes non`() {
        assertThat(resolve(content = MeeshyBadgeContentShape.Digit).usesTabularFigures).isTrue()
        assertThat(resolve(content = MeeshyBadgeContentShape.Time).usesTabularFigures).isTrue()
        assertThat(resolve(content = MeeshyBadgeContentShape.Word).usesTabularFigures).isFalse()
    }

    @Test
    fun `la tete a un point de 6 et un ecart de 5 avec le contenu`() {
        assertThat(MeeshyBadgeRecipe.DOT_DP).isEqualTo(6)
        assertThat(MeeshyBadgeRecipe.LEADING_GAP_DP).isEqualTo(5)
    }
}
