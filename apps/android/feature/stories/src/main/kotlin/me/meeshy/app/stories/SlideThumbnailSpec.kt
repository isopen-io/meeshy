package me.meeshy.app.stories

import me.meeshy.sdk.media.previewModel
import me.meeshy.sdk.model.StoryDrawingStroke
import me.meeshy.sdk.model.composer.ComposerObjectKind
import me.meeshy.sdk.model.composer.scene.ComposerBackdropFraming
import me.meeshy.sdk.model.composer.scene.StoryBackdrop
import me.meeshy.sdk.model.composer.scene.StoryFitMode
import me.meeshy.sdk.model.scene.ForegroundMediaFrame
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
    /** The scene's objects in the ONE order of its stack (#13852, #13867): what is hidden in the scene is hidden in the tile. */
    val layers: List<Layer>,
    val strokes: List<StoryDrawingStroke>,
    /** The slide's filter as a colour matrix, `null` when it changes nothing — applied to the background media only, like the canvas. */
    val look: StoryColorMatrix? = null,
    val framing: ThumbFraming = ThumbFraming.IDENTITY,
    /** The media fills the tile (cropped); otherwise it is contained and the bands show [backdrop]. */
    val filled: Boolean = true,
    val backdrop: StoryBackdrop = StoryBackdrop.BLUR,
) {
    /** One object of the scene the tile paints, at its rank. */
    sealed interface Layer

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
    ) : Layer

    data class Sticker(val emoji: String, val sizeDesignPx: Float, val x: Float, val y: Float, val rotationDeg: Float) : Layer

    /** A media posed on the scene (#13867): its [key] in the fingerprint, its pose, and its measured ratio (`null`: a square, like the readers). */
    data class Media(val key: String, val x: Float, val y: Float, val scale: Float, val rotationDeg: Float, val aspectRatio: Double?) : Layer

    val texts: List<Text> get() = layers.filterIsInstance<Text>()
    val stickers: List<Sticker> get() = layers.filterIsInstance<Sticker>()

    /** Nothing posed: the tile shows the scene's own floor — its default gradient — never a black hole (#13867). */
    val isBlank: Boolean get() = backgroundKey == null && !hasBackgroundColor && layers.isEmpty() && strokes.isEmpty()

    companion object {
        private const val STICKER_BASE_DESIGN_PX = 140f

        fun of(
            slide: StorySlide,
            backgroundKey: String?,
            accentHex: String,
            widthPx: Int,
            heightPx: Int,
            canvasWidthPx: Float = 0f,
            placedMedia: List<ThumbnailPlaced> = emptyList(),
        ): SlideThumbnailSpec {
            val backgroundTransform = slide.frame.backgroundTransform()
            val texts = slide.elements.filter { it.isPublishable }.associateBy { it.id }
            val stickers = slide.stickers.filter { it.isPublishable }.associateBy { it.id }
            val media = placedMedia.associateBy { it.mediaId }
            return SlideThumbnailSpec(
                widthPx = widthPx,
                heightPx = heightPx,
                fill = StorySceneFill.resolve(slide.background, accentHex),
                hasBackgroundColor = slide.background != null,
                backgroundKey = backgroundKey,
                layers = StorySceneStack.order(slide).mapNotNull { ref ->
                    when (ref.kind) {
                        ComposerObjectKind.TEXT -> texts[ref.id]?.let {
                            Text(
                                it.text, it.color, it.size.designSize * it.scale, it.x, it.y, it.rotationDeg,
                                style = it.style, align = it.align, rtl = it.baseDirection == StoryTextDirection.RTL,
                            )
                        }
                        ComposerObjectKind.STICKER -> stickers[ref.id]?.let { Sticker(it.emoji, STICKER_BASE_DESIGN_PX * it.scale, it.x, it.y, it.rotationDeg) }
                        ComposerObjectKind.MEDIA -> media[ref.id]?.let { Media(it.key, it.x, it.y, it.scale, it.rotationDeg, it.aspectRatio) }
                        ComposerObjectKind.PLACE, ComposerObjectKind.AUDIO -> null
                    }
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

/** A media posed on a slide as the tile loads it (#13867): its identity, what the loader is handed, and its pose. */
internal class ThumbnailPlaced(
    val mediaId: String,
    val key: String,
    val model: Any,
    val x: Float,
    val y: Float,
    val scale: Float,
    val rotationDeg: Float,
    val aspectRatio: Double?,
)

/** The media posed on [slide] that the tile can load — an uploaded one by its url, a pending one by its local preview. */
internal fun StoryComposerUiState.thumbnailPlacedOf(slide: StorySlide, mediaBaseUrl: String?): List<ThumbnailPlaced> =
    slide.placedMedia.filter { it.mediaId in slide.mediaIds }.mapNotNull { placed ->
        val uploaded = attachments.firstOrNull { it.id == placed.mediaId }
        val source = when {
            uploaded != null -> {
                val video = uploaded.mimeType.startsWith("video", ignoreCase = true)
                val url = if (video) uploaded.thumbnailUrl?.let { ComposerMediaAddress.of(it, mediaBaseUrl) } else ComposerMediaAddress.preview(uploaded, mediaBaseUrl)
                url?.let { Triple(it, it as Any, ForegroundMediaFrame.measuredAspectRatio(uploaded.width, uploaded.height)) }
            }
            else -> pendingUploads.firstOrNull { it.cmid == placed.mediaId }?.item
                ?.takeUnless { it.mimeType.startsWith("video", ignoreCase = true) }
                ?.let { Triple("pending:${placed.mediaId}:${it.sizeBytes}", it.previewModel, null) }
        } ?: return@mapNotNull null
        ThumbnailPlaced(placed.id, source.first, source.second, placed.x, placed.y, placed.scale, placed.rotationDeg, source.third)
    }

/** The media painted behind [slide]: its designated background, else its first media not posed on the scene (#13853) — exactly what the scene canvas renders, a video by its picture (#13843). */
internal fun StoryComposerUiState.thumbnailBackgroundOf(slide: StorySlide, mediaBaseUrl: String?): ThumbnailBackground? {
    val posed = slide.placedMedia.mapTo(mutableSetOf()) { it.mediaId }
    val id = slide.backgroundMediaId?.takeIf { it in slide.mediaIds } ?: slide.mediaIds.firstOrNull { it !in posed } ?: return null
    attachments.firstOrNull { it.id == id }?.let { media ->
        return ThumbnailBackground(ComposerMediaAddress.preview(media, mediaBaseUrl), ComposerPicture.of(media, mediaBaseUrl))
    }
    val item = pendingUploads.firstOrNull { it.cmid == id }?.item ?: return null
    return ComposerPicture.of(item)?.let { ThumbnailBackground("pending:$id:${item.sizeBytes}", it) }
}

/** La couleur d'une vignette : le filtre de la scène, puis les réglages du fond quand il en porte (ce que le plateau peint, au flou et au grain près). */
private fun StorySlide.thumbnailLook(): StoryColorMatrix =
    backgroundAdjustments?.let { SceneLookMatrix.composed(SceneLookRecipe.forStory(filter, filterIntensity, it)) }
        ?: StoryFilterMatrix.effectiveMatrix(filter, filterIntensity)
