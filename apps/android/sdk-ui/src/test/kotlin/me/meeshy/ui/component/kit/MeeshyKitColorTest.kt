package me.meeshy.ui.component.kit

import androidx.compose.ui.graphics.Color
import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Le calcul de couleur partagé par K27, K30 et K31 : contraste WCAG, assombrissement, décalage de teinte. */
class MeeshyKitColorTest {

    @Test
    fun `le contraste du noir sur le blanc vaut 21 et celui d une couleur sur elle meme vaut 1`() {
        assertThat(MeeshyKitColor.contrast(Color.Black, Color.White)).isWithin(1e-6).of(21.0)
        assertThat(MeeshyKitColor.contrast(Color(0xFF6366F1), Color(0xFF6366F1))).isWithin(1e-9).of(1.0)
    }

    @Test
    fun `une teinte deja lisible reste la meme et une teinte claire s assombrit jusqu au contraste demande`() {
        val readable = Color(0xFF1B1140)
        assertThat(MeeshyKitColor.darkened(readable, 4.5, Color.White)).isEqualTo(readable)
        val pale = Color(0xFFFFE08A)
        val served = MeeshyKitColor.darkened(pale, 4.5, Color(0xFFF5F3FF))
        assertThat(MeeshyKitColor.contrast(served, Color(0xFFF5F3FF))).isAtLeast(4.5)
    }

    @Test
    fun `decaler la teinte de moins 30 degres tourne le rouge vers le magenta et un gris ne bouge pas`() {
        val shifted = MeeshyKitColor.hueShifted(Color.Red, -30.0)
        val eightBitStep = 1f / 255f
        assertThat(shifted.red).isWithin(eightBitStep).of(1f)
        assertThat(shifted.green).isWithin(eightBitStep).of(0f)
        assertThat(shifted.blue).isWithin(eightBitStep).of(0.5f)
        val grey = Color(0.4f, 0.4f, 0.4f)
        assertThat(MeeshyKitColor.hueShifted(grey, 90.0)).isEqualTo(grey)
    }

    @Test
    fun `l encre d une pastille est le blanc ou l encre sombre selon le meilleur contraste`() {
        val dark = Color(0xFF0B0B12)
        assertThat(MeeshyKitColor.inkOn(Color(0xFF312E81), dark)).isEqualTo(Color.White)
        assertThat(MeeshyKitColor.inkOn(Color(0xFFFDE68A), dark)).isEqualTo(dark)
    }
}
