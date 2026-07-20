package me.meeshy.ui.theme

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.ui.graphics.Color

/**
 * Fully-specified Material3 [ColorScheme]s for the Meeshy brand.
 *
 * The parity plan's root finding (§1.1) is that raw Material components
 * (`Card`, `TopAppBar`, `NavigationBar`, sheets, chips) render lavender/grey
 * because the app previously set only a handful of roles — every unset role fell
 * back to Material's neutral baseline, and `surfaceTint` painted a grey tonal
 * overlay on every elevated surface.
 *
 * These schemes pin **every** surface/outline/container role to the Indigo scale
 * and set `surfaceTint = Transparent`, so a bare Material component is already
 * on-brand and flat. Depth is expressed by the glass surfaces (P0-4), never by a
 * grey elevation overlay.
 */

private val Transparent = Color(0x00000000)

// Dark elevation ramp — near-black → indigo950, never grey.
private val DarkContainerLowest = Color(0xFF09090B)
private val DarkContainerLow = Color(0xFF0E0C18)
private val DarkContainer = Color(0xFF13111C)
private val DarkContainerHigh = Color(0xFF191630)
private val DarkContainerHighest = Color(0xFF1E1B4B)

// Light elevation ramp — white → indigo50, never grey.
private val LightContainerLowest = Color(0xFFFFFFFF)
private val LightContainerLow = Color(0xFFFAF9FF)
private val LightContainer = Color(0xFFF8F7FF)
private val LightContainerHigh = Color(0xFFF2F1FF)
private val LightContainerHighest = Color(0xFFEEF2FF)

val MeeshyDarkColorScheme: ColorScheme = darkColorScheme(
    primary = MeeshyPalette.Indigo500,
    onPrimary = MeeshyPalette.White,
    primaryContainer = MeeshyPalette.Indigo700,
    onPrimaryContainer = MeeshyPalette.Indigo100,
    inversePrimary = MeeshyPalette.Indigo700,
    secondary = MeeshyPalette.Indigo400,
    onSecondary = MeeshyPalette.Indigo950,
    secondaryContainer = MeeshyPalette.Indigo900,
    onSecondaryContainer = MeeshyPalette.Indigo100,
    tertiary = MeeshyPalette.Purple600,
    onTertiary = MeeshyPalette.White,
    tertiaryContainer = MeeshyPalette.Purple700,
    onTertiaryContainer = MeeshyPalette.Indigo50,
    background = DarkMeeshyTokens.backgroundPrimary,
    onBackground = DarkMeeshyTokens.textPrimary,
    surface = DarkMeeshyTokens.backgroundSecondary,
    onSurface = DarkMeeshyTokens.textPrimary,
    surfaceVariant = DarkMeeshyTokens.backgroundTertiary,
    onSurfaceVariant = DarkMeeshyTokens.textSecondary,
    surfaceTint = Transparent,
    surfaceBright = DarkContainerHighest,
    surfaceDim = DarkContainerLowest,
    surfaceContainerLowest = DarkContainerLowest,
    surfaceContainerLow = DarkContainerLow,
    surfaceContainer = DarkContainer,
    surfaceContainerHigh = DarkContainerHigh,
    surfaceContainerHighest = DarkContainerHighest,
    inverseSurface = MeeshyPalette.Indigo50,
    inverseOnSurface = MeeshyPalette.Indigo950,
    outline = MeeshyPalette.Indigo800,
    outlineVariant = MeeshyPalette.Indigo900,
    error = MeeshyPalette.Error,
    onError = MeeshyPalette.Ink,
    errorContainer = MeeshyPalette.ErrorDark,
    onErrorContainer = MeeshyPalette.ErrorSoft,
    scrim = MeeshyPalette.Ink,
)

val MeeshyLightColorScheme: ColorScheme = lightColorScheme(
    primary = MeeshyPalette.Indigo500,
    onPrimary = MeeshyPalette.White,
    primaryContainer = MeeshyPalette.Indigo100,
    onPrimaryContainer = MeeshyPalette.Indigo900,
    inversePrimary = MeeshyPalette.Indigo300,
    secondary = MeeshyPalette.Indigo600,
    onSecondary = MeeshyPalette.White,
    secondaryContainer = MeeshyPalette.Indigo50,
    onSecondaryContainer = MeeshyPalette.Indigo900,
    tertiary = MeeshyPalette.Purple600,
    onTertiary = MeeshyPalette.White,
    tertiaryContainer = MeeshyPalette.Indigo100,
    onTertiaryContainer = MeeshyPalette.Indigo900,
    background = LightMeeshyTokens.backgroundPrimary,
    onBackground = LightMeeshyTokens.textPrimary,
    surface = LightMeeshyTokens.backgroundSecondary,
    onSurface = LightMeeshyTokens.textPrimary,
    surfaceVariant = LightMeeshyTokens.backgroundTertiary,
    onSurfaceVariant = MeeshyPalette.Indigo700,
    surfaceTint = Transparent,
    surfaceBright = LightContainerLowest,
    surfaceDim = LightContainerHighest,
    surfaceContainerLowest = LightContainerLowest,
    surfaceContainerLow = LightContainerLow,
    surfaceContainer = LightContainer,
    surfaceContainerHigh = LightContainerHigh,
    surfaceContainerHighest = LightContainerHighest,
    inverseSurface = MeeshyPalette.Indigo950,
    inverseOnSurface = MeeshyPalette.Indigo50,
    outline = MeeshyPalette.Indigo200,
    outlineVariant = MeeshyPalette.Indigo100,
    error = MeeshyPalette.Error,
    onError = MeeshyPalette.White,
    errorContainer = Color(0xFFFEE2E2),
    onErrorContainer = Color(0xFF7F1D1D),
    scrim = MeeshyPalette.Ink,
)
