package me.meeshy.ui.component.chrome

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.findRootCoordinates
import androidx.compose.ui.layout.layout
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.constrainWidth
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.offset
import me.meeshy.sdk.model.chrome.FloatingChromeLateralReserve

/** La place d'une rangée dans la fenêtre, en dp, côtés LOGIQUES. */
@Immutable
private data class RowSpan(val top: Float, val bottom: Float, val startGap: Float, val endGap: Float)

/**
 * Écarte une rangée des disques flottants parqués à sa hauteur (#12497, #13299) : du côté d'un disque dont la
 * bande verticale touche la rangée, elle cède la largeur du disque ([FloatingChromeLateralReserve]) — avatar,
 * heure, vignette et interrupteur restent visibles et touchables, les disques restent en place.
 *
 * À poser en tête de chaîne sur la rangée (ou l'en-tête de section) : la mesure se fait sur la rangée entière.
 * La marge est un état DÉRIVÉ lu à la MISE EN PAGE : le défilement ne recompose aucune rangée, et une rangée
 * n'est remesurée que lorsque SA marge change (rangée qui entre ou sort de la bande, disque déplacé).
 */
@Composable
public fun Modifier.floatingChromeLateralReserve(): Modifier {
    val reserve = LocalFloatingChromeReserve.current
    val rtl = LocalLayoutDirection.current == LayoutDirection.Rtl
    val density = LocalDensity.current.density
    val span = remember { mutableStateOf<RowSpan?>(null) }
    val insets = remember(reserve) {
        derivedStateOf {
            span.value?.let { FloatingChromeLateralReserve.insets(reserve.bands, it.top, it.bottom, it.startGap, it.endGap) }
                ?: FloatingChromeLateralReserve.Insets.None
        }
    }
    return this
        .onGloballyPositioned { coordinates ->
            val rootWidth = coordinates.findRootCoordinates().size.width.toFloat()
            val origin = coordinates.positionInWindow()
            val left = origin.x / density
            val right = (rootWidth - origin.x - coordinates.size.width) / density
            val top = origin.y / density
            val next = RowSpan(
                top = top,
                bottom = top + coordinates.size.height / density,
                startGap = if (rtl) right else left,
                endGap = if (rtl) left else right,
            )
            if (span.value != next) span.value = next
        }
        .layout { measurable, constraints ->
            val current = insets.value
            val start = current.leading.dp.roundToPx()
            val end = current.trailing.dp.roundToPx()
            val placeable = measurable.measure(constraints.offset(horizontal = -(start + end)))
            layout(constraints.constrainWidth(placeable.width + start + end), placeable.height) {
                placeable.placeRelative(start, 0)
            }
        }
}
