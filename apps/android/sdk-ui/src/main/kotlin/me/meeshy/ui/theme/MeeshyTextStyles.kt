package me.meeshy.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit

/**
 * The family of iOS's default design (SF Pro) and of its rounded design (SF Pro
 * Rounded). Android has no SF; both resolve to the one brand family, Nunito
 * (`apps/android/decisions.md`, ADR-025). Two names keep the seam: if the product
 * ever wants a neutral body face next to the rounded titles, only [DefaultDesignFontFamily]
 * changes — no call site does.
 */
private val DefaultDesignFontFamily: FontFamily = NunitoFontFamily
private val RoundedDesignFontFamily: FontFamily = NunitoFontFamily

/**
 * Text that follows the system font size — the port of iOS `MeeshyFont.relative`
 * (Dynamic Type-aware replacement of `.system(size:weight:design:)`).
 *
 * [size] is in `sp`, so the text grows and shrinks with the user's font size setting
 * (Settings → Display → Font size), the Android counterpart of Dynamic Type. Pass a
 * [MeeshyFontSize] token rather than a literal. [rounded] is iOS's `design: .rounded`.
 *
 * Use [emojiTextStyle] — never this — for a lone emoji that must hold an exact size.
 */
public fun meeshyText(
    size: TextUnit,
    weight: FontWeight = FontWeight.Normal,
    rounded: Boolean = false,
): TextStyle = TextStyle(
    fontFamily = if (rounded) RoundedDesignFontFamily else DefaultDesignFontFamily,
    fontSize = size,
    fontWeight = weight,
)

/**
 * A lone emoji at the EXACT size asked, whatever the system font size — the port of
 * iOS `MeeshyFont.emoji` (#9054).
 *
 * A lone emoji is already a giant display (90 / 60 / 45 dp); scaling it again by the
 * font-size setting would make a 90 dp emoji fill the bubble at 2× font. The `sp` size
 * is derived from [size] through [density] so that it renders as exactly [size] dp:
 * `Dp.toSp()` divides by the font scale that the text renderer multiplies back.
 * No font family is set, so the glyphs come from the system emoji font.
 */
public fun emojiTextStyle(size: Dp, density: Density): TextStyle =
    TextStyle(fontSize = with(density) { size.toSp() })

/** [emojiTextStyle] for the current composition's density and font scale. */
@Composable
public fun emojiTextStyle(size: Dp): TextStyle {
    val density = LocalDensity.current
    return remember(size, density) { emojiTextStyle(size, density) }
}
