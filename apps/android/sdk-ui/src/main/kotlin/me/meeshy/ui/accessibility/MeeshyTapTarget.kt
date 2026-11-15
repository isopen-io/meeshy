package me.meeshy.ui.accessibility

import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.layout
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.accessibility.TapTargetGeometry

public val MeeshyMinTapTarget: Dp = TapTargetGeometry.MIN_DP.dp

/**
 * Garde le glyphe à sa taille de dessin et agrandit la zone sensible à [minSize] (48 dp) :
 * le contenu est centré dans une boîte au moins aussi grande, que les gestes parents mesurent.
 */
public fun Modifier.meeshyTapTarget(minSize: Dp = MeeshyMinTapTarget): Modifier =
    layout { measurable, constraints ->
        val placeable = measurable.measure(constraints)
        val minPx = minSize.roundToPx()
        val width = maxOf(placeable.width, minPx).coerceAtMost(constraints.maxWidth)
        val height = maxOf(placeable.height, minPx).coerceAtMost(constraints.maxHeight)
        layout(width, height) {
            placeable.placeRelative((width - placeable.width) / 2, (height - placeable.height) / 2)
        }
    }

/** Masque un élément purement décoratif (halo, anneau) de l'arbre d'accessibilité. */
public fun Modifier.decorative(): Modifier = clearAndSetSemantics { }
