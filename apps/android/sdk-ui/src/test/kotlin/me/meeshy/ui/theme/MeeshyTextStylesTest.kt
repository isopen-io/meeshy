package me.meeshy.ui.theme

import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Port de `MeeshyFont.relative` (le texte qui suit la taille de police du
 * système) et de `MeeshyFont.emoji` (l'emoji à la taille EXACTE demandée).
 */
class MeeshyTextStylesTest {

    private fun density(fontScale: Float) = Density(density = 2f, fontScale = fontScale)

    private fun renderedDp(style: androidx.compose.ui.text.TextStyle, density: Density): Float =
        with(density) { style.fontSize.toDp().value }

    @Test
    fun `meeshyText carries the requested size and weight in sp`() {
        val style = meeshyText(size = 15.sp, weight = FontWeight.Medium)
        assertThat(style.fontSize).isEqualTo(15.sp)
        assertThat(style.fontWeight).isEqualTo(FontWeight.Medium)
    }

    @Test
    fun `meeshyText defaults to the regular weight`() {
        assertThat(meeshyText(MeeshyFontSize.body).fontWeight).isEqualTo(FontWeight.Normal)
    }

    @Test
    fun `meeshyText grows with the system font size`() {
        val style = meeshyText(MeeshyFontSize.body)
        val standard = renderedDp(style, density(fontScale = 1f))
        val large = renderedDp(style, density(fontScale = 1.3f))
        assertThat(standard).isWithin(0.001f).of(15f)
        assertThat(large).isGreaterThan(standard)
    }

    @Test
    fun `rounded or not, text carries the Nunito brand family`() {
        assertThat(meeshyText(MeeshyFontSize.title, rounded = true).fontFamily).isEqualTo(NunitoFontFamily)
        assertThat(meeshyText(MeeshyFontSize.title, rounded = false).fontFamily).isEqualTo(NunitoFontFamily)
    }

    @Test
    fun `emojiTextStyle renders the exact size at every system font scale`() {
        listOf(90.dp, 60.dp, 45.dp).forEach { size ->
            listOf(1f, 1.3f, 2f).forEach { fontScale ->
                val style = emojiTextStyle(size, density(fontScale))
                assertThat(renderedDp(style, density(fontScale))).isWithin(0.01f).of(size.value)
            }
        }
    }

    @Test
    fun `emojiTextStyle is not scaled while meeshyText is, for the same size`() {
        val scaled = density(fontScale = 1.5f)
        val size = MeeshyFontSize.body
        val emoji = renderedDp(emojiTextStyle(size.value.dp, scaled), scaled)
        val text = renderedDp(meeshyText(size), scaled)
        assertThat(emoji).isWithin(0.01f).of(size.value)
        assertThat(text).isGreaterThan(emoji)
    }

    @Test
    fun `emojiTextStyle sets no brand font so the emoji glyphs come from the system`() {
        assertThat(emojiTextStyle(90.dp, density(1f)).fontFamily).isNull()
    }
}
