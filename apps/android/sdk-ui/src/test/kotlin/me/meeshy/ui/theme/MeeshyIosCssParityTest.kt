package me.meeshy.ui.theme

import androidx.compose.ui.graphics.Color
import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import kotlin.math.abs
import org.junit.Assume.assumeTrue
import org.junit.Test

/**
 * Parity with the GENERATED iOS table `packages/design-tokens/ios.css` (#5445) — the table the web
 * reads, derived by `generate-from-ios.mjs` from `MeeshyColors.swift`. Replaying it here makes the
 * Android palette answer to the same file as the web: a hue that drifts on either side turns this
 * test red instead of waiting for someone to compare two screens by eye.
 *
 * The file is not part of the Android project: when it cannot be found (a sparse checkout, a
 * source archive) every test is SKIPPED, not failed — `assumeTrue`, the "Assume si absent" of the
 * lot. In `android.yml` the checkout is complete, so the tests run.
 *
 * Only the tokens Android declares are compared. A CSS variable of a family the lot covers
 * (`indigo-*`, `purple-*`, `neutral-*`, `state-*`, `on-media*`, `media-*`, `scrim*`) that has no
 * Android counterpart fails `every color of a covered family is mapped`, so a token iOS adds does
 * not slip past Android unnoticed.
 */
class MeeshyIosCssParityTest {

    /** An sRGB color read from the CSS: the RGB triple and the alpha of a `color-mix(… N%, transparent)`. */
    private data class CssColor(val rgb: Int, val alpha: Double)

    private val cssFile: File? by lazy {
        generateSequence(File("").absoluteFile) { it.parentFile }
            .map { File(it, "packages/design-tokens/ios.css") }
            .firstOrNull { it.isFile }
    }

    private fun requireCss(): String {
        assumeTrue("packages/design-tokens/ios.css absent: parity not checked", cssFile != null)
        return cssFile!!.readText()
    }

    /** The body of the first rule whose selector matches [selector] (no nested braces in this file). */
    private fun blockBody(css: String, selector: Regex): String {
        val header = selector.find(css)
        check(header != null) { "bloc CSS « ${selector.pattern} » introuvable" }
        val close = css.indexOf('}', header.range.last)
        return css.substring(header.range.last + 1, close)
    }

    private fun declarations(body: String): Map<String, String> =
        Regex("""--ios-([a-z0-9-]+):\s*([^;]+);""").findAll(body)
            .associate { it.groupValues[1] to it.groupValues[2].trim() }

    private fun parse(value: String): CssColor? {
        Regex("""^#([0-9a-fA-F]{6})$""").find(value)?.let {
            return CssColor(it.groupValues[1].toInt(16), 1.0)
        }
        val mix = Regex("""^color-mix\(in srgb,\s*(#[0-9a-fA-F]{6}|white|black)\s+(\d+)%,\s*transparent\)$""").find(value)
            ?: return null
        val base = mix.groupValues[1]
        val rgb = when (base) {
            "white" -> 0xFFFFFF
            "black" -> 0x000000
            else -> base.removePrefix("#").toInt(16)
        }
        return CssColor(rgb, mix.groupValues[2].toInt() / 100.0)
    }

    private fun Color.rgb(): Int =
        (Math.round(red * 255f) shl 16) or (Math.round(green * 255f) shl 8) or Math.round(blue * 255f)

    private fun assertParity(variable: String, css: Map<String, String>, android: Color) {
        val declared = css[variable]
        assertWithMessage("--ios-$variable absent de ios.css").that(declared).isNotNull()
        val expected = parse(declared!!)
        assertWithMessage("--ios-$variable : « $declared » n'est ni #rrggbb ni color-mix(… transparent)")
            .that(expected).isNotNull()
        assertWithMessage("--ios-$variable : RVB").that(android.rgb()).isEqualTo(expected!!.rgb)
        // An 8-bit alpha can sit up to half a step (0.002) from the exact percentage.
        assertWithMessage("--ios-$variable : alpha")
            .that(abs(android.alpha - expected.alpha)).isAtMost(1.0 / 255.0)
    }

