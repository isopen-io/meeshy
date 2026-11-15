package me.meeshy.ui.component.kit

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.EaseInOut
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import me.meeshy.ui.accessibility.LocalReduceMotion

/** Le bord d'où une pièce du cadre entre : l'en-tête par le haut, la plaque par le bas. */
internal enum class MeeshyModeEdge(val direction: Int) {
    Top(-1),
    Bottom(1),
}

/**
 * **L'entrée et le retrait d'une pièce du cadre** : l'en-tête entre par le haut, la plaque par le bas (translation de
 * 12 et opacité, 250 ms ; sortie 200 ms). Rangée, la pièce est RETIRÉE de l'arbre : ni visible, ni touchable, ni lue.
 * « Réduire les animations » : un fondu de 150 ms, sans déplacement.
 *
 * Seules la translation et l'opacité s'animent ; jamais le flou, ni la hauteur. Pendant iOS : `MeeshyModePresence`.
 */
@Composable
internal fun MeeshyModePresence(
    presence: MeeshyModeChromePresence,
    edge: MeeshyModeEdge,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val reduceMotion = LocalReduceMotion.current
    val density = LocalDensity.current
    val motion = remember(reduceMotion) { MeeshyModeChromeRecipe.motion(reduceMotion) }
    val travelPx = remember(motion, density) { with(density) { motion.travelDp.dp.roundToPx() } * edge.direction }
    val enter = remember(motion, travelPx) {
        val fade = fadeIn(tween(motion.enterMillis, easing = EaseInOut))
        if (motion.isFadeOnly) fade else fade + slideInVertically(tween(motion.enterMillis, easing = EaseInOut)) { travelPx }
    }
    val exit = remember(motion, travelPx) {
        val fade = fadeOut(tween(motion.exitMillis, easing = EaseInOut))
        if (motion.isFadeOnly) fade else fade + slideOutVertically(tween(motion.exitMillis, easing = EaseInOut)) { travelPx }
    }
    AnimatedVisibility(
        visible = !presence.isStowed,
        modifier = modifier,
        enter = enter,
        exit = exit,
    ) {
        content()
    }
}
