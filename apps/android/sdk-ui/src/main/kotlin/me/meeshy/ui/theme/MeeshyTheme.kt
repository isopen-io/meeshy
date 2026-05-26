package me.meeshy.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider

@Composable
fun MeeshyTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val tokens = if (darkTheme) DarkMeeshyTokens else LightMeeshyTokens
    val colorScheme = if (darkTheme) {
        darkColorScheme(
            primary = MeeshyPalette.Indigo500,
            onPrimary = MeeshyPalette.White,
            secondary = MeeshyPalette.Indigo400,
            background = tokens.backgroundPrimary,
            onBackground = tokens.textPrimary,
            surface = tokens.backgroundSecondary,
            onSurface = tokens.textPrimary,
            error = MeeshyPalette.Error,
        )
    } else {
        lightColorScheme(
            primary = MeeshyPalette.Indigo500,
            onPrimary = MeeshyPalette.White,
            secondary = MeeshyPalette.Indigo600,
            background = tokens.backgroundPrimary,
            onBackground = tokens.textPrimary,
            surface = tokens.backgroundSecondary,
            onSurface = tokens.textPrimary,
            error = MeeshyPalette.Error,
        )
    }

    CompositionLocalProvider(LocalMeeshyTokens provides tokens) {
        MaterialTheme(colorScheme = colorScheme, content = content)
    }
}

/** Accessor for Meeshy semantic tokens — `MeeshyTheme.tokens.textMuted`. */
object MeeshyTheme {
    val tokens: MeeshyThemeTokens
        @Composable get() = LocalMeeshyTokens.current
}
