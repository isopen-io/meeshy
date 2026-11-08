package me.meeshy.ui.story.canvas

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableDoubleState
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.remember
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
    /** Faux : la slide est en pause (ou pas encore montrée) — l'ouverture n'avance pas. */
    val playing: Boolean = true,
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
 * image), la fermeture suit la tête de lecture [playbackSeconds]. « Réduire les animations » remplace tout effet par un
 * fondu simple.
 */
@Composable
public fun rememberSceneRootPose(spec: SceneRootTransitionSpec?, playbackSeconds: Double?): SceneRootPose {
    val reduce = LocalReduceMotion.current
    val elapsed = rememberOpeningElapsed(spec, reduce)
    if (spec == null) return SceneRootPose.NEUTRAL
    return SceneRootTransitionPose.poseAt(
        spec.opening, spec.closing, spec.totalDurationSeconds, elapsed.doubleValue, playbackSeconds ?: 0.0, reduce,
    )
}

/**
 * Le même effet, lu à la PEINTURE : la tête de lecture ([playbackSeconds]) change à chaque image, et la lire en
 * composition recomposerait toute la scène 60 fois par seconde. Ici seule la couche graphique est invalidée.
 */
@Composable
public fun Modifier.sceneRootTransition(spec: SceneRootTransitionSpec?, playbackSeconds: () -> Double): Modifier {
    if (spec == null) return this
    val reduce = LocalReduceMotion.current
    val elapsed = rememberOpeningElapsed(spec, reduce)
    return graphicsLayer {
        val pose = SceneRootTransitionPose.poseAt(
            spec.opening, spec.closing, spec.totalDurationSeconds, elapsed.doubleValue, playbackSeconds(), reduce,
        )
        if (pose.isNeutral) return@graphicsLayer
        alpha = pose.opacity.toFloat()
        scaleX = pose.scale.toFloat()
        scaleY = pose.scale.toFloat()
        translationX = (pose.translateXFraction * size.width).toFloat()
        val coverage = pose.revealCoverage
        shape = if (coverage == null) RectangleShape else SceneRevealShape(coverage)
        clip = coverage != null
    }
}

/** Le temps écoulé de l'ouverture : il avance image par image tant que la slide joue ([SceneRootTransitionSpec.playing]). */
@Composable
private fun rememberOpeningElapsed(spec: SceneRootTransitionSpec?, reduce: Boolean): MutableDoubleState {
    val elapsed = remember(spec?.restartKey, spec?.opening) { mutableDoubleStateOf(0.0) }
    val opening = spec?.opening
    val playing = spec?.playing ?: false
    LaunchedEffect(spec?.restartKey, opening, playing) {
        if (opening == null || !playing) return@LaunchedEffect
        var last = -1L
        while (elapsed.doubleValue < SceneRootTransitionPose.DURATION_SECONDS) {
            withFrameNanos { now ->
                if (last >= 0) elapsed.doubleValue += (now - last) / NANOS_PER_SECOND
                last = now
            }
        }
    }
    return elapsed
}

private const val NANOS_PER_SECOND: Double = 1_000_000_000.0
