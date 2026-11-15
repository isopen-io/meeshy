package me.meeshy.ui.theme

import androidx.compose.ui.graphics.Color
import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import kotlin.math.pow
import org.junit.Test

/**
 * Contrast contract (iOS D-18 / D-18 bis, `TextMutedContrastAATests`): the secondary and muted text
 * hold WCAG AA for normal text (4.5:1) on EVERY declared plane of their scheme.
 *
 * The measure is the one iOS uses: the alpha is composited over the plane FIRST (what the renderer
 * paints), and the WCAG relative luminance is taken on the composite. Measuring a translucent ink
 * against its plane without compositing reads the opaque ink and flatters every `@ 80 %` token.
 */
class MeeshyContrastTest {

    private val aaNormalText = 4.5

    /** Alpha composition THEN luminance — never the luminance of the raw translucent ink. */
    private fun contrast(ink: Color, plane: Color): Double {
        val painted = composite(ink, plane)
        val a = luminance(painted)
        val b = luminance(plane)
        return (maxOf(a, b) + 0.05) / (minOf(a, b) + 0.05)
    }

    private fun composite(ink: Color, plane: Color): Color = Color(
        red = ink.red * ink.alpha + plane.red * (1f - ink.alpha),
        green = ink.green * ink.alpha + plane.green * (1f - ink.alpha),
        blue = ink.blue * ink.alpha + plane.blue * (1f - ink.alpha),
    )

    private fun luminance(color: Color): Double =
        0.2126 * channel(color.red) + 0.7152 * channel(color.green) + 0.0722 * channel(color.blue)

    private fun channel(value: Float): Double {
        val c = value.toDouble()
        return if (c <= 0.03928) c / 12.92 else ((c + 0.055) / 1.055).pow(2.4)
    }

    private fun lightPlanes() = mapOf(
        "backgroundPrimary" to LightMeeshyTokens.backgroundPrimary,
        "backgroundSecondary" to LightMeeshyTokens.backgroundSecondary,
        "backgroundTertiary" to LightMeeshyTokens.backgroundTertiary,
    )

    private fun darkPlanes() = mapOf(
        "backgroundPrimary" to DarkMeeshyTokens.backgroundPrimary,
        "backgroundSecondary" to DarkMeeshyTokens.backgroundSecondary,
        "backgroundTertiary" to DarkMeeshyTokens.backgroundTertiary,
    )

    // MARK: - The measure itself

    @Test
    fun `the measure reads black on white at 21 to 1 and an ink on itself at 1 to 1`() {
        assertThat(contrast(Color.Black, Color.White)).isWithin(0.001).of(21.0)
        assertThat(contrast(Color.White, Color.White)).isWithin(0.001).of(1.0)
    }

    @Test
    fun `the measure composites the alpha before taking the luminance`() {
        val halfBlack = Color(0x80000000)
        // Raw opaque black would read 21:1; the painted mid-grey reads about 3.9:1.
        assertThat(contrast(halfBlack, Color.White)).isWithin(0.1).of(3.95)
    }

    // MARK: - Secondary and muted text hold AA on every declared plane

    @Test
    fun `light secondary and muted text pass AA on every light plane`() {
        lightPlanes().forEach { (name, plane) ->
            assertWithMessage("light textSecondary on $name").that(contrast(LightMeeshyTokens.textSecondary, plane)).isAtLeast(aaNormalText)
            assertWithMessage("light textMuted on $name").that(contrast(LightMeeshyTokens.textMuted, plane)).isAtLeast(aaNormalText)
        }
    }

    @Test
    fun `dark secondary and muted text pass AA on every dark plane`() {
        darkPlanes().forEach { (name, plane) ->
            assertWithMessage("dark textSecondary on $name").that(contrast(DarkMeeshyTokens.textSecondary, plane)).isAtLeast(aaNormalText)
            assertWithMessage("dark textMuted on $name").that(contrast(DarkMeeshyTokens.textMuted, plane)).isAtLeast(aaNormalText)
        }
    }

