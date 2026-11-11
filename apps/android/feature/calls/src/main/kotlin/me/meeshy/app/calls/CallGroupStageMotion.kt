package me.meeshy.app.calls

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.movableContentOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.util.lerp
import me.meeshy.sdk.model.call.CallRemoteVideoFade
import me.meeshy.sdk.model.call.group.CallStageRect
import me.meeshy.sdk.model.call.group.GroupCallStageFocus
import me.meeshy.sdk.model.call.group.GroupCallStageGeometry
import me.meeshy.sdk.model.call.group.GroupCallStageTile
import org.webrtc.EglBase
import org.webrtc.VideoTrack

/**
 * P14.10 — le mouvement grille ↔ à la une. Chaque vignette garde UNE identité d'une disposition à l'autre : elle part de
 * la case où elle était ([from]) et grandit ou rétrécit jusqu'à la case où elle va ([to]), par transformation seule
 * (échelle, translation) et opacité — aucune mesure ne bouge pendant le geste. [progress] va de 0 à 1 ; une vignette sans
 * ancienne case (arrivée, ou cachée par le plein écran) fond depuis la transparence. « Réduire les animations » ne
 * déplace rien : un fondu court.
 */
internal class CallTileMotion(
    val from: CallStageRect?,
    val to: CallStageRect?,
    val progress: State<Float>,
    val reduceMotion: Boolean,
)

/** La transformation de départ rejouée vers l'identité : posée sur la vignette, elle suit aussi ses touchers. */
internal fun Modifier.callTileMotion(motion: CallTileMotion?): Modifier {
    if (motion == null) return this
    return graphicsLayer {
        val p = motion.progress.value
        if (p >= 1f) return@graphicsLayer
        val from = motion.from
        val to = motion.to
        if (motion.reduceMotion || from == null || to == null || to.width <= 0f || to.height <= 0f) {
            alpha = p
            return@graphicsLayer
        }
        transformOrigin = TransformOrigin(0f, 0f)
        scaleX = lerp(from.width / to.width, 1f, p)
        scaleY = lerp(from.height / to.height, 1f, p)
        translationX = lerp(from.left - to.left, 0f, p) * density
        translationY = lerp(from.top - to.top, 0f, p) * density
    }
}

/** Ce qui n'est pas une vignette (les commandes de la une) arrive en fondu, au rythme du mouvement. */
internal fun Modifier.callTileMotionFade(motion: CallTileMotion?): Modifier =
    if (motion == null) this else graphicsLayer { alpha = motion.progress.value }

private class StageMotionMemory(var layout: Pair<GroupCallStageFocus, Boolean>, var rects: Map<String, CallStageRect>) {
    var from: Map<String, CallStageRect> = emptyMap()
    var generation: Int = 0
}

/**
 * Retient la disposition précédente : quand la scène passe de la grille à la une (ou l'inverse, ou entre ou sort du plein
 * écran), chaque vignette reçoit sa case de départ et d'arrivée, et le mouvement repart de zéro dans la MÊME composition
 * — la première image est déjà à sa place de départ. Redimensionner la scène ne déclenche rien.
 */
@Composable
internal fun rememberCallStageMotion(
    tileIds: List<String>,
    focus: GroupCallStageFocus,
    isFullScreen: Boolean,
    width: Dp,
    height: Dp,
): (String) -> CallTileMotion? {
    val reduceMotion = rememberCallReduceMotion()
    val isRtl = LocalLayoutDirection.current == LayoutDirection.Rtl
    val rects = GroupCallStageGeometry.rects(tileIds, focus, width.value, height.value, isFullScreen, isRtl)
    val layout = focus to isFullScreen
    val memory = remember { StageMotionMemory(layout, rects) }
    if (memory.layout != layout) {
        memory.from = memory.rects
        memory.layout = layout
        memory.generation += 1
    }
    memory.rects = rects
    val generation = memory.generation
    val progress = remember(generation) { Animatable(if (generation == 0) 1f else 0f) }
    LaunchedEffect(generation) {
        if (generation == 0) return@LaunchedEffect
        val millis = if (reduceMotion) CallRemoteVideoFade.durationMillis(true) else STAGE_MOTION_MILLIS
        progress.animateTo(1f, tween(millis, easing = FastOutSlowInEasing))
    }
    val from = memory.from
    val state = progress.asState()
    return { id -> CallTileMotion(from = from[id], to = rects[id], progress = state, reduceMotion = reduceMotion) }
}

/** Tout ce que dessine une vignette : sa personne, sa vidéo et l'état de la scène qui la porte. */
internal data class CallGroupTileRender(
    val tile: GroupCallStageTile,
    val track: VideoTrack?,
    val eglContext: EglBase.Context,
    val mirror: Boolean,
    val fit: Boolean = false,
    val title: String? = null,
    val zoom: Float = 1f,
)

internal typealias CallGroupTileContent = @Composable (CallGroupTileRender, Modifier) -> Unit

/**
 * Une vignette = un contenu MOBILE par personne ([movableContentOf]) : de la grille à la une, du bandeau à la grille, elle
 * change de place sans quitter la composition — son rendu vidéo n'est ni détruit ni recréé à la bascule (plus d'écran
 * noir). Un membre parti perd son contenu.
 */
@Composable
internal fun rememberCallGroupTileContents(tileIds: List<String>): (String) -> CallGroupTileContent {
    val contents = remember { HashMap<String, CallGroupTileContent>() }
    SideEffect { contents.keys.retainAll(tileIds.toSet()) }
    return { id ->
        contents.getOrPut(id) {
            movableContentOf<CallGroupTileRender, Modifier> { render, tileModifier ->
                CallGroupTile(
                    tile = render.tile,
                    track = render.track,
                    eglContext = render.eglContext,
                    mirror = render.mirror,
                    modifier = tileModifier,
                    fit = render.fit,
                    title = render.title,
                    zoom = render.zoom,
                )
            }
        }
    }
}

private const val STAGE_MOTION_MILLIS = 350
