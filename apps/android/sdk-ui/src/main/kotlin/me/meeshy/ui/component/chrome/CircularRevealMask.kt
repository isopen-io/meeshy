package me.meeshy.ui.component.chrome

import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.graphicsLayer
import me.meeshy.sdk.model.chrome.RevealGeometry
import me.meeshy.sdk.model.chrome.UnitCenter

/**
 * Le devoilement circulaire des Reels (iOS `ReelsRevealMaskModifier`) : le contenu vivant est
 * masque par un disque ne en [center] (fraction du cadre), de rayon [progress] x le coin le plus
 * eloigne. [progress] est lu dans la PHASE DE DESSIN : l'animation ne recompose rien. Sous
 * « Reduire les animations », aucun cercle — un fondu. A pleine progression, aucun masque n'est
 * pose (une surface video masquee se figerait sur son poster).
 */
@Composable
public fun CircularRevealMask(
    progress: () -> Float,
    center: UnitCenter,
    reduceMotion: Boolean,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Box(modifier.circularReveal(progress, center, reduceMotion)) { content() }
}

public fun Modifier.circularReveal(progress: () -> Float, center: UnitCenter, reduceMotion: Boolean): Modifier =
    if (reduceMotion) {
        graphicsLayer { alpha = RevealGeometry.fadeAlpha(progress()) }
    } else {
        drawWithContent {
            val p = progress()
            if (RevealGeometry.isCovering(p)) {
                drawContent()
                return@drawWithContent
            }
            val origin = Offset(center.x * size.width, center.y * size.height)
            val max = RevealGeometry.maxRadius(origin.x, origin.y, size.width, size.height)
            val radius = RevealGeometry.radius(p, max)
            if (radius <= 0f) return@drawWithContent
            val disc = Path().apply { addOval(Rect(origin, radius)) }
            clipPath(disc) { this@drawWithContent.drawContent() }
        }
    }
