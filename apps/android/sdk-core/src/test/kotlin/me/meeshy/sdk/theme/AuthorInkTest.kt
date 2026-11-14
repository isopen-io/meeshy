package me.meeshy.sdk.theme

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.theme.DynamicColorGenerator.ThemeMode
import org.junit.Test
import kotlin.math.pow
import kotlin.math.roundToInt

/**
 * #17874 (A1.10, A2.2) : la couleur d'auteur du journal tient 4,5:1, telle quelle quand elle est déjà
 * lisible, sinon rapprochée de l'encre du thème du plus PETIT pas. Miroir Kotlin de `authorInk` du web
 * (`apps/web/src/lib/view/author-ink.ts`) et d'`AuthorInk` iOS, mesuré sur les 39 couleurs de la palette
 * contre les MÊMES fonds : surface, carte, chaque arrêt du fond du fil accent au pire, seul puis sous la lueur.
 */
class AuthorInkTest {
    private data class Scheme(val mode: ThemeMode, val backgrounds: List<String>, val ink: String)

    private val schemes = listOf(
        Scheme(ThemeMode.DARK, WEB_BACKGROUNDS.getValue(ThemeMode.DARK), "EEF2FF"),
        Scheme(ThemeMode.LIGHT, WEB_BACKGROUNDS.getValue(ThemeMode.LIGHT), "1E1B4B"),
    )

    private val palette = DynamicColorGenerator.vibrantPalette

    @Test
    fun `the palette has thirty nine colours`() {
        assertThat(palette).hasSize(39)
    }

    @Test
    fun `every palette colour holds 4,5 to 1 on every background of both schemes`() {
        for (scheme in schemes) for (color in palette) {
            val ink = AuthorInk.hex(color, scheme.mode)
            for (background in scheme.backgrounds) {
                assertThat(contrast(ink, background)).isAtLeast(4.5)
            }
        }
    }

    @Test
    fun `a colour that is already legible is not modified`() {
        for (scheme in schemes) for (color in palette.filter { legible(it, scheme) }) {
            assertThat(AuthorInk.hex(color, scheme.mode)).isEqualTo(color)
        }
    }

    @Test
    fun `a colour that is not gets the smallest step toward the ink`() {
        for (scheme in schemes) for (color in palette.filterNot { legible(it, scheme) }) {
            val expected = (0..25).map { mix(color, scheme.ink, minOf(1.0, it * 0.04)) }.firstOrNull { legible(it, scheme) } ?: scheme.ink
            assertThat(AuthorInk.hex(color, scheme.mode)).isEqualTo(expected)
        }
    }

    @Test
    fun `the backgrounds are the web set, surface card and every thread stop under its glow`() {
        assertThat(AuthorInk.backgrounds(ThemeMode.DARK)).isEqualTo(WEB_BACKGROUNDS.getValue(ThemeMode.DARK))
        assertThat(AuthorInk.backgrounds(ThemeMode.LIGHT)).isEqualTo(WEB_BACKGROUNDS.getValue(ThemeMode.LIGHT))
    }

    @Test
    fun `every palette colour is the web author ink in both schemes`() {
        for ((mode, expected) in WEB_INK) for (color in palette) {
            assertThat(AuthorInk.hex(color, mode)).isEqualTo(expected.getValue(color))
        }
    }

    @Test
    fun `the light scheme no longer stops at the fixed brightness ceiling`() {
        val stuck = palette.filter { contrast(DynamicColorGenerator.adaptedColor(it, ThemeMode.LIGHT), "FFFFFF") < 4.5 }
        assertThat(stuck).isNotEmpty()
        for (color in stuck) assertThat(contrast(AuthorInk.hex(color, ThemeMode.LIGHT), "FFFFFF")).isAtLeast(4.5)
    }

    @Test
    fun `a hash prefix and lowercase are accepted and the answer is the bare uppercase form`() {
        assertThat(AuthorInk.hex("#e74c3c", ThemeMode.DARK)).isEqualTo(AuthorInk.hex("E74C3C", ThemeMode.DARK))
        assertThat(AuthorInk.hex("e74c3c", ThemeMode.LIGHT)).hasLength(6)
        assertThat(AuthorInk.hex("e74c3c", ThemeMode.LIGHT)).isEqualTo(AuthorInk.hex("E74C3C", ThemeMode.LIGHT))
    }

    private fun legible(hex: String, scheme: Scheme) = scheme.backgrounds.all { contrast(hex, it) >= 4.5 }

