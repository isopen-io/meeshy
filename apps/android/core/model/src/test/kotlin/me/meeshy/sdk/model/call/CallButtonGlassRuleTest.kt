package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * #17323 — la loi pure qui choisit le traitement de verre de CHAQUE bouton de l'appel (pilule, rangées du (…),
 * panneaux, en-tête). Miroir de iOS `CallButtonGlassRuleTests` : Android n'a pas de Liquid Glass, son verre est
 * `MeeshyGlassSurface` partout, donc la loi ne prend pas la disponibilité de l'OS.
 */
class CallButtonGlassRuleTest {

    private val everyRole = CallButtonRole.values().toList()

    @Test
    fun `chaque bouton est un verre interactif`() {
        for (role in everyRole) {
            assertThat(CallButtonGlassRule.treatment(role).isInteractive).isTrue()
        }
    }

    @Test
    fun `un bouton neutre est du verre sans aucun disque posé dessous`() {
        val treatment = CallButtonGlassRule.treatment(CallButtonRole.Neutral)

        assertThat(treatment.surface).isEqualTo(CallButtonGlassSurface.Glass)
        assertThat(treatment.hasSolidWhiteBacking).isFalse()
    }

    @Test
    fun `l'actif reste un blanc plein, pour que le glyphe sombre garde son contraste`() {
        val treatment = CallButtonGlassRule.treatment(CallButtonRole.Active)

        assertThat(treatment.surface).isEqualTo(CallButtonGlassSurface.Glass)
        assertThat(treatment.hasSolidWhiteBacking).isTrue()
    }

    @Test
    fun `Fin reste rouge, et sans disque blanc`() {
        val treatment = CallButtonGlassRule.treatment(CallButtonRole.Destructive)

        assertThat(treatment.surface).isEqualTo(CallButtonGlassSurface.ProminentRed)
        assertThat(treatment.hasSolidWhiteBacking).isFalse()
    }

    @Test
    fun `Fin est le seul bouton rouge`() {
        val red = everyRole.filter { CallButtonGlassRule.treatment(it).surface == CallButtonGlassSurface.ProminentRed }

        assertThat(red).containsExactly(CallButtonRole.Destructive)
    }

    @Test
    fun `le verre dessine ne reagit pas seul au doigt, donc la surbrillance est toujours dessinee`() {
        for (role in everyRole) {
            assertThat(CallButtonGlassRule.treatment(role).drawsPressHighlight).isTrue()
        }
    }
}
