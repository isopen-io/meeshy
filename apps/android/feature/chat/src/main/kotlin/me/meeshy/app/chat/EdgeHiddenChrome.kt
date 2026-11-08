package me.meeshy.app.chat

import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import me.meeshy.sdk.model.reading.focal.FocalMetrics
import me.meeshy.ui.accessibility.LocalReduceMotion

internal enum class ChromeEdge { Top, Bottom }

/**
 * Escamotage d'un composant de chrome vers SON bord (iOS `EdgeHiddenChrome`) : il glisse de
 * [FocalMetrics.HiddenChrome.EDGE_TRAVEL] dp vers le bord (haut pour l'en-tête, bas pour la barre
 * de saisie) en se fondant, et revient d'une seule animation symétrique. Jamais un démontage :
 * la taille mesurée ne bouge pas. Touches coupées tant qu'il est masqué ; avec « Réduire les
 * animations », le fondu seul.
 */
internal object EdgeHiddenChrome {
    const val DURATION_MS: Int = 250

    fun offsetDp(isHidden: Boolean, edge: ChromeEdge): Float {
        if (!isHidden) return 0f
        val travel = FocalMetrics.HiddenChrome.EDGE_TRAVEL.toFloat()
        return if (edge == ChromeEdge.Top) -travel else travel
    }

    fun opacity(isHidden: Boolean): Float = if (isHidden) FocalMetrics.HiddenChrome.OPACITY_END.toFloat() else 1f

    fun allowsHitTesting(isHidden: Boolean): Boolean = !isHidden
}

@Composable
internal fun Modifier.hiddenTowardsEdge(isHidden: Boolean, edge: ChromeEdge): Modifier {
    val reduceMotion = LocalReduceMotion.current
    val progress by animateFloatAsState(
        targetValue = if (isHidden) 1f else 0f,
        animationSpec = tween(EdgeHiddenChrome.DURATION_MS, easing = LinearOutSlowInEasing),
        label = "edge-hidden-chrome",
    )
    val travelDp = EdgeHiddenChrome.offsetDp(isHidden = true, edge = edge)
    val endOpacity = EdgeHiddenChrome.opacity(isHidden = true)
    val layered = graphicsLayer {
        translationY = if (reduceMotion) 0f else travelDp * density * progress
        alpha = 1f - progress * (1f - endOpacity)
    }
    if (EdgeHiddenChrome.allowsHitTesting(isHidden)) return layered
    return layered.pointerInput(Unit) {
        awaitPointerEventScope {
            while (true) {
                awaitPointerEvent(PointerEventPass.Initial).changes.forEach { it.consume() }
            }
        }
    }
}
