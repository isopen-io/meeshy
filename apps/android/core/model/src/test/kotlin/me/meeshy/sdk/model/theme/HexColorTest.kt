package me.meeshy.sdk.model.theme

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class HexColorTest {

    @Test
    fun `six digits read as opaque RGB with or without the hash`() {
        val expected = HexColor(red = 0x63, green = 0x66, blue = 0xF1, alpha = 255)
        assertThat(HexColor.parse("6366F1")).isEqualTo(expected)
        assertThat(HexColor.parse("#6366f1")).isEqualTo(expected)
        assertThat(HexColor.parse("  #6366F1 ")).isEqualTo(expected)
    }

    @Test
    fun `eight digits carry the alpha LAST`() {
        val black = HexColor.parse("000000A6")!!
        assertThat(black.red).isEqualTo(0)
        assertThat(black.blue).isEqualTo(0)
        assertThat(black.alpha).isEqualTo(0xA6)
        assertThat(black.alphaFraction).isWithin(0.005).of(0.65)

        val indigo = HexColor.parse("#6366F1A6")!!
        assertThat(indigo.red).isEqualTo(0x63)
        assertThat(indigo.green).isEqualTo(0x66)
        assertThat(indigo.blue).isEqualTo(0xF1)
        assertThat(indigo.alpha).isEqualTo(0xA6)
    }

    @Test
    fun `three digits expand each nibble`() {
        assertThat(HexColor.parse("#F0A")).isEqualTo(HexColor(0xFF, 0x00, 0xAA, 255))
        assertThat(HexColor.parse("abc")).isEqualTo(HexColor(0xAA, 0xBB, 0xCC, 255))
    }

    @Test
    fun `unreadable input is null`() {
        listOf("", "#", "12345", "1234567", "GGGGGG", "#12", "1234", "+12345", "12 456").forEach {
            assertThat(HexColor.parse(it)).isNull()
        }
    }

    @Test
    fun `luminance follows WCAG`() {
        assertThat(HexColor.parse("000000")!!.luminance).isEqualTo(0.0)
        assertThat(HexColor.parse("FFFFFF")!!.luminance).isWithin(1e-9).of(1.0)
        assertThat(HexColor.parse("FF0000")!!.luminance).isWithin(1e-4).of(0.2126)
    }

    @Test
    fun `readable ink is black on light and white on dark`() {
        assertThat(HexColor.parse("FFFFFF")!!.readableInk).isEqualTo(InkColor.BLACK)
        assertThat(HexColor.parse("FFD60A")!!.readableInk).isEqualTo(InkColor.BLACK)
        assertThat(HexColor.parse("000000")!!.readableInk).isEqualTo(InkColor.WHITE)
        assertThat(HexColor.parse("4F46E5")!!.readableInk).isEqualTo(InkColor.WHITE)
    }

    @Test
    fun `readable ink switches at the exact equal-contrast luminance`() {
        val pivot = kotlin.math.sqrt(0.05 * 1.05) - 0.05
        assertThat(HexColor.INK_SWITCH_LUMINANCE).isEqualTo(pivot)
        assertThat(InkColor.forLuminance(pivot + 1e-6)).isEqualTo(InkColor.BLACK)
        assertThat(InkColor.forLuminance(pivot - 1e-6)).isEqualTo(InkColor.WHITE)
        assertThat(InkColor.forLuminance(pivot)).isEqualTo(InkColor.WHITE)
    }
}
