package me.meeshy.ui.component.kit

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** K40 — la recette en valeurs du bouton libellé : quatre tailles, sept genres, trois formes, six états. */
class MeeshyButtonTest {

    private fun resolve(
        kind: MeeshyButtonKind = MeeshyButtonKind.Primary,
        size: MeeshyButtonSize = MeeshyButtonSize.S50,
        shape: MeeshyButtonShape = MeeshyButtonShape.Capsule,
        isPressed: Boolean = false,
        isFocused: Boolean = false,
        isEnabled: Boolean = true,
        isPending: Boolean = false,
        isDestructive: Boolean = false,
        hasTrailing: Boolean = false,
        hasTint: Boolean = false,
    ) = MeeshyButtonRecipe.resolve(kind, size, shape, isPressed, isFocused, isEnabled, isPending, isDestructive, hasTrailing, hasTint)

    @Test
    fun `quatre hauteurs 56 50 44 36 et une cible qui ne descend jamais sous 44`() {
        assertThat(MeeshyButtonSize.entries.map { it.heightDp }).containsExactly(56, 50, 44, 36).inOrder()
        assertThat(resolve(size = MeeshyButtonSize.S36).hitDp).isEqualTo(44)
        assertThat(resolve(size = MeeshyButtonSize.S50).hitDp).isEqualTo(50)
    }

    @Test
    fun `libelle 16 15 135 125 en 700 et marges 26 22 16 12`() {
        assertThat(MeeshyButtonSize.entries.map { resolve(size = it).titleSp }).containsExactly(16f, 15f, 13.5f, 12.5f).inOrder()
        assertThat(MeeshyButtonSize.entries.map { resolve(size = it).horizontalPaddingDp }).containsExactly(26, 22, 16, 12).inOrder()
        assertThat(resolve().titleWeight).isEqualTo(700)
    }

    @Test
    fun `glyphe de tete 22 et 16 dans les deux petites tailles`() {
        assertThat(resolve(size = MeeshyButtonSize.S56).glyphDp).isEqualTo(22)
        assertThat(resolve(size = MeeshyButtonSize.S44).glyphDp).isEqualTo(16)
        assertThat(resolve(size = MeeshyButtonSize.S36).glyphDp).isEqualTo(16)
    }

    @Test
    fun `un emplacement de fin retire 6 de la marge de fin`() {
        assertThat(resolve(hasTrailing = true).endPaddingDp).isEqualTo(resolve().endPaddingDp - 6)
    }

    @Test
    fun `presse - echelle 094  et au repos 1`() {
        assertThat(resolve(isPressed = true).scale).isEqualTo(0.94f)
        assertThat(resolve().scale).isEqualTo(1f)
    }

    @Test
    fun `desactive - contenu a 45 pour cent ni action ni tic pas d'echelle`() {
        val off = resolve(isEnabled = false, isPressed = true)
        assertThat(off.contentOpacity).isEqualTo(0.45f)
        assertThat(off.firesAction).isFalse()
        assertThat(off.playsHaptic).isFalse()
        assertThat(off.scale).isEqualTo(1f)
    }

    @Test
    fun `occupe - l'indicateur prend la place du glyphe l'action est retenue le bouton reste plein`() {
        val busy = resolve(isPending = true)
        assertThat(busy.showsIndicator).isTrue()
        assertThat(busy.firesAction).isFalse()
        assertThat(busy.contentOpacity).isEqualTo(1f)
    }

    @Test
    fun `focus - anneau de 2 decale de 3`() {
        val focused = resolve(isFocused = true)
        assertThat(focused.focusRingDp).isEqualTo(2)
        assertThat(focused.focusRingGapDp).isEqualTo(3)
        assertThat(resolve().focusRingDp).isEqualTo(0)
    }

    @Test
    fun `la forme round est un disque de 56 a glyphe de 28 carre arrondi de rayon 18 sur Android`() {
        val round = resolve(shape = MeeshyButtonShape.Round, size = MeeshyButtonSize.S36)
        assertThat(round.heightDp).isEqualTo(56)
        assertThat(round.widthDp).isEqualTo(56)
        assertThat(round.glyphDp).isEqualTo(28)
        assertThat(round.cornerRadiusDp).isEqualTo(18)
        assertThat(round.showsTitle).isFalse()
    }

    @Test
    fun `la forme hold est un disque de 96 a glyphe de 36`() {
        val hold = resolve(shape = MeeshyButtonShape.Hold)
        assertThat(hold.heightDp).isEqualTo(96)
        assertThat(hold.glyphDp).isEqualTo(36)
        assertThat(hold.cornerRadiusDp).isEqualTo(48)
    }

    @Test
    fun `round et hold n'acceptent que primary accent tinted`() {
        assertThat(MeeshyButtonRecipe.effectiveKind(MeeshyButtonKind.Danger, MeeshyButtonShape.Round)).isEqualTo(MeeshyButtonKind.Primary)
        assertThat(MeeshyButtonRecipe.effectiveKind(MeeshyButtonKind.Tinted, MeeshyButtonShape.Hold)).isEqualTo(MeeshyButtonKind.Tinted)
        assertThat(MeeshyButtonRecipe.effectiveKind(MeeshyButtonKind.Glass, MeeshyButtonShape.Capsule)).isEqualTo(MeeshyButtonKind.Glass)
    }

