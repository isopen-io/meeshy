package me.meeshy.ui.theme

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** K26 — la table des sept jetons, relue à l'identique de la fiche : durée, ressort, retour haptique, version réduite. */
class MeeshyMotionRecipeTest {

    private fun spring(token: MeeshyMotionToken) = MeeshyMotionRecipe.resolve(token, reduce = false)

    @Test
    fun `la table n'a que sept jetons, dans l'ordre de la fiche`() {
        assertThat(MeeshyMotionToken.entries.map { it.name })
            .containsExactly("Morph", "Travel", "Flip", "Collapse", "Rise", "Float", "Pulse").inOrder()
    }

    @Test
    fun `morph est le ressort 0,42 amorti 0,7 avec un tic leger au toucher`() {
        val morph = spring(MeeshyMotionToken.Morph)
        assertThat(morph.nature).isEqualTo(MeeshyMotionNature.Spring)
        assertThat(morph.durationMillis).isEqualTo(420)
        assertThat(morph.response).isEqualTo(0.42f)
        assertThat(morph.damping).isEqualTo(0.7f)
        assertThat(morph.haptic).isEqualTo(MeeshyMotionHaptic.Light)
        assertThat(morph.hapticAt).isEqualTo(MeeshyMotionHapticAt.Start)
    }

    @Test
    fun `travel et flip portent leur ressort et leur retour`() {
        val travel = spring(MeeshyMotionToken.Travel)
        assertThat(travel.durationMillis).isEqualTo(560)
        assertThat(travel.damping).isEqualTo(0.82f)
        assertThat(travel.haptic).isEqualTo(MeeshyMotionHaptic.Medium)
        assertThat(travel.hapticAt).isEqualTo(MeeshyMotionHapticAt.Landing)
        val flip = spring(MeeshyMotionToken.Flip)
        assertThat(flip.durationMillis).isEqualTo(500)
        assertThat(flip.damping).isEqualTo(0.86f)
        assertThat(flip.haptic).isEqualTo(MeeshyMotionHaptic.Rigid)
        assertThat(flip.hapticAt).isEqualTo(MeeshyMotionHapticAt.MidCourse)
    }

    @Test
    fun `collapse est piloté par le defilement, sans duree propre`() {
        val collapse = spring(MeeshyMotionToken.Collapse)
        assertThat(collapse.nature).isEqualTo(MeeshyMotionNature.Driven)
        assertThat(collapse.durationMillis).isEqualTo(0)
        assertThat(collapse.haptic).isEqualTo(MeeshyMotionHaptic.Light)
        assertThat(collapse.hapticAt).isEqualTo(MeeshyMotionHapticAt.Lock)
    }

    @Test
    fun `rise decale chaque rang de 80 ms et ne vibre pas`() {
        val rise = spring(MeeshyMotionToken.Rise)
        assertThat(rise.durationMillis).isEqualTo(360)
        assertThat(rise.delayStepMillis).isEqualTo(80)
        assertThat(rise.haptic).isEqualTo(MeeshyMotionHaptic.None)
    }

    @Test
    fun `les deux boucles ne vibrent jamais`() {
        val float = spring(MeeshyMotionToken.Float)
        val pulse = spring(MeeshyMotionToken.Pulse)
        assertThat(float.nature).isEqualTo(MeeshyMotionNature.Loop)
        assertThat(float.durationMillis).isEqualTo(9000)
        assertThat(pulse.nature).isEqualTo(MeeshyMotionNature.Loop)
        assertThat(pulse.durationMillis).isEqualTo(2200)
        assertThat(listOf(float.haptic, pulse.haptic)).containsExactly(MeeshyMotionHaptic.None, MeeshyMotionHaptic.None)
    }

    @Test
    fun `rien ne depasse 600 ms hors boucle`() {
        val longest = MeeshyMotionToken.entries
            .map { spring(it) }
            .filter { it.nature != MeeshyMotionNature.Loop }
            .maxOf { it.durationMillis }
        assertThat(longest).isAtMost(600)
    }

    @Test
    fun `mouvement reduit - les cinq premiers jetons deviennent un fondu de 160 ms et gardent leur haptique`() {
        MeeshyMotionToken.entries.take(5).forEach { token ->
            val full = MeeshyMotionRecipe.resolve(token, reduce = false)
            val reduced = MeeshyMotionRecipe.resolve(token, reduce = true)
            assertThat(reduced.nature).isEqualTo(MeeshyMotionNature.Timed)
            assertThat(reduced.durationMillis).isEqualTo(160)
            assertThat(reduced.response).isNull()
            assertThat(reduced.delayStepMillis).isEqualTo(0)
            assertThat(reduced.haptic).isEqualTo(full.haptic)
        }
    }

    @Test
    fun `mouvement reduit - les deux boucles s'arretent`() {
        listOf(MeeshyMotionToken.Float, MeeshyMotionToken.Pulse).forEach { token ->
            assertThat(MeeshyMotionRecipe.resolve(token, reduce = true).nature).isEqualTo(MeeshyMotionNature.Still)
        }
    }

    @Test
    fun `la raideur Android se deduit de la reponse iOS`() {
        assertThat(MeeshyMotion.stiffnessForResponse(0.42f)).isWithin(0.6f).of(224f)
        assertThat(MeeshyMotion.stiffnessForResponse(0.56f)).isWithin(0.6f).of(126f)
        assertThat(MeeshyMotion.stiffnessForResponse(0.5f)).isWithin(0.6f).of(158f)
        assertThat(MeeshyMotion.stiffnessForResponse(0.36f)).isWithin(0.6f).of(305f)
    }

    @Test
    fun `le decalage d'une cascade est borne a trois rangs et un rang negatif vaut zero`() {
        assertThat(MeeshyMotion.delayMillis(-2)).isEqualTo(0)
        assertThat(MeeshyMotion.delayMillis(0)).isEqualTo(0)
        assertThat(MeeshyMotion.delayMillis(2)).isEqualTo(160)
        assertThat(MeeshyMotion.delayMillis(9)).isEqualTo(240)
    }

    @Test
    fun `l'avancement pilote est borne aux deux bouts, sur 0 a 220 par defaut`() {
        assertThat(MeeshyMotion.progress(-30f)).isEqualTo(0f)
        assertThat(MeeshyMotion.progress(110f)).isEqualTo(0.5f)
        assertThat(MeeshyMotion.progress(900f)).isEqualTo(1f)
        assertThat(MeeshyMotion.progress(50f, 100f..200f)).isEqualTo(0f)
        assertThat(MeeshyMotion.progress(150f, 100f..200f)).isEqualTo(0.5f)
    }

    @Test
    fun `un intervalle vide ne divise pas par zero`() {
        assertThat(MeeshyMotion.progress(10f, 5f..5f)).isEqualTo(0f)
    }
}
