package me.meeshy.app.stories

import me.meeshy.sdk.model.StoryMediaCrop
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
 *
 * ## Why the scale has TWO axes since 2026-09-04 (#5085)
 *
 * The author's pan/zoom is uniform, and a single [scaleX]/[scaleY] pair would be
 * redundant for it alone. The **crop** is not: showing a fraction `w × h` of the
 * source without re-encoding means enlarging by `1/w` and `1/h` — two different
 * factors as soon as the crop is not square. Folding the crop into this projection
 * rather than into the view keeps ONE arithmetic site, unit-tested; a composition
 * written in the `graphicsLayer` block would only be reachable by a source guard.
 *
 * The reference rendering is iOS's `CALayer.contentsRect`, which crops the SOURCE
 * and then aspect-fills. Composing scale-and-translate on top of `ContentScale.Crop`
 * agrees with it exactly when the crop's effective ratio matches the render surface —
 * the dominant case, since the crop pads offer the canvas's own ratio — and diverges
 * second-order otherwise. Said here rather than discovered later.
 */
data class StoryBackgroundObjectTransform(
    val scaleX: Float,
    val scaleY: Float,
    val offsetXFraction: Float,
    val offsetYFraction: Float,
    val rotationDegrees: Float,
) {
    /** At rest — the background aspect-fills the frame with no extra framing. */
    val isIdentity: Boolean
        get() = scaleX == 1f && scaleY == 1f &&
            offsetXFraction == 0f && offsetYFraction == 0f && rotationDegrees == 0f

    companion object {
        /** No extra framing — a plain aspect-fill. */
        val IDENTITY: StoryBackgroundObjectTransform = StoryBackgroundObjectTransform(
            scaleX = 1f,
            scaleY = 1f,
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
        fun from(mediaObject: StoryMediaObject): StoryBackgroundObjectTransform {
            val zoom = mediaObject.scale.toFloat().takeIf { it.isFinite() && it > 0f } ?: 1f
            val panX = (mediaObject.x.toFloat().takeIf { it.isFinite() } ?: 0.5f) - 0.5f
            val panY = (mediaObject.y.toFloat().takeIf { it.isFinite() } ?: 0.5f) - 0.5f
            val crop = mediaObject.crop?.takeIf { !it.isFull }
                ?.let { StoryMediaCrop.clamped(it) }
                ?: return StoryBackgroundObjectTransform(
                    scaleX = zoom,
                    scaleY = zoom,
                    offsetXFraction = panX,
                    offsetYFraction = panY,
                    rotationDegrees = mediaObject.rotation.toFloat().takeIf { it.isFinite() } ?: 0f,
                )

            // **Montrer une FRACTION sans ré-encoder** : agrandir à l'inverse de la
            // bande, puis amener le CENTRE de la bande au centre du cadre. Le
            // décalage se calcule APRÈS l'agrandissement — c'est l'ordre dans lequel
            // `graphicsLayer` applique les deux, et l'inverser donnerait un cadrage
            // plausible mais faux, donc invisible en revue.
            val cropCentreX = (crop.x + crop.width / 2.0 - 0.5) / crop.width
            val cropCentreY = (crop.y + crop.height / 2.0 - 0.5) / crop.height
            return StoryBackgroundObjectTransform(
                scaleX = zoom * (1.0 / crop.width).toFloat(),
                scaleY = zoom * (1.0 / crop.height).toFloat(),
                // Le déplacement de l'auteur s'ajoute au recadrage : les deux sont des
                // intentions distinctes — cadrer la source, puis la déplacer dans le
                // cadre — et les fondre en une seule perdrait la seconde au premier
                // recadrage posé.
                offsetXFraction = panX - cropCentreX.toFloat(),
                offsetYFraction = panY - cropCentreY.toFloat(),
                rotationDegrees = mediaObject.rotation.toFloat().takeIf { it.isFinite() } ?: 0f,
            )
        }
    }
}
