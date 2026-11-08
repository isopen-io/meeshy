package me.meeshy.app.calls

import androidx.compose.ui.graphics.Color
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyPalette
import org.junit.Test

/** Loi 3 : un bouton inactif garde son verre blanc sur une image, et passe au verre sombre sur un écran reçu. */
class CallButtonFillToneTest {

    @Test
    fun `sur une image, un bouton inactif garde le verre blanc deja livre`() {
        assertThat(CallButtonFill.color(CallPillKind.Normal)).isEqualTo(Color.White.copy(alpha = 0.16f))
        assertThat(CallButtonFill.color(CallPillKind.Normal, CallGlassTone.OverPicture)).isEqualTo(Color.White.copy(alpha = 0.16f))
    }

    @Test
    fun `sur un ecran recu, un bouton inactif devient un verre sombre opaque a 58 pour cent`() {
        val fill = CallButtonFill.color(CallPillKind.Normal, CallGlassTone.OverLightContent)

        assertThat(fill.alpha).isWithin(0.01f).of(0.58f)
        assertThat(fill.red).isLessThan(0.2f)
    }

    @Test
    fun `l'actif et Fin ne changent jamais avec le ton`() {
        assertThat(CallButtonFill.color(CallPillKind.Active, CallGlassTone.OverLightContent)).isEqualTo(Color.White)
        assertThat(CallButtonFill.color(CallPillKind.Destructive, CallGlassTone.OverLightContent)).isEqualTo(MeeshyPalette.Error)
    }
}
