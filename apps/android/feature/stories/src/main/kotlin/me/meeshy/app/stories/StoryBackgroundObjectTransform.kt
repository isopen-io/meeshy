package me.meeshy.app.stories

import me.meeshy.sdk.model.StoryMediaObject

/**
 * The render-ready framing of a background media object, projected once from the
 * background [StoryMediaObject]'s own transform fields.
 *
 * iOS frames a background image by aspect-filling the 9:16 canvas as a base, then
 * applying the background object's `scale`/`x`/`y`/`rotation` on TOP of that fill,
 * clipped to the canvas — an Instagram-style "zoom inside the background". It is the
 * SAME fields a foreground object carries, but converted differently: `x`/`y` become
 * a pixel offset FROM CENTRE (`(x - 0.5) * renderSize`), never an anchor/position,
 * and `anchor`/`aspectRatio` are ignored for a background (source of truth:
 * `StoryCanvasUIView+Rendering.swift` render conversion). This value carries that
 * projection so the viewer glue stays a straight `graphicsLayer` and the conversion
 * is unit-tested in one place.
 *
 * [offsetXFraction]/[offsetYFraction] are the offset as a FRACTION of the canvas
 * width/height (`x - 0.5`, `y - 0.5`); the viewer multiplies by its measured canvas
 * size at render time, so the value itself is resolution-independent.
 */
data class StoryBackgroundObjectTransform(
    val scale: Float,
    val offsetXFraction: Float,
    val offsetYFraction: Float,
    val rotationDegrees: Float,
) {
    /** At rest — the background aspect-fills the frame with no extra framing. */
    val isIdentity: Boolean
        get() = scale == 1f && offsetXFraction == 0f && offsetYFraction == 0f && rotationDegrees == 0f

    companion object {
        /** No extra framing — a plain aspect-fill. */
        val IDENTITY: StoryBackgroundObjectTransform = StoryBackgroundObjectTransform(
            scale = 1f,
            offsetXFraction = 0f,
            offsetYFraction = 0f,
            rotationDegrees = 0f,
        )

        /**
         * Projects a background object's transform. Mirrors iOS's render conversion
         * (`scale = bg.scale`, `offset = (bg.{x,y} - 0.5) * renderSize`,
         * `rotation = bg.rotation`) while keeping the offset normalised.
         *
         * Decays TOLERANTLY on a degenerate wire value — a non-finite or non-positive
         * [StoryMediaObject.scale] collapses to the neutral 1× (a 0 / negative scale
         * would vanish the background entirely), and a non-finite position or rotation
         * collapses to its neutral component — so a malformed object can never blank or
         * invert the slide, only fail to reframe it.
         */
        fun from(mediaObject: StoryMediaObject): StoryBackgroundObjectTransform =
            StoryBackgroundObjectTransform(
                scale = mediaObject.scale.toFloat().takeIf { it.isFinite() && it > 0f } ?: 1f,
                offsetXFraction = (mediaObject.x.toFloat().takeIf { it.isFinite() } ?: 0.5f) - 0.5f,
                offsetYFraction = (mediaObject.y.toFloat().takeIf { it.isFinite() } ?: 0.5f) - 0.5f,
                rotationDegrees = mediaObject.rotation.toFloat().takeIf { it.isFinite() } ?: 0f,
            )
    }
}
