package me.meeshy.ui.component.chrome

import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.chrome.FloatingChromeLateralReserve

/**
 * Écarte une rangée des disques flottants parqués à sa hauteur (#12497, #13299) : du côté d'un disque dont la
 * bande verticale touche la rangée, elle cède la largeur du disque ([FloatingChromeLateralReserve]) — avatar,
 * heure, vignette et interrupteur restent visibles et touchables, les disques restent en place.
 *
 * À poser en tête de chaîne sur la rangée (ou l'en-tête de section) : la mesure se fait sur la rangée entière.
 * L'état n'est écrit que lorsque la marge change, jamais à chaque image du défilement.
 */
@Composable
public fun Modifier.floatingChromeLateralReserve(): Modifier {
    val bands = LocalFloatingChromeReserve.current.bands
    val currentBands by rememberUpdatedState(bands)
    val density = LocalDensity.current.density
    val rtl = LocalLayoutDirection.current == LayoutDirection.Rtl
    var span by remember { mutableStateOf<Pair<Float, Float>?>(null) }
    val insets = span
        ?.let { (top, bottom) -> FloatingChromeLateralReserve.insets(bands, top, bottom) }
        ?: FloatingChromeLateralReserve.Insets.None
    return this
        .onGloballyPositioned { coordinates ->
            val top = coordinates.positionInWindow().y / density
            val next = top to top + coordinates.size.height / density
            val before = span
            val touchedBefore = before?.let { FloatingChromeLateralReserve.insets(currentBands, it.first, it.second) }
            if (before == null || touchedBefore != FloatingChromeLateralReserve.insets(currentBands, next.first, next.second)) {
                span = next
            }
        }
        .padding(
            start = (if (rtl) insets.trailing else insets.leading).dp,
            end = (if (rtl) insets.leading else insets.trailing).dp,
        )
}
