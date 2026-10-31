package me.meeshy.app.stories

import java.io.File
import me.meeshy.sdk.media.scene.SceneExportPlacedVideo
import me.meeshy.sdk.media.scene.SceneExportPlacement
import me.meeshy.sdk.model.scene.ForegroundMediaFrame
import me.meeshy.sdk.model.scene.SceneLookMatrix
import me.meeshy.sdk.model.scene.StoryColorMatrix
import me.meeshy.sdk.model.scene.export.StoryExportPlacedVideoClock
import me.meeshy.sdk.model.scene.export.StoryExportVideoFormat

/**
 * Un étage de la scène à peindre : les objets d'entre deux vidéos posées ([depth] : 0 sous la première, `n` au-dessus de
 * la n-ième), en une slide qui ne porte qu'eux. Le fond n'est que sous la première ; le dessin et la légende, au-dessus de
 * la dernière.
 */
internal data class StoryExportBand(val slide: StorySlideView, val depth: Int, val withBackground: Boolean)

/**
 * **LES VIDÉOS POSÉES S'EXPORTENT VIVANTES, À LEUR PLACE DANS LA PILE** (#13897) : le peintre des calques ne tient d'une
 * vidéo posée que son affiche (et rien quand elle n'en a pas, comme le brouillon du S8). Chaque vidéo posée devient donc un
 * calque vivant du moteur ([SceneExportPlacedVideo]), et les objets se peignent en étages entre elles — ce qui est sous
 * une vidéo reste sous elle, ce qui est au-dessus reste au-dessus, dans l'ordre de `StorySceneLayerOrder`, celui d'iOS.
 * Une slide sans vidéo posée se peint d'un seul étage, comme avant.
 */
internal object StoryExportPlacedVideos {

    /** Les vidéos posées de [slide], de la plus basse à la plus haute. */
    fun videosOf(slide: StorySlideView): List<StoryForegroundMediaView> =
        StorySceneLayerOrder.order(slide).mapNotNull { (it as? StorySceneLayer.Media)?.view?.takeIf(StoryForegroundMediaView::isVideo) }

    /** Les étages à peindre ; un étage d'au-dessus qui n'a rien ne se peint pas. */
    fun bands(slide: StorySlideView, withBackground: Boolean): List<StoryExportBand> {
        val order = StorySceneLayerOrder.order(slide)
        val separators = order.indices.filter { (order[it] as? StorySceneLayer.Media)?.view?.isVideo == true }
        if (separators.isEmpty()) return listOf(StoryExportBand(slide, 0, withBackground))
        val bounds = listOf(-1) + separators + order.size
        return bounds.zipWithNext().mapIndexedNotNull { depth, (from, to) ->
            val layers = order.subList(from + 1, to)
            val top = depth == separators.size
            val hasContent = layers.isNotEmpty() || (top && (slide.strokes.isNotEmpty() || slide.text.isNotBlank()))
            if (depth > 0 && !hasContent) return@mapIndexedNotNull null
            StoryExportBand(only(slide, layers, top), depth, withBackground && depth == 0)
        }
    }

    /**
     * La vidéo posée [view] de la slide qui commence à [slideStartMillis] (timeline de l'export) et dure [slideMillis] : son
     * fichier, son horloge, son look et sa pose à chaque instant, ceux que le lecteur peint (`StoryForegroundLayer`).
     * `null` : rien à poser (hors de sa slide, fichier sans durée).
     */
    fun placed(
        view: StoryForegroundMediaView,
        depth: Int,
        file: File,
        clipMillis: Long,
        slideStartMillis: Long,
        slideMillis: Long,
        format: StoryExportVideoFormat,
    ): SceneExportPlacedVideo? {
        val clock = StoryExportPlacedVideoClock.of(
            slideStartMillis, slideMillis, view.startTime, view.duration,
            view.sourceWindow?.startMs, view.sourceWindow?.endMs, clipMillis,
        ) ?: return null
        return SceneExportPlacedVideo(file, clock, depth, colorMatrix(view)) { at -> placement(view, (at - slideStartMillis) / MILLIS_PER_SECOND, format) }
    }

    /** La pose de [view] à [seconds] de sa slide, en pixels du format ; `null` hors de sa fenêtre de temps. */
    fun placement(view: StoryForegroundMediaView, seconds: Float, format: StoryExportVideoFormat): SceneExportPlacement? {
        if (!view.isVisible(seconds)) return null
        val animated = view.animated(seconds)
        val size = ForegroundMediaFrame.renderedSize(animated.aspectRatio, animated.scale.coerceIn(MIN_SCALE, MAX_SCALE), format.width.toDouble())
        val width = size.width.toFloat()
        val height = size.height.toFloat()
        return SceneExportPlacement(
            centerX = (format.width * animated.x).toFloat(),
            centerY = (format.height * animated.y).toFloat(),
            width = width,
            height = height,
            rotationDegrees = view.rotation.toFloat(),
            opacity = animated.opacity.toFloat().coerceIn(0f, 1f),
            cornerRadius = minOf(width, height) * FOREGROUND_CORNER_FRACTION,
        )
    }

    private fun colorMatrix(view: StoryForegroundMediaView): FloatArray? {
        if (view.lookRecipe.isNeutral) return null
        return SceneLookMatrix.composed(view.lookRecipe).takeIf { it != StoryColorMatrix.IDENTITY }?.values?.toFloatArray()
    }

    private fun only(slide: StorySlideView, layers: List<StorySceneLayer>, top: Boolean): StorySlideView = slide.copy(
        textObjects = layers.mapNotNull { (it as? StorySceneLayer.Text)?.view },
        foregroundMedia = layers.mapNotNull { (it as? StorySceneLayer.Media)?.view },
        stickers = layers.mapNotNull { (it as? StorySceneLayer.Sticker)?.view },
        places = layers.mapNotNull { (it as? StorySceneLayer.Place)?.view },
        audioChips = layers.mapNotNull { (it as? StorySceneLayer.Audio)?.view },
        strokes = if (top) slide.strokes else emptyList(),
        text = if (top) slide.text else "",
    )

    private const val MILLIS_PER_SECOND = 1000f
    private const val MIN_SCALE = 0.2
    private const val MAX_SCALE = 3.0
}