    @Test
    fun `the contrast matches the values measured on iOS`() {
        val lightSecondary = LightMeeshyTokens.backgroundSecondary
        val lightTertiary = LightMeeshyTokens.backgroundTertiary
        assertThat(contrast(LightMeeshyTokens.textSecondary, lightSecondary)).isWithin(0.02).of(4.76)
        assertThat(contrast(LightMeeshyTokens.textSecondary, lightTertiary)).isWithin(0.02).of(4.60)
        assertThat(contrast(LightMeeshyTokens.textMuted, lightSecondary)).isWithin(0.02).of(4.76)
        assertThat(contrast(LightMeeshyTokens.textMuted, lightTertiary)).isWithin(0.02).of(4.60)
        // iOS composites an exact 0.70; an 8-bit alpha is 0.702, hence the slightly wider window.
        val darkSecondary = DarkMeeshyTokens.backgroundSecondary
        val darkTertiary = DarkMeeshyTokens.backgroundTertiary
        assertThat(contrast(DarkMeeshyTokens.textMuted, darkSecondary)).isWithin(0.05).of(5.13)
        assertThat(contrast(DarkMeeshyTokens.textMuted, darkTertiary)).isWithin(0.05).of(4.65)
    }

    @Test
    fun `the light step is tight - a hundredth less alpha would fail the tertiary plane`() {
        // iOS D-18 bis: 0.79 fails backgroundTertiary at 4.496:1, 0.80 passes at 4.60:1.
        val belowTheStep = MeeshyPalette.Indigo700.copy(alpha = 0.79f)
        assertThat(contrast(belowTheStep, LightMeeshyTokens.backgroundTertiary)).isLessThan(aaNormalText)
    }

    @Test
    fun `the former pre-AA values fail - the test can go red`() {
        val formerLightSecondary = Color(0x994338CA)
        val formerLightMuted = Color(0x666366F1)
        val formerDarkMuted = Color(0x80818CF8)
        assertThat(contrast(formerLightSecondary, LightMeeshyTokens.backgroundSecondary)).isLessThan(aaNormalText)
        assertThat(contrast(formerLightMuted, LightMeeshyTokens.backgroundSecondary)).isLessThan(aaNormalText)
        assertThat(contrast(formerDarkMuted, DarkMeeshyTokens.backgroundSecondary)).isLessThan(aaNormalText)
    }

    // MARK: - Inline entities and error ink

    @Test
    fun `mention and hashtag tints pass AA on the primary and secondary plane of their scheme`() {
        listOf(
            LightMeeshyTokens.mention to lightPlanes(),
            LightMeeshyTokens.hashtag to lightPlanes(),
            DarkMeeshyTokens.mention to darkPlanes(),
            DarkMeeshyTokens.hashtag to darkPlanes(),
        ).forEach { (ink, planes) ->
            listOf("backgroundPrimary", "backgroundSecondary").forEach { name ->
                assertWithMessage("$ink on $name").that(contrast(ink, planes.getValue(name))).isAtLeast(aaNormalText)
            }
        }
    }

    @Test
    fun `the soft error red fails the 3 to 1 of an icon on white - which is why error ink exists`() {
        assertThat(contrast(MeeshyPalette.Error, Color.White)).isLessThan(3.0)
        assertThat(contrast(MeeshyPalette.ErrorInk, Color.White)).isAtLeast(aaNormalText)
    }

    @Test
    fun `error ink passes AA on every light plane and the soft red on every dark plane`() {
        lightPlanes().forEach { (name, plane) ->
            assertWithMessage("light errorInk on $name").that(contrast(LightMeeshyTokens.errorInk, plane)).isAtLeast(aaNormalText)
        }
        darkPlanes().forEach { (name, plane) ->
            assertWithMessage("dark errorInk on $name").that(contrast(DarkMeeshyTokens.errorInk, plane)).isAtLeast(aaNormalText)
        }
    }
}
