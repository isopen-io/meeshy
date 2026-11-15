package me.meeshy.ui.theme

import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color

/**
 * Chrome laid over a full-screen media — port of the iOS "Chrome posé sur un média" blocks of
 * `MeeshyColors.swift` (#8878, #8879), derived to `packages/design-tokens/ios.css`
 * (`--ios-on-media*`, `--ios-media-*`, `--ios-scrim*`, `--ios-on-brand`).
 *
 * A full-screen viewer (comment image, conversation media, story, reel) is ALWAYS dark whatever the
 * scheme: its controls are white on a black veil. The scale is named here, CLOSED, so that no view
 * keeps a `Color.White.copy(alpha = 0.85f)` literal of its own.
 */
object MeeshyMediaChromeColors {
    /** Ink of a control or a text laid over a media. */
    val OnMedia = Color(0xFFFFFFFF)

    /** Secondary text over a media (timestamp, subtitle). */
    val OnMediaSecondary = OnMedia.copy(alpha = 0.85f)

    /** Discreet text over a media (counter, meta). */
    val OnMediaMuted = OnMedia.copy(alpha = 0.7f)

    /** Fill of a button or a chip laid over a media. */
    val MediaFill = OnMedia.copy(alpha = 0.15f)

    /** Hairline of a control laid over a media. */
    val MediaHairline = OnMedia.copy(alpha = 0.2f)

    /** Background of a full-screen viewer. */
    val MediaBackdrop = Color(0xFF000000)

    /** Light veil: gradient under the chrome, disc behind an icon. */
    val ScrimSoft = MediaBackdrop.copy(alpha = 0.3f)

    /** Regular veil: under a text laid over a media. */
    val Scrim = MediaBackdrop.copy(alpha = 0.5f)

    /** Strong veil: what darkens a media behind a sheet. */
    val ScrimStrong = MediaBackdrop.copy(alpha = 0.7f)

    /** Ink laid over a FLAT brand or conversation-accent fill: the white of solid buttons. */
    val OnBrand = Color(0xFFFFFFFF)

    // The iOS view names (`mediaChrome*`), aliases of the scale above: one value per color.
    val ChromeForeground = OnMedia
    val ChromeSecondary = OnMediaSecondary
    val ChromeTertiary = OnMediaMuted
    val ChromeFill = MediaBackdrop.copy(alpha = 0.35f)
    val ChromeScrim = Scrim

    /** Top veil: 55 % black fading to transparent downwards. */
    val ScrimTopStops = listOf(MediaBackdrop.copy(alpha = 0.55f), MediaBackdrop.copy(alpha = 0f))

    /** Bottom veil: transparent fading to 55 % black downwards. */
    val ScrimBottomStops = listOf(MediaBackdrop.copy(alpha = 0f), MediaBackdrop.copy(alpha = 0.55f))

    val ScrimTop: Brush = Brush.verticalGradient(ScrimTopStops)
    val ScrimBottom: Brush = Brush.verticalGradient(ScrimBottomStops)
}
