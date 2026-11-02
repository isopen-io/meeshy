package me.meeshy.ui.component.chrome

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Encre d'une icone ou d'un libelle pose sur du verre : blanc en sombre, indigo950 en clair
 * (le blanc seul est illisible sur un verre clair). Pendant iOS : `glassControlForeground()`.
 */
public fun glassControlForegroundColor(isDark: Boolean): Color =
    if (isDark) Color.White else MeeshyPalette.Indigo950

@Composable
public fun glassControlForeground(): Color = glassControlForegroundColor(MeeshyTheme.isDark)
