package me.meeshy.ui.theme

import androidx.compose.ui.graphics.Color

/**
 * Theme-aware text, plane and veil tokens as pure functions of `isDark` — the port of the static
 * mirrors of `ThemeManager` in iOS `MeeshyColors.swift` ("Theme-Aware Text & Surface Tokens",
 * "Inline Entity Tints", "Voiles adaptatifs").
 *
 * They exist for the leaf views that receive `isDark: Boolean` as a primitive (the Zero Unnecessary
 * Re-render rule: no observed singleton in a list cell). [LightMeeshyTokens] and [DarkMeeshyTokens]
 * DELEGATE here — the values live nowhere else, as on iOS where `ThemeManager` delegates to
 * `MeeshyColors`.
 *
 * The secondary and muted text are measured against AA (4.5:1, WCAG, alpha composited THEN
 * luminance) on the two declared planes the text meets most often — `backgroundSecondary` and
 * `backgroundTertiary` — in both schemes, by `MeeshyContrastTest`.
 */
object MeeshyAdaptiveColors {

    fun textPrimary(isDark: Boolean): Color =
        if (isDark) MeeshyPalette.Indigo50 else MeeshyPalette.Indigo950

    /**
     * iOS D-18 bis (#5625): the former LIGHT variant, `indigo700 @ 60 %`, measured 2.7-3.1:1 — under
     * AA on every declared light plane. Raised to `indigo700 @ 80 %`, the minimal step that passes
     * both the lightest and the darkest declared light planes (79 % fails `backgroundTertiary` at
     * 4.496:1): 4.76:1 on `#F8F7FF`, 4.60:1 on `#EEF2FF`. The dark variant (`indigo300`, opaque)
     * was never at fault.
     */
    fun textSecondary(isDark: Boolean): Color =
        if (isDark) MeeshyPalette.Indigo300 else MeeshyPalette.Indigo700.copy(alpha = 0.8f)

    /**
     * iOS D-18: `indigo500 @ 40 %` / `indigo400 @ 50 %` measured 1.67:1 in light and 2.46:1 in dark.
     * Darkened/opacified to the minimal step that passes, in the SAME indigo family (never a neutral
     * grey): `indigo700 @ 80 %` in light, `indigo300 @ 70 %` in dark (5.15:1 on `#13111C`, 4.67:1
     * on `#1E1B4B` — the lightest declared dark plane, hence the worst case for light text). The
     * two jetons share one light colour; they keep distinct ROLES (secondary text vs discreet meta).
     */
    fun textMuted(isDark: Boolean): Color =
        if (isDark) MeeshyPalette.Indigo300.copy(alpha = 0.7f) else MeeshyPalette.Indigo700.copy(alpha = 0.8f)

    /** Primary app plane — the white/black flat screens lay their content on. */
    fun backgroundPrimary(isDark: Boolean): Color =
        if (isDark) MeeshyPalette.SurfaceDarkBase else MeeshyPalette.White

    fun backgroundSecondary(isDark: Boolean): Color =
        if (isDark) MeeshyPalette.SurfaceDarkRaised else MeeshyPalette.SurfaceLightRaised

    fun backgroundTertiary(isDark: Boolean): Color =
        if (isDark) MeeshyPalette.Indigo950 else MeeshyPalette.Indigo50

    fun inputBackground(isDark: Boolean): Color =
        if (isDark) MeeshyPalette.SurfaceDarkInput else MeeshyPalette.SurfaceLightInput

    fun inputBorder(isDark: Boolean): Color =
        if (isDark) MeeshyPalette.Indigo900.copy(alpha = 0.6f) else MeeshyPalette.Indigo200

    /**
     * The alert red as ink on the plane of the scheme: [MeeshyPalette.ErrorInk] on light (the soft
     * `Error` holds only 2.77:1 on white), [MeeshyPalette.Error] on dark.
     */
    fun errorInk(isDark: Boolean): Color =
        if (isDark) MeeshyPalette.Error else MeeshyPalette.ErrorInk

    /**
     * Tint of an `@mention` — tappable link, the more pronounced of the two. Light: `indigo600`
     * (6.3:1 on `#FFFFFF`); dark: `indigo300` (10.0:1 on `#09090B`). The former single tint
     * (`indigo400`) held only 2.98:1 on white.
     */
    fun mentionColor(isDark: Boolean): Color =
        if (isDark) MeeshyPalette.Indigo300 else MeeshyPalette.Indigo600

    /**
     * Tint of a `#hashtag` — decorative (not tappable), one step quieter than the mention to stay
     * distinguishable from it AND from the accent link, without leaving the indigo ramp. Light:
     * `indigo800` (9.9:1 on `#FFFFFF`); dark: `indigo400` (6.7:1 on `#09090B`).
     */
    fun hashtagColor(isDark: Boolean): Color =
        if (isDark) MeeshyPalette.Indigo400 else MeeshyPalette.Indigo800

    /** Soft fill of a card or a row (iOS `surfaceFill`). */
    fun surfaceFill(isDark: Boolean): Color =
        if (isDark) Color.White.copy(alpha = 0.06f) else Color.Black.copy(alpha = 0.04f)

    /** Fill of a control (iOS `controlFill`). */
    fun controlFill(isDark: Boolean): Color =
        if (isDark) Color.White.copy(alpha = 0.1f) else Color.Black.copy(alpha = 0.05f)

    /** Hairline between two planes (iOS `hairline`). */
    fun hairline(isDark: Boolean): Color =
        if (isDark) Color.White.copy(alpha = 0.08f) else Color.Black.copy(alpha = 0.05f)
}
