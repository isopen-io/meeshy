package me.meeshy.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

/**
 * Semantic theme tokens beyond the Material3 ColorScheme (dark/light parity with iOS).
 *
 * Every value is the projection of a [MeeshyAdaptiveColors] function: the pure functions are the
 * single source, exactly like iOS `ThemeManager` delegating to `MeeshyColors`.
 */
@Immutable
data class MeeshyThemeTokens(
    val backgroundPrimary: Color,
    val backgroundSecondary: Color,
    val backgroundTertiary: Color,
    val textPrimary: Color,
    val textSecondary: Color,
    val textMuted: Color,
    val inputBackground: Color,
    val inputBorder: Color,
    val success: Color,
    val error: Color,
    val warning: Color,
    val info: Color,
    /** The alert red as ink on this scheme's planes — AA text/icon on light, the soft red on dark. */
    val errorInk: Color,
    /** `@mention` link tint, AA on this scheme's primary plane. */
    val mention: Color,
    /** `#hashtag` tint, AA on this scheme's primary plane. */
    val hashtag: Color,
    val surfaceFill: Color,
    val controlFill: Color,
    val hairline: Color,
)

private fun meeshyTokens(isDark: Boolean) = MeeshyThemeTokens(
    backgroundPrimary = MeeshyAdaptiveColors.backgroundPrimary(isDark),
    backgroundSecondary = MeeshyAdaptiveColors.backgroundSecondary(isDark),
    backgroundTertiary = MeeshyAdaptiveColors.backgroundTertiary(isDark),
    textPrimary = MeeshyAdaptiveColors.textPrimary(isDark),
    textSecondary = MeeshyAdaptiveColors.textSecondary(isDark),
    textMuted = MeeshyAdaptiveColors.textMuted(isDark),
    inputBackground = MeeshyAdaptiveColors.inputBackground(isDark),
    inputBorder = MeeshyAdaptiveColors.inputBorder(isDark),
    success = MeeshyPalette.Success,
    error = MeeshyPalette.Error,
    warning = MeeshyPalette.Warning,
    info = MeeshyPalette.Info,
    errorInk = MeeshyAdaptiveColors.errorInk(isDark),
    mention = MeeshyAdaptiveColors.mentionColor(isDark),
    hashtag = MeeshyAdaptiveColors.hashtagColor(isDark),
    surfaceFill = MeeshyAdaptiveColors.surfaceFill(isDark),
    controlFill = MeeshyAdaptiveColors.controlFill(isDark),
    hairline = MeeshyAdaptiveColors.hairline(isDark),
)

val LightMeeshyTokens = meeshyTokens(isDark = false)

val DarkMeeshyTokens = meeshyTokens(isDark = true)

val LocalMeeshyTokens = staticCompositionLocalOf { LightMeeshyTokens }
