package me.meeshy.app.stories

import me.meeshy.sdk.model.StoryMediaCrop
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.composer.look.ComposerCropPreset
import me.meeshy.sdk.model.scene.StoryBackgroundObjectTransform
import me.meeshy.sdk.model.scene.StoryCanvasTransform

/** Les proportions que réalise le recadrage du fond peint : « Original » sans recadrage, `null` pour un cadre libre ou une source non mesurée. */
internal val StoryComposerUiState.backgroundCropPreset: ComposerCropPreset?
    get() {
        val crop = paintedBackgroundSetting.crop ?: return ComposerCropPreset.ORIGINAL
        val id = selectedSlideBackdropMediaId ?: return null
        val (width, height) = placedSourceSizeOf(id) ?: return null
        return ComposerCropPreset.matching((crop.width * width) / (crop.height * height), width, height)
    }

/** Les proportions de la source du fond peint, largeur / hauteur ; `null` tant qu'elle n'est pas mesurée. */
internal val StoryComposerUiState.backgroundSourceAspect: Double?
    get() = selectedSlideBackdropMediaId?.let(::placedSourceSizeOf)?.let { (width, height) -> width / height }

/** Ce que le calque du fond applique sur la scène : l'agrandissement par axe et le déplacement, en pixels. */
internal data class BackgroundLayer(val scaleX: Float, val scaleY: Float, val translationX: Float, val translationY: Float)

/**
 * Le calque du fond peint par la scène du compositeur : le geste de l'auteur ([StoryCanvasTransform]) puis le recadrage
 * [crop] d'une source de proportions [sourceAspect], [filled] ou ajustée, composés comme le lecteur les compose
 * ([StoryBackgroundObjectTransform.from]) — la scène montre ce que la lecture montrera (loi 6).
 */
internal fun StoryCanvasTransform.backgroundLayer(
    crop: StoryMediaCrop?,
    sourceAspect: Double?,
    filled: Boolean,
    canvasWidthPx: Float,
    canvasHeightPx: Float,
): BackgroundLayer {
    val framed = crop?.let { StoryBackgroundObjectTransform.from(StoryMediaObject(id = "", crop = it), sourceAspect, filled) }
        ?: StoryBackgroundObjectTransform.IDENTITY
    return BackgroundLayer(
        scaleX = scale * framed.scaleX,
        scaleY = scale * framed.scaleY,
        translationX = offsetX + framed.offsetXFraction * canvasWidthPx,
        translationY = offsetY + framed.offsetYFraction * canvasHeightPx,
    )
}
