package me.meeshy.app.stories

import me.meeshy.sdk.model.scene.StoryCanvasTransform

/** A rectangle in tile pixels; a plain value so the geometry below is provable on a bare JVM. */
internal data class ThumbRect(val left: Float, val top: Float, val right: Float, val bottom: Float) {
    val width: Float get() = right - left
    val height: Float get() = bottom - top
}

/** The pan/zoom of a slide's background as the tile keeps it: offsets are FRACTIONS of the canvas, so they follow the tile's size. */
internal data class ThumbFraming(val scale: Float = 1f, val offsetXFraction: Float = 0f, val offsetYFraction: Float = 0f) {
    companion object {
        val IDENTITY = ThumbFraming()

        /**
         * The composer stores its offsets in pixels of the stage it was measured on ([canvasWidthPx], 9:16). Not measured yet
         * (0): the pan is dropped rather than guessed, the zoom stays.
         */
        fun of(transform: StoryCanvasTransform, canvasWidthPx: Float): ThumbFraming {
            if (transform.isIdentity) return IDENTITY
            val canvasHeightPx = canvasWidthPx * 16f / 9f
            val measured = canvasWidthPx > 0f && canvasWidthPx.isFinite()
            return ThumbFraming(
                scale = transform.scale,
                offsetXFraction = if (measured) transform.offsetX / canvasWidthPx else 0f,
                offsetYFraction = if (measured) transform.offsetY / canvasHeightPx else 0f,
            )
        }
    }
}

/** Where the scene's pixels land in the tile: the composer canvas laws (crop or contain, then scale about the centre, then pan). */
internal object SlideThumbnailGeometry {

    fun imageRect(imageWidth: Int, imageHeight: Int, tileWidth: Float, tileHeight: Float, filled: Boolean, framing: ThumbFraming): ThumbRect {
        if (imageWidth <= 0 || imageHeight <= 0) return ThumbRect(0f, 0f, tileWidth, tileHeight)
        val ratio = tileWidth / imageWidth to tileHeight / imageHeight
        val fit = if (filled) maxOf(ratio.first, ratio.second) else minOf(ratio.first, ratio.second)
        val drawnW = imageWidth * fit * framing.scale
        val drawnH = imageHeight * fit * framing.scale
        val centreX = tileWidth / 2f + framing.offsetXFraction * tileWidth
        val centreY = tileHeight / 2f + framing.offsetYFraction * tileHeight
        return ThumbRect(centreX - drawnW / 2f, centreY - drawnH / 2f, centreX + drawnW / 2f, centreY + drawnH / 2f)
    }

    /** Left edge of each line of a text block centred on [centreX]: lines align inside the block, start/end flip for right-to-left text. */
    fun lineLefts(lineWidths: List<Float>, align: StoryTextAlign, rtl: Boolean, centreX: Float): List<Float> {
        val block = lineWidths.maxOrNull() ?: return emptyList()
        val effective = when {
            !rtl -> align
            align == StoryTextAlign.LEFT -> StoryTextAlign.RIGHT
            align == StoryTextAlign.RIGHT -> StoryTextAlign.LEFT
            else -> align
        }
        val blockLeft = centreX - block / 2f
        return lineWidths.map { width ->
            when (effective) {
                StoryTextAlign.LEFT -> blockLeft
                StoryTextAlign.CENTER -> centreX - width / 2f
                StoryTextAlign.RIGHT -> blockLeft + block - width
            }
        }
    }

    /** The typeface a style draws in, as plain tokens: the renderer maps them onto `android.graphics.Typeface`. */
    fun typefaceOf(style: StoryTextStyle): ThumbTypeface = style.typography().let {
        ThumbTypeface(it.family, bold = it.fontWeight >= BOLD_FROM_WEIGHT, italic = it.italic, letterSpacingEm = it.letterSpacingEm)
    }

    private const val BOLD_FROM_WEIGHT = 600
}

internal data class ThumbTypeface(val family: StoryTextFontFamily, val bold: Boolean, val italic: Boolean, val letterSpacingEm: Float)
