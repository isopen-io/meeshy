package me.meeshy.app.stories

import me.meeshy.sdk.model.StoryDrawingStroke

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
) {
    data class Text(val text: String, val colorHex: String, val fontDesignPx: Float, val x: Float, val y: Float, val rotationDeg: Float)

    data class Sticker(val emoji: String, val sizeDesignPx: Float, val x: Float, val y: Float, val rotationDeg: Float)

    /** Nothing to show: the tile paints black, the drawn EMPTY state (iOS #5037), not a gradient pretending a scene. */
    val isBlank: Boolean get() = backgroundKey == null && !hasBackgroundColor && texts.isEmpty() && stickers.isEmpty() && strokes.isEmpty()

    companion object {
        private const val STICKER_BASE_DESIGN_PX = 140f

        fun of(slide: StorySlide, backgroundKey: String?, accentHex: String, widthPx: Int, heightPx: Int): SlideThumbnailSpec =
            SlideThumbnailSpec(
                widthPx = widthPx,
                heightPx = heightPx,
                fill = StorySceneFill.resolve(slide.background, accentHex),
                hasBackgroundColor = slide.background != null,
                backgroundKey = backgroundKey,
                texts = slide.elements.filter { it.isPublishable }.map {
                    Text(it.text, it.color, it.size.designSize * it.scale, it.x, it.y, it.rotationDeg)
                },
                stickers = slide.stickers.filter { it.isPublishable }.map {
                    Sticker(it.emoji, STICKER_BASE_DESIGN_PX * it.scale, it.x, it.y, it.rotationDeg)
                },
                strokes = slide.strokes,
            )
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
internal fun StoryComposerUiState.thumbnailBackgroundOf(slide: StorySlide): ThumbnailBackground? {
    val id = slide.backgroundMediaId?.takeIf { it in slide.mediaIds } ?: slide.mediaIds.firstOrNull() ?: return null
    attachments.firstOrNull { it.id == id }?.let { media ->
        val url = media.thumbnailUrl ?: media.url
        return ThumbnailBackground(url, url)
    }
    val bytes = pendingUploads.firstOrNull { it.cmid == id }?.item?.bytes ?: return null
    return ThumbnailBackground("pending:$id:${bytes.size}", bytes)
}
