package me.meeshy.ui.story.canvas

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import me.meeshy.sdk.model.StoryTransitionEffect
import me.meeshy.sdk.model.scene.SceneRootPose
import me.meeshy.sdk.model.scene.SceneRootTransitionPose
import me.meeshy.ui.accessibility.LocalReduceMotion

/**
 * Les effets d'ouverture et de fermeture d'une slide (iOS `applyOpening` / `applyClosing`). [totalDurationSeconds] est
 * la durée effective de la slide ; [restartKey] relance l'ouverture (nouvelle slide, nouveau tour).
 */
public data class SceneRootTransitionSpec(
    val opening: StoryTransitionEffect? = null,
    val closing: StoryTransitionEffect? = null,
    val totalDurationSeconds: Double = 0.0,
    val restartKey: Any? = null,
)

/** Le masque circulaire de la révélation : rayon d'un point à la demi-diagonale, centré sur le canvas. */
public class SceneRevealShape(private val coverage: Double) : Shape {
    override fun createOutline(size: Size, layoutDirection: LayoutDirection, density: Density): Outline {
        val radius = SceneRootTransitionPose.revealRadius(coverage, size.width.toDouble(), size.height.toDouble()).toFloat()
        val center = Offset(size.width / 2f, size.height / 2f)
        return Outline.Generic(Path().apply { addOval(Rect(center, radius)) })
    }
}

/** Applique une pose racine : opacité, échelle, glissement et masque. La pose neutre ne coûte aucune couche. */
public fun Modifier.sceneRootTransition(pose: SceneRootPose): Modifier =
    if (pose.isNeutral) this else graphicsLayer {
        alpha = pose.opacity.toFloat()
        scaleX = pose.scale.toFloat()
        scaleY = pose.scale.toFloat()
        translationX = (pose.translateXFraction * size.width).toFloat()
        val coverage = pose.revealCoverage
        shape = if (coverage == null) RectangleShape else SceneRevealShape(coverage)
        clip = coverage != null
    }

/**
 * La pose courante : l'ouverture s'anime seule depuis l'entrée en lecture (temps écoulé échantillonné à chaque
 * image), la fermeture suit la tête de lecture [playbackSeconds]. « Réduire les animations » ne garde aucune transition.
 */
@Composable
public fun rememberSceneRootPose(spec: SceneRootTransitionSpec?, playbackSeconds: Double?): SceneRootPose {
    val reduce = LocalReduceMotion.current
    var openingElapsed by remember(spec?.restartKey, spec?.opening) { mutableDoubleStateOf(0.0) }
    val opening = spec?.opening
    LaunchedEffect(spec?.restartKey, opening, reduce) {
        if (opening == null || reduce) return@LaunchedEffect
        var start = -1L
        while (openingElapsed < SceneRootTransitionPose.DURATION_SECONDS) {
            withFrameNanos { now ->
                if (start < 0) start = now
                openingElapsed = (now - start) / NANOS_PER_SECOND
            }
        }
    }
    if (spec == null || reduce) return SceneRootPose.NEUTRAL
    val closing = SceneRootTransitionPose.closing(spec.closing, spec.totalDurationSeconds, playbackSeconds ?: 0.0)
    return if (!closing.isNeutral) closing else SceneRootTransitionPose.opening(opening, openingElapsed)
}

private const val NANOS_PER_SECOND: Double = 1_000_000_000.0
