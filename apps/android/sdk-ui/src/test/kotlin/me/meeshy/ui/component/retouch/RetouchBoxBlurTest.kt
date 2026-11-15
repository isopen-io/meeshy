package me.meeshy.ui.component.retouch

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Le flou du verre : pur, sans `android.*`. */
class RetouchBoxBlurTest {

    private fun gray(v: Int) = (0xFF shl 24) or (v shl 16) or (v shl 8) or v
    private fun red(p: Int) = p ushr 16 and 0xFF

    @Test
    fun `un aplat reste un aplat, bords compris`() {
        val flat = IntArray(25) { gray(120) }
        assertThat(RetouchBoxBlur.blur(flat, 5, 5, 2).toList()).isEqualTo(flat.toList())
    }

    @Test
    fun `un point clair s etale sur ses voisins et la lumiere totale se conserve a l arrondi pres`() {
        val size = 21
        val dot = IntArray(size * size) { gray(0) }.also { it[10 * size + 10] = gray(255) }
        val out = RetouchBoxBlur.blur(dot, size, size, 2)
        assertThat(red(out[10 * size + 10])).isLessThan(255)
        assertThat(red(out[10 * size + 11])).isGreaterThan(0)
        assertThat(red(out[0])).isEqualTo(0)
        assertThat(out.sumOf { red(it) }).isIn(com.google.common.collect.Range.closed(255 - 30, 255 + 30))
    }

    @Test
    fun `un rayon nul ne touche rien et un sigma nul n a pas de rayon`() {
        val pixels = IntArray(9) { gray(it * 20) }
        assertThat(RetouchBoxBlur.blur(pixels, 3, 3, 0).toList()).isEqualTo(pixels.toList())
        assertThat(RetouchBoxBlur.radiusFor(0f)).isEqualTo(0)
        assertThat(RetouchBoxBlur.radiusFor(8f)).isGreaterThan(RetouchBoxBlur.radiusFor(2f))
    }
}
