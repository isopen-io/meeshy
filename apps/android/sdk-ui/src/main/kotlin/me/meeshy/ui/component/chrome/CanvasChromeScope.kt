package me.meeshy.ui.component.chrome

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ProvidableCompositionLocal
import androidx.compose.runtime.staticCompositionLocalOf
import me.meeshy.sdk.model.theme.ChromeScheme
import me.meeshy.ui.theme.DarkMeeshyTokens
import me.meeshy.ui.theme.LightMeeshyTokens
import me.meeshy.ui.theme.LocalMeeshyTokens

/** Le schéma épinglé sur le chrome posé sur un canevas ; `null` hors d'un [CanvasChromeScope]. */
public val LocalCanvasChromeScheme: ProvidableCompositionLocal<ChromeScheme?> = staticCompositionLocalOf { null }

/**
 * Épingle le [scheme] sur toute une grappe de contrôles posée SUR le canevas d'une story : les
 * teintes adaptatives (encre, verre) suivent le FOND de la slide, jamais le thème de l'app —
 * l'équivalent de `.environment(\.colorScheme, …)` côté iOS. [ChromeScheme.Dark] = chrome blanc.
 */
@Composable
public fun CanvasChromeScope(scheme: ChromeScheme, content: @Composable () -> Unit) {
    val tokens = if (scheme == ChromeScheme.Dark) DarkMeeshyTokens else LightMeeshyTokens
    CompositionLocalProvider(
        LocalMeeshyTokens provides tokens,
        LocalCanvasChromeScheme provides scheme,
        content = content,
    )
}