    private val defaultMapping: Map<String, Color> = mapOf(
        "indigo-50" to MeeshyPalette.Indigo50,
        "indigo-100" to MeeshyPalette.Indigo100,
        "indigo-200" to MeeshyPalette.Indigo200,
        "indigo-300" to MeeshyPalette.Indigo300,
        "indigo-400" to MeeshyPalette.Indigo400,
        "indigo-500" to MeeshyPalette.Indigo500,
        "indigo-600" to MeeshyPalette.Indigo600,
        "indigo-700" to MeeshyPalette.Indigo700,
        "indigo-800" to MeeshyPalette.Indigo800,
        "indigo-900" to MeeshyPalette.Indigo900,
        "indigo-950" to MeeshyPalette.Indigo950,
        "purple-500" to MeeshyPalette.Purple500,
        "purple-600" to MeeshyPalette.Purple600,
        "purple-700" to MeeshyPalette.Purple700,
        "success" to MeeshyPalette.Success,
        "error" to MeeshyPalette.Error,
        "error-strong" to MeeshyPalette.ErrorStrong,
        "error-dark" to MeeshyPalette.ErrorDark,
        "warning" to MeeshyPalette.Warning,
        "info" to MeeshyPalette.Info,
        "pinned" to MeeshyPalette.PinnedBlue,
        "success-deep" to MeeshyPalette.SuccessDeep,
        "neutral-400" to MeeshyPalette.Neutral400,
        "neutral-500" to MeeshyPalette.Neutral500,
        "neutral-600" to MeeshyPalette.Neutral600,
        "meesh-silver" to MeeshyPalette.MeeshSilver,
        "state-view-once" to MeeshyMessageStateColors.ViewOnce,
        "state-opened" to MeeshyMessageStateColors.Opened,
        "state-ephemeral" to MeeshyMessageStateColors.Ephemeral,
        "state-concealed" to MeeshyMessageStateColors.Concealed,
        "state-failed" to MeeshyMessageStateColors.Failed,
        "on-media" to MeeshyMediaChromeColors.OnMedia,
        "on-media-2" to MeeshyMediaChromeColors.OnMediaSecondary,
        "on-media-3" to MeeshyMediaChromeColors.OnMediaMuted,
        "media-fill" to MeeshyMediaChromeColors.MediaFill,
        "media-hairline" to MeeshyMediaChromeColors.MediaHairline,
        "media-backdrop" to MeeshyMediaChromeColors.MediaBackdrop,
        "scrim-soft" to MeeshyMediaChromeColors.ScrimSoft,
        "scrim" to MeeshyMediaChromeColors.Scrim,
        "scrim-strong" to MeeshyMediaChromeColors.ScrimStrong,
        "on-brand" to MeeshyMediaChromeColors.OnBrand,
        // The default block is the DARK scheme: planes and inks of the dark tokens.
        "surface" to DarkMeeshyTokens.backgroundPrimary,
        "surface-card" to DarkMeeshyTokens.backgroundSecondary,
        "ink" to DarkMeeshyTokens.textPrimary,
        "ink-2" to DarkMeeshyTokens.textSecondary,
        "ink-3" to DarkMeeshyTokens.textMuted,
    )

    private val lightMapping: Map<String, Color> = mapOf(
        "surface" to LightMeeshyTokens.backgroundPrimary,
        "surface-card" to LightMeeshyTokens.backgroundSecondary,
        "ink" to LightMeeshyTokens.textPrimary,
        "ink-2" to LightMeeshyTokens.textSecondary,
        "ink-3" to LightMeeshyTokens.textMuted,
    )

    private val coveredFamilies = listOf("indigo-", "purple-", "neutral-", "state-", "on-media", "media-", "scrim")

    private fun defaultBlock(css: String) = declarations(blockBody(css, Regex(""":root,\s*:root\.dark\s*\{""")))

    private fun lightBlock(css: String) = declarations(blockBody(css, Regex(""":root\.light\s*\{""")))

    @Test
    fun `the default block is read - the parity is not vacuous`() {
        val css = defaultBlock(requireCss())
        assertThat(css.size).isAtLeast(40)
        assertThat(css).containsKey("indigo-500")
    }

    @Test
    fun `every shared and dark token matches ios dot css`() {
        val css = defaultBlock(requireCss())
        defaultMapping.forEach { (variable, android) -> assertParity(variable, css, android) }
    }

    @Test
    fun `every light scheme override matches ios dot css`() {
        val css = lightBlock(requireCss())
        lightMapping.forEach { (variable, android) -> assertParity(variable, css, android) }
    }

    @Test
    fun `the text AA fix reaches the generated table - ink 2 and ink 3 are the AA values`() {
        val css = requireCss()
        assertThat(parse(defaultBlock(css).getValue("ink-3"))).isEqualTo(CssColor(0xA5B4FC, 0.7))
        assertThat(parse(lightBlock(css).getValue("ink-2"))).isEqualTo(CssColor(0x4338CA, 0.8))
        assertThat(parse(lightBlock(css).getValue("ink-3"))).isEqualTo(CssColor(0x4338CA, 0.8))
    }

    @Test
    fun `every color of a covered family is mapped`() {
        val css = defaultBlock(requireCss())
        val unmapped = css.keys
            .filter { name -> coveredFamilies.any { name.startsWith(it) } }
            .filter { parse(css.getValue(it)) != null }
            .filterNot { it in defaultMapping }
        assertWithMessage("variables iOS declarees sans jeton Android : $unmapped").that(unmapped).isEmpty()
    }
}
