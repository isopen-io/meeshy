package me.meeshy.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

/** Semantic theme tokens beyond the Material3 ColorScheme (dark/light parity with iOS). */
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
)

val LightMeeshyTokens = MeeshyThemeTokens(
    backgroundPrimary = Color(0xFFFFFFFF),
    backgroundSecondary = Color(0xFFF8F7FF),
    backgroundTertiary = Color(0xFFEEF2FF),
    textPrimary = Color(0xFF1E1B4B),
    textSecondary = Color(0x994338CA),
    textMuted = Color(0x666366F1),
    inputBackground = Color(0xFFF5F3FF),
    inputBorder = Color(0xFFC7D2FE),
    success = MeeshyPalette.Success,
    error = MeeshyPalette.Error,
    warning = MeeshyPalette.Warning,
    info = MeeshyPalette.Info,
)

val DarkMeeshyTokens = MeeshyThemeTokens(
    backgroundPrimary = Color(0xFF09090B),
    backgroundSecondary = Color(0xFF13111C),
    backgroundTertiary = Color(0xFF1E1B4B),
    textPrimary = Color(0xFFEEF2FF),
    textSecondary = Color(0xFFA5B4FC),
    textMuted = Color(0x80818CF8),
    inputBackground = Color(0xFF16142A),
    inputBorder = Color(0x99312E81),
    success = MeeshyPalette.Success,
    error = MeeshyPalette.Error,
    warning = MeeshyPalette.Warning,
    info = MeeshyPalette.Info,
)

val LocalMeeshyTokens = staticCompositionLocalOf { LightMeeshyTokens }
