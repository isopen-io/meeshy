package me.meeshy.ui.component.kit

import com.google.common.truth.Truth.assertThat
import java.util.Locale
import org.junit.Test

/** K53 — la loi du pas, l'appui long, les mesures des trois formes et les mots dits. */
class MeeshyStepperTest {

    private fun resolve(
        kind: MeeshyStepperKind = MeeshyStepperKind.Buttons,
        size: MeeshyStepperSize = MeeshyStepperSize.Regular,
        value: Int = 5,
        range: IntRange = 1..10,
        stopCount: Int = 0,
        isPressed: Boolean = false,
        isEnabled: Boolean = true,
        isRtl: Boolean = false,
        reduceMotion: Boolean = false,
    ) = MeeshyStepperRecipe.resolve(kind, size, value, range, stopCount, isPressed, isEnabled, isRtl, reduceMotion)

    @Test
    fun `un pas avance d'un cran entre deux bornes`() {
        assertThat(MeeshyStepperRule.next(5, 1, 1..10, 1)).isEqualTo(MeeshyStepperStep(6, hitBound = false))
        assertThat(MeeshyStepperRule.next(3, 1, 1..10, 5)).isEqualTo(MeeshyStepperStep(8, hitBound = false))
    }

    @Test
    fun `a la butee la valeur reste et la butee est dite`() {
        assertThat(MeeshyStepperRule.next(10, 1, 1..10, 1)).isEqualTo(MeeshyStepperStep(10, hitBound = true))
        assertThat(MeeshyStepperRule.next(1, -1, 1..10, 1)).isEqualTo(MeeshyStepperStep(1, hitBound = true))
        assertThat(MeeshyStepperRule.next(8, 1, 1..10, 5)).isEqualTo(MeeshyStepperStep(10, hitBound = true))
        assertThat(MeeshyStepperRule.next(500, 1, 1..100, 1)).isEqualTo(MeeshyStepperStep(100, hitBound = true))
    }

    @Test
    fun `un delta nul ne bouge rien et ne heurte rien`() {
        assertThat(MeeshyStepperRule.next(50, 0, 1..100, 1)).isEqualTo(MeeshyStepperStep(50, hitBound = false))
    }

    @Test
    fun `l'echelle de pas grandit avec la valeur - le dernier palier atteint gagne`() {
        val ladder = listOf(MeeshyStepperRung(from = 10, step = 5), MeeshyStepperRung(from = 50, step = 10))
        assertThat(MeeshyStepperRule.step(1, 1, emptyList())).isEqualTo(1)
        assertThat(MeeshyStepperRule.step(1, 1, ladder)).isEqualTo(1)
        assertThat(MeeshyStepperRule.step(10, 1, ladder)).isEqualTo(5)
        assertThat(MeeshyStepperRule.step(49, 1, ladder)).isEqualTo(5)
        assertThat(MeeshyStepperRule.step(50, 1, ladder)).isEqualTo(10)
        assertThat(MeeshyStepperRule.step(50, 0, emptyList())).isEqualTo(1)
    }

    @Test
    fun `un toucher avance d'un pas au relacher`() {
        val held = MeeshyStepperHoldLaw().press(isActive = true)
        assertThat(held.fires).isTrue()
        val released = held.law.release(isActive = true)
        assertThat(released.fires).isTrue()
        assertThat(released.law.isHeld).isFalse()
    }

    @Test
    fun `tenu la cadence avance seule et le relacher n'ajoute rien`() {
        val pressed = MeeshyStepperHoldLaw().press(isActive = true).law
        val ticked = pressed.repeatTick(isActive = true)
        assertThat(ticked.fires).isTrue()
        assertThat(ticked.law.release(isActive = true).fires).isFalse()
    }

    @Test
    fun `un bouton eteint ou arrive en butee arrete la cadence`() {
        val pressed = MeeshyStepperHoldLaw().press(isActive = true).law
        val stopped = pressed.repeatTick(isActive = false)
        assertThat(stopped.fires).isFalse()
        assertThat(stopped.law.isHeld).isFalse()
        assertThat(MeeshyStepperHoldLaw().press(isActive = false).fires).isFalse()
        assertThat(pressed.release(isActive = false).fires).isFalse()
    }

    @Test
    fun `un geste annule n'avance rien`() {
        val pressed = MeeshyStepperHoldLaw().press(isActive = true).law
        assertThat(pressed.cancel().isHeld).isFalse()
        assertThat(MeeshyStepperHoldLaw().release(isActive = true).fires).isFalse()
    }

    @Test
    fun `la cadence d'un appui long - 400 ms au premier puis elle accelere jusqu'a 60`() {
        assertThat(MeeshyStepperRecipe.holdDelayMillis(0)).isEqualTo(400)
        assertThat(MeeshyStepperRecipe.holdDelayMillis(1)).isEqualTo(200)
        assertThat(MeeshyStepperRecipe.holdDelayMillis(3)).isEqualTo(160)
        assertThat(MeeshyStepperRecipe.holdDelayMillis(50)).isEqualTo(60)
    }