    private fun channels(hex: String): List<Double> = listOf(0, 2, 4).map { hex.substring(it, it + 2).toInt(16).toDouble() }

    private fun luminance(hex: String): Double {
        val (r, g, b) = channels(hex).map { c ->
            val s = c / 255
            if (s <= 0.03928) s / 12.92 else ((s + 0.055) / 1.055).pow(2.4)
        }
        return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }

    private fun contrast(a: String, b: String): Double {
        val la = luminance(a)
        val lb = luminance(b)
        return (maxOf(la, lb) + 0.05) / (minOf(la, lb) + 0.05)
    }

    private fun mix(a: String, b: String, t: Double): String {
        val ca = channels(a)
        val cb = channels(b)
        return (0..2).joinToString("") { "%02X".format((ca[it] + (cb[it] - ca[it]) * t).roundToInt()) }
    }

    private companion object {
        /** `AUTHOR_INK_BACKGROUNDS` du web, en hex nu : surface, carte, trois arrêts du fil, ces arrêts sous la lueur. */
        val WEB_BACKGROUNDS = mapOf(
            ThemeMode.DARK to listOf("09090B", "13111C", "0F0C29", "2C2943", "24243E", "2C2943", "45435A", "3E3E55"),
            ThemeMode.LIGHT to listOf("FFFFFF", "F8F7FF", "EBEBEB", "FFFFFF", "F2F2F2", "DBDBDB", "EDEDED", "E1E1E1"),
        )

        /** `authorInk(...)` du web sur chaque couleur de la palette, relevé (hex nu majuscule) dans le témoin iOS. */
        val WEB_INK = mapOf(
            ThemeMode.DARK to mapOf(
                "E74C3C" to "EBA2A1", "C0392B" to "DCA8AA", "DC4A5A" to "E5A1B0", "D94452" to "E5A5B3", "F43F5E" to "F19CB2",
                "FF7F50" to "FB9B7A", "E67E22" to "E9A872", "F97316" to "F5A16A", "EA580C" to "ECA281", "D4763B" to "DEA889",
                "D97706" to "E1A86A", "B8860B" to "CEB16D", "CA8A04" to "D7AF5E", "2ECC71" to "2ECC71", "27AE60" to "6FC699",
                "059669" to "75C2B1", "16A34A" to "75C69A", "22C55E" to "43CC78", "1ABC9C" to "44C7B0", "14B8A6" to "48C6BB",
                "0D9488" to "79C1C1", "0891B2" to "76C0D7", "00CED1" to "00CED1", "3498DB" to "7EBCE9", "2980B9" to "8FBBDD",
                "0EA5E9" to "56BEF0", "3B82F6" to "91B8FA", "2563EB" to "96B3F6", "6366F1" to "ABAFF8", "4F46E5" to "AEADF5",
                "7C3AED" to "C0A8F8", "6D28D9" to "C0A9F1", "9B59B6" to "C6A9DC", "A855F7" to "CAA0FB", "D946EF" to "E399F7",
                "C026D3" to "DCA0ED", "EC4899" to "ED9ACA", "E91E63" to "EC9DC1", "DB2777" to "E6A1C9",
            ),
            ThemeMode.LIGHT to mapOf(
                "E74C3C" to "A73C41", "C0392B" to "AD352F", "DC4A5A" to "9F3B55", "D94452" to "A53950", "F43F5E" to "A73257",
                "FF7F50" to "8A4B4D", "E67E22" to "864E36", "F97316" to "90492F", "EA580C" to "A14223", "D4763B" to "844E42",
                "D97706" to "874F24", "B8860B" to "7A5B25", "CA8A04" to "7E5923", "2ECC71" to "25695C", "27AE60" to "236756",
                "059669" to "0E6A5E", "16A34A" to "196D4A", "22C55E" to "206653", "1ABC9C" to "1C6872", "14B8A6" to "196677",
                "0D9488" to "136872", "0891B2" to "10678D", "00CED1" to "126381", "3498DB" to "2A619C", "2980B9" to "256096",
                "0EA5E9" to "16639D", "3B82F6" to "2F59B2", "2563EB" to "2457D1", "6366F1" to "5051C3", "4F46E5" to "4F46E5",
                "7C3AED" to "7136DA", "6D28D9" to "6D28D9", "9B59B6" to "7D4A9C", "A855F7" to "7640B9", "D946EF" to "8E35AD",
                "C026D3" to "9923B2", "EC4899" to "9A367A", "E91E63" to "B01D5C", "DB2777" to "AE246C",
            ),
        )
    }
}
