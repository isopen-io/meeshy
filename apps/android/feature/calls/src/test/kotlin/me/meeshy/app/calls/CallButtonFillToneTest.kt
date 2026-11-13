package me.meeshy.app.calls

import androidx.compose.ui.graphics.Color
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallButtonGlassRule
import me.meeshy.sdk.model.call.CallButtonGlassTreatment
import me.meeshy.sdk.model.call.CallButtonRole
import me.meeshy.ui.theme.MeeshyPalette
import org.junit.Test

/**
 * #17323 — ce qui habille le verre de CHAQUE bouton, et la loi 3 (le ton adaptatif) par-dessus : un bouton inactif
 * n'est que du verre sur une image, et s'assombrit sur un écran reçu. Plus aucun disque translucide posé à plat.
 */
class CallButtonFillToneTest {

    private fun treatment(kind: CallPillKind): CallButtonGlassTreatment = CallButtonGlassRule.treatment(kind.glassRole())

    @Test
    fun `les quatre etats visuels se reduisent aux trois roles de la loi, la pause automatique est neutre`() {
        assertThat(CallPillKind.Normal.glassRole()).isEqualTo(CallButtonRole.Neutral)
        assertThat(CallPillKind.Warning.glassRole()).isEqualTo(CallButtonRole.Neutral)
        assertThat(CallPillKind.Active.glassRole()).isEqualTo(CallButtonRole.Active)
        assertThat(CallPillKind.Destructive.glassRole()).isEqualTo(CallButtonRole.Destructive)
    }

    @Test
    fun `sur une image, un bouton inactif n'est que du verre clair, sans disque dessous`() {
        for (kind in listOf(CallPillKind.Normal, CallPillKind.Warning)) {
            assertThat(CallButtonFill.backing(treatment(kind))).isEqualTo(Color.Transparent)
            assertThat(CallButtonFill.backing(treatment(kind), CallGlassTone.OverPicture)).isEqualTo(Color.Transparent)
            assertThat(CallButtonFill.glassTint(treatment(kind), CallGlassTone.OverPicture)).isEqualTo(CallPalette.Ink)
        }
    }

    @Test
    fun `sur un ecran recu, un bouton inactif prend un voile sombre a 58 pour cent et pas de lavis clair`() {
        val neutral = treatment(CallPillKind.Normal)

        val backing = CallButtonFill.backing(neutral, CallGlassTone.OverLightContent)

        assertThat(backing).isEqualTo(CallPalette.OnLightGlass.copy(alpha = 0.58f))
        assertThat(backing.red).isLessThan(0.2f)
        assertThat(CallButtonFill.glassTint(neutral, CallGlassTone.OverLightContent)).isNull()
    }

    @Test
    fun `sur un ecran recu, le voile sombre se tire du jeton de l'encre du verre, jamais d'un litteral`() {
        assertThat(CallGlassTone.OverLightContent.veil(0.58f)).isEqualTo(CallPalette.OnLightGlass.copy(alpha = 0.58f))
        assertThat(CallGlassTone.OverPicture.veil(0.2f)).isEqualTo(CallPalette.Veil.copy(alpha = 0.2f))
    }

    @Test
    fun `l'actif est un blanc plein et Fin un rouge plein, quel que soit le ton`() {
        for (tone in CallGlassTone.values()) {
            assertThat(CallButtonFill.backing(treatment(CallPillKind.Active), tone)).isEqualTo(Color.White)
            assertThat(CallButtonFill.backing(treatment(CallPillKind.Destructive), tone)).isEqualTo(MeeshyPalette.Error)
        }
    }

    @Test
    fun `le verre de Fin est teinte de rouge, celui de l'actif n'est pas teinte puisque le blanc le couvre`() {
        for (tone in CallGlassTone.values()) {
            assertThat(CallButtonFill.glassTint(treatment(CallPillKind.Destructive), tone)).isEqualTo(MeeshyPalette.Error)
            assertThat(CallButtonFill.glassTint(treatment(CallPillKind.Active), tone)).isNull()
        }
    }

    @Test
    fun `seul Fin est rouge, aucun autre bouton ne l'est ni dessous ni dans son lavis`() {
        for (kind in listOf(CallPillKind.Normal, CallPillKind.Warning, CallPillKind.Active)) {
            for (tone in CallGlassTone.values()) {
                assertThat(CallButtonFill.backing(treatment(kind), tone)).isNotEqualTo(MeeshyPalette.Error)
                assertThat(CallButtonFill.glassTint(treatment(kind), tone)).isNotEqualTo(MeeshyPalette.Error)
            }
        }
    }

    @Test
    fun `le retour au toucher est conserve, rapetisse a 0,88 et s'eclaircit, sauf sous Reduire les animations pour l'echelle`() {
        assertThat(CallButtonFill.pressScale(isPressed = true, reduceMotion = false)).isEqualTo(0.88f)
        assertThat(CallButtonFill.pressScale(isPressed = true, reduceMotion = true)).isEqualTo(1f)
        assertThat(CallButtonFill.pressedHighlight(isPressed = true)).isEqualTo(Color.White.copy(alpha = 0.22f))
        assertThat(CallButtonFill.pressedHighlight(isPressed = false)).isEqualTo(Color.Transparent)
    }
}
