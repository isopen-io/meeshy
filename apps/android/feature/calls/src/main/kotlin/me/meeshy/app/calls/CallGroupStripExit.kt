package me.meeshy.app.calls

import android.view.View
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.State
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import me.meeshy.sdk.model.call.CallRemoteVideoFade
import me.meeshy.sdk.model.call.group.CallStageRect
import me.meeshy.sdk.model.call.group.GroupCallFilmstrip
import me.meeshy.sdk.model.call.group.GroupCallStageGeometry

/**
 * U2.10 — la sortie du bandeau des autres quand la une prend tout l'écran : il sort par SON bord de l'écran (le bas en
 * portrait, le côté en paysage) jusqu'au bord MESURÉ de la fenêtre ([GroupCallStageGeometry.stripTravel]), en fondu, et
 * y revient par le même chemin. Seules la transformation et l'opacité bougent, lues à la composition de la couche :
 * aucune mesure ne bouge pendant le geste. « Réduire les animations » le remplace par un fondu court. Le mouvement est
 * interruptible : un aller-retour repart d'où le bandeau est, jamais d'un saut.
 */
internal class CallStripExit(
    /** 0 = le bandeau est en place, 1 = il est sorti de l'écran. */
    val progress: State<Float>,
    private val stage: MutableState<Rect>,
    private val view: View,
    private val edge: GroupCallFilmstrip,
    private val extent: Dp,
    private val isRtl: Boolean,
    private val slides: Boolean,
) {
    /** À poser sur la scène : sa position dans la fenêtre dit de combien le bandeau doit voyager. */
    fun measuring(): Modifier = Modifier.onGloballyPositioned { stage.value = it.boundsInWindow() }

    /** À poser sur le bandeau : il glisse vers son bord et s'efface à mesure que [progress] monte. */
    fun sliding(): Modifier = Modifier.graphicsLayer {
        val out = progress.value
        alpha = 1f - out
        if (!slides) return@graphicsLayer
        val bounds = stage.value
        val travel = GroupCallStageGeometry.stripTravel(
            edge = edge,
            stage = CallStageRect(bounds.left, bounds.top, bounds.width, bounds.height),
            windowWidth = view.rootView.width.toFloat(),
            windowHeight = view.rootView.height.toFloat(),
            stripExtent = extent.toPx(),
            isRtl = isRtl,
        )
        translationX = travel.dx * out
        translationY = travel.dy * out
    }
}

/** Le bandeau [edge], épais de [extent], dehors quand [isFullScreen] ; la progression suit la bascule. */
@Composable
internal fun rememberCallStripExit(isFullScreen: Boolean, edge: GroupCallFilmstrip, extent: Dp): CallStripExit {
    val reduceMotion = rememberCallReduceMotion()
    val isRtl = LocalLayoutDirection.current == LayoutDirection.Rtl
    val view = LocalView.current
    val progress = remember { Animatable(if (isFullScreen) 1f else 0f) }
    LaunchedEffect(isFullScreen, reduceMotion) {
        val millis = if (reduceMotion) CallRemoteVideoFade.durationMillis(true) else STAGE_MOTION_MILLIS
        progress.animateTo(if (isFullScreen) 1f else 0f, tween(millis, easing = FastOutSlowInEasing))
    }
    val stage = remember { mutableStateOf(Rect.Zero) }
    return remember(edge, extent, isRtl, reduceMotion, view) {
        CallStripExit(progress.asState(), stage, view, edge, extent, isRtl, slides = !reduceMotion)
    }
}