    @Test
    fun `les mesures de la capsule - 50 de haut marge 3 ecart 4 disque 44 ou 36 cible 44`() {
        val v = resolve()
        assertThat(v.capsuleHeightDp).isEqualTo(50f)
        assertThat(v.capsuleInsetDp).isEqualTo(3f)
        assertThat(v.capsuleGapDp).isEqualTo(4f)
        assertThat(v.discDiameterDp).isEqualTo(44f)
        assertThat(resolve(size = MeeshyStepperSize.Compact).discDiameterDp).isEqualTo(36f)
        assertThat(resolve(size = MeeshyStepperSize.Compact).tapTargetDp).isEqualTo(44f)
        assertThat(v.valueSizeSp).isEqualTo(20f)
        assertThat(v.valueMinWidthDp).isEqualTo(34f)
    }

    @Test
    fun `chaque bouton s'attenue a sa butee a 36 pour cent`() {
        assertThat(resolve(value = 1).minusOpacity).isEqualTo(0.36f)
        assertThat(resolve(value = 1).plusOpacity).isEqualTo(1f)
        assertThat(resolve(value = 10).plusOpacity).isEqualTo(0.36f)
        assertThat(resolve(value = 10).minusOpacity).isEqualTo(1f)
        assertThat(resolve(isEnabled = false).minusOpacity).isEqualTo(0.36f)
    }

    @Test
    fun `la piste et les jalons ont 2 a 5 arrets sinon rien n'est rendu`() {
        assertThat(resolve(kind = MeeshyStepperKind.Track, stopCount = 1).isRendered).isFalse()
        assertThat(resolve(kind = MeeshyStepperKind.Track, stopCount = 6).isRendered).isFalse()
        assertThat(resolve(kind = MeeshyStepperKind.Milestones, stopCount = 0).isRendered).isFalse()
        assertThat((2..5).all { resolve(kind = MeeshyStepperKind.Track, stopCount = it).isRendered }).isTrue()
        assertThat(resolve(kind = MeeshyStepperKind.Buttons, stopCount = 0).isRendered).isTrue()
    }

    @Test
    fun `le remplissage de la piste va du premier arret au cran choisi`() {
        assertThat(resolve(kind = MeeshyStepperKind.Track, value = 1, stopCount = 3).fillFraction).isEqualTo(0.5f)
        assertThat(resolve(kind = MeeshyStepperKind.Track, value = 99, stopCount = 3).selectedIndex).isEqualTo(2)
        assertThat(resolve(kind = MeeshyStepperKind.Track, value = -4, stopCount = 3).selectedIndex).isEqualTo(0)
        assertThat(resolve(kind = MeeshyStepperKind.Track, value = 2, stopCount = 3).fillFraction).isEqualTo(1f)
    }

    @Test
    fun `les jalons ne recoivent aucun geste et le desactive non plus`() {
        assertThat(resolve(kind = MeeshyStepperKind.Milestones, stopCount = 3).acceptsGesture).isFalse()
        assertThat(resolve(kind = MeeshyStepperKind.Track, stopCount = 3).acceptsGesture).isTrue()
        assertThat(resolve(kind = MeeshyStepperKind.Track, stopCount = 3, isEnabled = false).acceptsGesture).isFalse()
    }

    @Test
    fun `de droite a gauche le remplissage part de la droite`() {
        assertThat(resolve(kind = MeeshyStepperKind.Track, stopCount = 3, isRtl = true).fillsFromTrailingEdge).isTrue()
        assertThat(resolve(kind = MeeshyStepperKind.Track, stopCount = 3).fillsFromTrailingEdge).isFalse()
    }

    @Test
    fun `presse le disque descend a 0,94 sauf en mouvement reduit`() {
        assertThat(resolve(isPressed = true).pressedScale).isEqualTo(0.94f)
        assertThat(resolve(isPressed = true, reduceMotion = true).pressedScale).isEqualTo(1f)
    }

    @Test
    fun `un repere est donne par l'hote borne de 10 a 56`() {
        assertThat(MeeshyStepperRecipe.markDiameter(null)).isEqualTo(10f)
        assertThat(MeeshyStepperRecipe.markDiameter(2f)).isEqualTo(10f)
        assertThat(MeeshyStepperRecipe.markDiameter(30f)).isEqualTo(30f)
        assertThat(MeeshyStepperRecipe.markDiameter(500f)).isEqualTo(56f)
        assertThat(MeeshyStepperRecipe.markDiameter(Float.NaN)).isEqualTo(10f)
    }

    @Test
    fun `l'etat d'un jalon se lit contre l'etape courante`() {
        assertThat(MeeshyStepperMilestoneState.of(index = 0, current = 2)).isEqualTo(MeeshyStepperMilestoneState.Done)
        assertThat(MeeshyStepperMilestoneState.of(index = 2, current = 2)).isEqualTo(MeeshyStepperMilestoneState.Current)
        assertThat(MeeshyStepperMilestoneState.of(index = 3, current = 2)).isEqualTo(MeeshyStepperMilestoneState.Todo)
    }

    @Test
    fun `la voix dit la valeur - le texte de l'hote puis le titre de l'arret puis le nombre`() {
        assertThat(MeeshyStepperRecipe.spokenValue("50 entrées", 50, "Quartier", Locale.FRANCE)).isEqualTo("50 entrées")
        assertThat(MeeshyStepperRecipe.spokenValue(null, 1, "Quartier", Locale.FRANCE)).isEqualTo("Quartier")
        assertThat(MeeshyStepperRecipe.spokenValue("", 50, null, Locale.US)).isEqualTo("50")
    }
}
