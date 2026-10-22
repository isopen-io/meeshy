package me.meeshy.ui.theme

import androidx.compose.ui.graphics.Color
import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ThemePaletteTest {

    @Test
    fun `hex parser reads alpha last`() {
        assertThat(hexColor("000000A6").alpha).isWithin(0.005f).of(0.65f)
        assertThat(hexColor("#6366F1A6").alpha).isWithin(0.005f).of(0.65f)
        assertThat(hexColor("#6366F1")).isEqualTo(Color(0xFF6366F1))
        assertThat(hexColor("zzz")).isEqualTo(Color.Unspecified)
    }

    @Test
    fun `surface is intensity in dark and half in light`() {
        assertThat(ThemePalette(true).surface("FF0000").alpha).isWithin(0.005f).of(0.15f)
        assertThat(ThemePalette(false).surface("FF0000").alpha).isWithin(0.005f).of(0.075f)
        assertThat(ThemePalette(false).surface("FF0000", 0.4f).alpha).isWithin(0.005f).of(0.2f)
    }

    @Test
    fun `button shadow is 50 percent in dark and 30 percent in light`() {
        assertThat(ThemePalette(true).buttonShadow("6366F1").alpha).isWithin(0.005f).of(0.5f)
        assertThat(ThemePalette(false).buttonShadow("6366F1").alpha).isWithin(0.005f).of(0.3f)
    }

    @Test
    fun `four ambient orbs follow the iOS sizes and opacities`() {
        val dark = ThemePalette(true).ambientOrbs
        assertThat(dark.map { it.sizeDp }).containsExactly(300, 350, 250, 200).inOrder()
        dark.map { it.color.alpha }.zip(listOf(0.10f, 0.10f, 0.08f, 0.06f))
            .forEach { (actual, expected) -> assertThat(actual).isWithin(0.005f).of(expected) }
        val light = ThemePalette(false).ambientOrbs
        light.map { it.color.alpha }.zip(listOf(0.05f, 0.05f, 0.04f, 0.03f))
            .forEach { (actual, expected) -> assertThat(actual).isWithin(0.005f).of(expected) }
    }

    @Test
    fun `accent text keeps brightness readable per mode`() {
        val darkInk = ThemePalette(true).accentText("1E1B4B")
        val lightInk = ThemePalette(false).accentText("FFFFFF")
        assertThat(maxOf(darkInk.red, darkInk.green, darkInk.blue)).isAtLeast(0.69f)
        assertThat(maxOf(lightInk.red, lightInk.green, lightInk.blue)).isAtMost(0.61f)
    }

    @Test
    fun `background gradient differs from main background and between modes`() {
        assertThat(MeeshyGradients.backgroundGradient(true)).isNotEqualTo(MeeshyGradients.mainBackground(true))
        assertThat(MeeshyGradients.backgroundGradient(true)).isNotEqualTo(MeeshyGradients.backgroundGradient(false))
    }

    @Test
    fun `readable ink picks black on light and white on dark`() {
        assertThat(readableInk("FFFFFF")).isEqualTo(Color.Black)
        assertThat(readableInk("000000")).isEqualTo(Color.White)
    }
}
