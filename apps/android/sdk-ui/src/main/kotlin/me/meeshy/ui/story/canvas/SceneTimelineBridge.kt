package me.meeshy.ui.story.canvas

import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.graphicsLayer
import me.meeshy.sdk.model.scene.PreviewVideoCommand
import me.meeshy.sdk.model.scene.SceneRenderMode
import me.meeshy.sdk.model.scene.SceneRootPose
import me.meeshy.sdk.model.scene.ScenePreviewPolicy

/**
 * Le pont entre le canvas du composer et la frise de montage (iOS `StoryCanvasTimelineBridge`, #8370) : la frise pousse la
 * tête de lecture (scrub ou tick du moteur) et l'état du transport ; le canvas, lui, relit ces valeurs À LA PEINTURE et rend
 * la slide à cet instant avec la sémantique lecture. L'audio vient du moteur de frise, les players du canvas sont muets ; à
 * l'arrêt un objet hors fenêtre est fantôme à 0,25, caché en lecture ; les gestes d'édition restent intacts.
 */
@Stable
public class SceneTimelineBridge {
    /** La tête de lecture en secondes ; `null` : pas d'aperçu, le canvas est celui de l'édition nominale. */
    public var previewSeconds: Double? by mutableStateOf(null)
        private set

    private var playingState: Boolean by mutableStateOf(false)

    public val playing: Boolean get() = playingState

    public val isActive: Boolean get() = previewSeconds != null

    private var commandedPlaying: Boolean = false

    /** Entre en aperçu ou déplace la tête (jamais négative). */
    public fun scrub(seconds: Double) {
        previewSeconds = seconds.coerceAtLeast(0.0)
    }

    /** Suit le transport de la frise ; sans aperçu actif, rien ne change. */
    public fun setPlaying(isPlaying: Boolean) {
        if (!isActive || playing == isPlaying) return
        playingState = isPlaying
    }

    /** Quitte l'aperçu : le canvas redevient celui de l'édition (tout visible, son d'édition). */
    public fun end() {
        previewSeconds = null
        playingState = false
        commandedPlaying = false
    }

    /** `PLAY` pendant l'aperçu pour que fenêtres, keyframes et transitions s'appliquent ; `EDIT` sinon. */
    public val renderMode: SceneRenderMode get() = ScenePreviewPolicy.renderMode(editing = true, previewActive = isActive)

    /** Le mute effectif de chaque player du canvas : le moteur de frise possède l'audio pendant l'aperçu. */
    public fun audioMuted(authorMuted: Boolean): Boolean = ScenePreviewPolicy.audioMuted(authorMuted, isActive)

    /** L'opacité d'un objet de fenêtre [startSeconds]..[endSeconds] à la tête courante : 1, fantôme 0,25 ou caché. */
    public fun objectOpacity(startSeconds: Double, endSeconds: Double?): Double =
        ScenePreviewPolicy.objectOpacity(isActive, playing, previewSeconds ?: 0.0, startSeconds, endSeconds)

    /** Le geste à faire à un lecteur vidéo pour la tête [playheadMs] ; mémorise l'état de transport déjà commandé. */
    public fun videoCommand(playheadMs: Long): PreviewVideoCommand {
        val command = ScenePreviewPolicy.videoCommand(playing, commandedPlaying, playheadMs)
        commandedPlaying = playing
        return command
    }
}

/** Applique une pose racine lue à la PEINTURE : la répétition échantillonne à chaque image sans recomposer la scène. */
public fun Modifier.sceneRootPoseLayer(pose: () -> SceneRootPose): Modifier = graphicsLayer {
    val current = pose()
    if (current.isNeutral) return@graphicsLayer
    alpha = current.opacity.toFloat()
    scaleX = current.scale.toFloat()
    scaleY = current.scale.toFloat()
    translationX = (current.translateXFraction * size.width).toFloat()
    val coverage = current.revealCoverage
    shape = if (coverage == null) RectangleShape else SceneRevealShape(coverage)
    clip = coverage != null
    transformOrigin = androidx.compose.ui.graphics.TransformOrigin.Center
}