    @Test
    fun `les sept genres ont leur matiere`() {
        val fills = MeeshyButtonKind.entries.associateWith { resolve(kind = it).fill }
        assertThat(fills[MeeshyButtonKind.Primary]).isEqualTo(MeeshyButtonFill.Solid)
        assertThat(fills[MeeshyButtonKind.Accent]).isEqualTo(MeeshyButtonFill.Solid)
        assertThat(fills[MeeshyButtonKind.Tinted]).isEqualTo(MeeshyButtonFill.Soft)
        assertThat(fills[MeeshyButtonKind.Glass]).isEqualTo(MeeshyButtonFill.Surface)
        assertThat(fills[MeeshyButtonKind.Outline]).isEqualTo(MeeshyButtonFill.Outline)
        assertThat(fills[MeeshyButtonKind.Danger]).isEqualTo(MeeshyButtonFill.Soft)
        assertThat(fills[MeeshyButtonKind.Text]).isEqualTo(MeeshyButtonFill.None)
    }

    @Test
    fun `danger - fond rouge doux a 13 pour cent  et le texte destructif prend l'encre rouge sans fond`() {
        assertThat(resolve(kind = MeeshyButtonKind.Danger).softAlpha).isEqualTo(0.13f)
        assertThat(resolve(kind = MeeshyButtonKind.Danger).ink).isEqualTo(MeeshyButtonInk.Error)
        val text = resolve(kind = MeeshyButtonKind.Text, isDestructive = true)
        assertThat(text.ink).isEqualTo(MeeshyButtonInk.Error)
        assertThat(text.fill).isEqualTo(MeeshyButtonFill.None)
        assertThat(resolve(kind = MeeshyButtonKind.Text).ink).isEqualTo(MeeshyButtonInk.Neutral)
        assertThat(resolve(kind = MeeshyButtonKind.Text, hasTint = true).ink).isEqualTo(MeeshyButtonInk.Tint)
    }

    @Test
    fun `la paire - parts 16 et 1 ecart 8 et elle s'empile quand la police grandit`() {
        assertThat(MeeshyButtonPairRule.PRIMARY_WEIGHT).isEqualTo(1.6f)
        assertThat(MeeshyButtonPairRule.SECONDARY_WEIGHT).isEqualTo(1f)
        assertThat(MeeshyButtonPairRule.GAP_DP).isEqualTo(8)
        assertThat(MeeshyButtonPairRule.stacks(fontScale = 1f)).isFalse()
        assertThat(MeeshyButtonPairRule.stacks(fontScale = 1.5f)).isTrue()
    }

    @Test
    fun `le nom dit ajoute la raison d'un bouton eteint et dit l'attente`() {
        assertThat(MeeshyButtonRecipe.spokenName("Écrire", disabledReason = "Sofia n'accepte pas", pendingLabel = null, isPending = false, isEnabled = false))
            .isEqualTo("Écrire, Sofia n'accepte pas")
        assertThat(MeeshyButtonRecipe.spokenName("Envoyer", disabledReason = null, pendingLabel = "en cours", isPending = true))
            .isEqualTo("Envoyer, en cours")
        assertThat(MeeshyButtonRecipe.spokenName("Envoyer", disabledReason = "ignorée", pendingLabel = null, isPending = false, isEnabled = true))
            .isEqualTo("Envoyer")
    }

    @Test
    fun `hold - les ondes ne partent que tant qu'il emet un anneau plein les remplace en mouvement reduit`() {
        assertThat(MeeshyButtonHoldRule.showsWaves(MeeshyButtonHoldState.Live, reduceMotion = false)).isTrue()
        assertThat(MeeshyButtonHoldRule.showsWaves(MeeshyButtonHoldState.Held, reduceMotion = false)).isFalse()
        assertThat(MeeshyButtonHoldRule.showsWaves(MeeshyButtonHoldState.Live, reduceMotion = true)).isFalse()
        assertThat(MeeshyButtonHoldRule.showsSolidRing(MeeshyButtonHoldState.Live, reduceMotion = true)).isTrue()
        assertThat(MeeshyButtonHoldRule.solidRingDp).isEqualTo(6)
    }

    @Test
    fun `hold - le bouton rapporte un maintien jamais un micro`() {
        assertThat(MeeshyButtonHoldRule.isHeld(MeeshyButtonHoldState.Held)).isTrue()
        assertThat(MeeshyButtonHoldRule.isHeld(MeeshyButtonHoldState.Live)).isTrue()
        assertThat(MeeshyButtonHoldRule.isHeld(MeeshyButtonHoldState.Idle)).isFalse()
        assertThat(MeeshyButtonHoldRule.isHeld(MeeshyButtonHoldState.Refused)).isFalse()
    }

    @Test
    fun `hold - la loi rapporte chaque bord une seule fois, et une annulation vaut un doigt leve`() {
        val law = MeeshyButtonHoldLaw()
        assertThat(law.press()).isTrue()
        assertThat(law.press()).isNull()
        assertThat(law.isHeld).isTrue()
        assertThat(law.release()).isFalse()
        assertThat(law.release()).isNull()
        assertThat(law.cancel()).isNull()
        assertThat(law.press()).isTrue()
        assertThat(law.cancel()).isFalse()
        assertThat(law.isHeld).isFalse()
    }

    @Test
    fun `hold - l'action du lecteur d'ecran bascule selon la loi, pas selon l'etat que l'hote renvoie`() {
        val law = MeeshyButtonHoldLaw()
        assertThat(law.toggle()).isTrue()
        assertThat(law.toggle()).isFalse()
        assertThat(law.toggle()).isTrue()
    }
}
