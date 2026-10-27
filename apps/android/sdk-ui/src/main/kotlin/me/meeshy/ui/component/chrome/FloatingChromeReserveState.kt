package me.meeshy.ui.component.chrome

import androidx.compose.runtime.Composable
import androidx.compose.runtime.ProvidableCompositionLocal
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * La marge de fin de contenu que les disques flottants réservent ([me.meeshy.sdk.model.chrome.FloatingChromeReserve]).
 * Le conteneur des disques l'écrit ; chaque écran racine la LIT dans son propre scope — l'objet est
 * tenu une seule fois, hors du graphe de navigation, donc un disque qui bouge ne reconstruit que
 * les listes qui en dépendent.
 */
@Stable
public class FloatingChromeReserveState {
    public var bottom: Dp by mutableStateOf(0.dp)
        internal set

    internal fun publish(value: Dp) {
        if (bottom != value) bottom = value
    }
}

public val LocalFloatingChromeReserve: ProvidableCompositionLocal<FloatingChromeReserveState> =
    staticCompositionLocalOf { FloatingChromeReserveState() }

/** La marge de fin à poser sous le contenu d'un écran qui montre les disques flottants. */
@Composable
public fun floatingChromeBottomReserve(): Dp = LocalFloatingChromeReserve.current.bottom
