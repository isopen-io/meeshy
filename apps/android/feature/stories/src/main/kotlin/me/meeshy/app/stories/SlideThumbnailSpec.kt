package me.meeshy.app.stories

import me.meeshy.sdk.media.previewModel
import me.meeshy.sdk.model.StoryDrawingStroke
import me.meeshy.sdk.model.composer.scene.ComposerBackdropFraming
import me.meeshy.sdk.model.composer.scene.StoryBackdrop
import me.meeshy.sdk.model.composer.scene.StoryFitMode
import me.meeshy.sdk.model.scene.SceneLookMatrix
import me.meeshy.sdk.model.scene.SceneLookRecipe
import me.meeshy.sdk.model.scene.StoryColorMatrix
import me.meeshy.sdk.model.scene.StoryFilterMatrix
import me.meeshy.sdk.model.scene.StoryTextDirection

/**
 * Everything that decides what a slide's tile looks like, as a VALUE: two equal specs paint the same bitmap, so equality is
 * the cache key and the "has the scene changed" test in one (iOS `SceneThumbnailFingerprint`). The background media rides as
 * its [backgroundKey] (url or an instance tag), never as bytes — hashing a photo per frame is what this avoids.
 */
internal data class SlideThumbnailSpec(
    val widthPx: Int,
    val heightPx: Int,
    val fill: StorySceneFill,
    val hasBackgroundColor: Boolean,
    val backgroundKey: String?,
    val texts: List<Text>,
    val stickers: List<Sticker>,
    val strokes: List<StoryDrawingStroke>,
    /** The slide's filter as a colour matrix, `null` when it changes nothing — applied to the background media only, like the canvas. */
    val look: StoryColorMatrix? = null,
    val framing: ThumbFraming = ThumbFraming.IDENTITY,
    /** The media fills the tile (cropped); otherwise it is contained and the bands show [backdrop]. */
    val filled: Boolean = true,
    val backdrop: StoryBackdrop = StoryBackdrop.BLUR,
) {
    data class Text(
        val text: String,
        val colorHex: String,
        val fontDesignPx: Float,
        val x: Float,
        val y: Float,
        val rotationDeg: Float,
        val style: StoryTextStyle = StoryTextStyle.BOLD,
        val align: StoryTextAlign = StoryTextAlign.CENTER,
        val rtl: Boolean = false,
    )

    data class Sticker(val emoji: String, val sizeDesignPx: Float, val x: Float, val y: Float, val rotationDeg: Float)

    /** Nothing to show: the tile paints black, the drawn EMPTY state (iOS #5037), not a gradient pretending a scene. */
    val isBlank: Boolean get() = backgroundKey == null && !hasBackgroundColor && texts.isEmpty() && stickers.isEmpty() && strokes.isEmpty()

    companion object {
        private const val STICKER_BASE_DESIGN_PX = 140f

        fun of(
            slide: StorySlide,
            backgroundKey: String?,
            accentHex: String,
            widthPx: Int,
            heightPx: Int,
            canvasWidthPx: Float = 0f,
        ): SlideThumbnailSpec {
            val backgroundTransform = slide.frame.backgroundTransform()
            return SlideThumbnailSpec(
                widthPx = widthPx,
                heightPx = heightPx,
                fill = StorySceneFill.resolve(slide.background, accentHex),
                hasBackgroundColor = slide.background != null,
                backgroundKey = backgroundKey,
                texts = slide.elements.filter { it.isPublishable }.map {
                    Text(
                        it.text, it.color, it.size.designSize * it.scale, it.x, it.y, it.rotationDeg,
                        style = it.style, align = it.align, rtl = it.baseDirection == StoryTextDirection.RTL,
                    )
                },
                stickers = slide.stickers.filter { it.isPublishable }.map {
                    Sticker(it.emoji, STICKER_BASE_DESIGN_PX * it.scale, it.x, it.y, it.rotationDeg)
                },
                strokes = slide.strokes,
                look = slide.thumbnailLook().takeUnless { it == StoryColorMatrix.IDENTITY },
                framing = ThumbFraming.of(slide.transform, canvasWidthPx),
                filled = StoryFitMode.rendersFilled(ComposerBackdropFraming.fitMode(backgroundTransform)),
                backdrop = ComposerBackdropFraming.backdrop(backgroundTransform),
            )
        }
    }
}

/** When to repaint a tile (iOS `ComposerSceneThumbnailRefresh`): never make the author wait for a first image, never repaint per frame of a gesture. */
internal object SlideThumbnailRefresh {
    const val DEBOUNCE_MILLIS: Long = 150L

    fun waits(isShowingImage: Boolean, isCached: Boolean, isBlank: Boolean): Boolean = isShowingImage && !isCached && !isBlank
}

/** The background media of a slide as the tile loads it: [key] is its identity in the fingerprint, [model] what the image loader is handed. */
internal class ThumbnailBackground(val key: String, val model: Any)

/** The media painted behind [slide]: its designated background, else its first media — exactly what the scene canvas renders. */
internal fun StoryComposerUiState.thumbnailBackgroundOf(slide: StorySlide, mediaBaseUrl: String?): ThumbnailBackground? {
    val id = slide.backgroundMediaId?.takeIf { it in slide.mediaIds } ?: slide.mediaIds.firstOrNull() ?: return null
    attachments.firstOrNull { it.id == id }?.let { media ->
        val url = ComposerMediaAddress.preview(media, mediaBaseUrl)
        return ThumbnailBackground(url, url)
    }
    val item = pendingUploads.firstOrNull { it.cmid == id }?.item ?: return null
    return ThumbnailBackground("pending:$id:${item.sizeBytes}", item.previewModel)
}

/** La couleur d'une vignette : le filtre de la scène, puis les réglages du fond quand il en porte (ce que le plateau peint, au flou et au grain près). */
private fun StorySlide.thumbnailLook(): StoryColorMatrix =
    backgroundAdjustments?.let { SceneLookMatrix.composed(SceneLookRecipe.forStory(filter, filterIntensity, it)) }
        ?: StoryFilterMatrix.effectiveMatrix(filter, filterIntensity)
