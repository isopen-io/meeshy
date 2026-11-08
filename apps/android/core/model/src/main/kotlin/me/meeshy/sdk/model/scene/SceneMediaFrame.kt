package me.meeshy.sdk.model.scene

import me.meeshy.sdk.model.StoryMediaCrop
import me.meeshy.sdk.model.StoryMediaObject

/**
 * Le cadre d'un média de premier plan à la pose servie, en fractions de la LARGEUR de la scène (miroir de
 * `StoryMediaLayer.renderedPose`, iOS) : taille de base 50 % / 65 % de la largeur design, proportions du rognage,
 * échelle servie ([SceneObjectScalePolicy]) coupée entre mise en page et calque, posé sur son ancre et tourné autour
 * d'elle (le `anchorPoint` d'un `CALayer`).
 */
public data class SceneMediaFrame(
    val widthFraction: Double,
    val heightFraction: Double,
    /** Position du bord gauche / haut, en fraction de la largeur de la scène (le haut se mesure aussi en largeurs). */
    val left: Double,
    val top: Double,
    val pivotX: Float,
    val pivotY: Float,
    val rotationDegrees: Float,
    /** Le facteur dont le calque agrandit ce que la mise en page a mesuré (échelle au-delà du plafond). */
    val layerScale: Float,
) {
    public companion object {
        /**
         * [canvasAspect] = hauteur / largeur de la scène : le centre vertical normalisé se convertit en largeurs.
         */
        public fun of(media: StoryMediaObject, pose: ScenePose, canvasAspect: Double = CANVAS_9_16): SceneMediaFrame {
            val ratio = media.aspectRatio?.let { StoryMediaCrop.effectiveRatio(it, media.crop) }
            val layered = SceneObjectScalePolicy.layered(pose.scale)
            val size = ForegroundMediaFrame.renderedSize(ratio, layered.layout, canvasWidth = 1.0)
            val anchor = media.anchor
            return SceneMediaFrame(
                widthFraction = size.width,
                heightFraction = size.height,
                left = pose.x - anchor.x * size.width,
                top = pose.y * canvasAspect - anchor.y * size.height,
                pivotX = anchor.x.toFloat(),
                pivotY = anchor.y.toFloat(),
                rotationDegrees = pose.rotation.toFloat(),
                layerScale = layered.layerFloat,
            )
        }

        private const val CANVAS_9_16: Double = 16.0 / 9.0
    }
}
