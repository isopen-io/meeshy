package me.meeshy.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider

@Composable
fun MeeshyTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val tokens = if (darkTheme) DarkMeeshyTokens else LightMeeshyTokens
    val colorScheme = if (darkTheme) MeeshyDarkColorScheme else MeeshyLightColorScheme

    CompositionLocalProvider(LocalMeeshyTokens provides tokens) {
        MaterialTheme(colorScheme = colorScheme, content = content)
    }
}

/** Accessor for Meeshy semantic tokens — `MeeshyTheme.tokens.textMuted`. */
object MeeshyTheme {
    val tokens: MeeshyThemeTokens
        @Composable get() = LocalMeeshyTokens.current
}
