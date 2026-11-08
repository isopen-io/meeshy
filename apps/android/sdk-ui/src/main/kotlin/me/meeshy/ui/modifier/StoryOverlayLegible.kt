package me.meeshy.ui.modifier

import androidx.compose.ui.Modifier
import androidx.compose.ui.text.TextStyle
import me.meeshy.sdk.model.theme.ChromeScheme
import me.meeshy.ui.component.chrome.legibilityHalo
import me.meeshy.ui.component.chrome.legibilityHaloShadow

/**
 * La lisibilité d'un texte ou d'une icône FLOTTANT sur une scène : un halo à DEUX ombres (le rayonnement
 * large du glyphe nu, puis l'ombre serrée du texte), jamais une boîte opaque ni un voile global. La polarité
 * suit le [scheme] du fond, pas le thème de l'app.
 */
public fun Modifier.storyOverlayLegible(scheme: ChromeScheme): Modifier = legibilityHalo(scheme)

/** L'ombre serrée d'un texte flottant : la seconde moitié du halo, portée par le style lui-même. */
public fun TextStyle.storyOverlayLegible(scheme: ChromeScheme): TextStyle = merge(TextStyle(shadow = legibilityHaloShadow(scheme)))
