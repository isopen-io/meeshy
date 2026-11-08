package me.meeshy.ui.component.imageedit

import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import me.meeshy.sdk.model.media.CropFrameSize
import me.meeshy.sdk.model.media.CropNudge
import me.meeshy.sdk.model.media.CropSourceRect
import me.meeshy.sdk.model.media.CropTransform
import me.meeshy.sdk.model.media.ImageCropGeometry

/**
 * L'état du geste de recadrage : une mince projection Compose de [CropTransform] (la géométrie vit dans
 * `:core:model`, testée à la JVM). Pincer zoome, glisser déplace, le clavier déplace par pas ; la contrainte
 * « cover » est appliquée à chaque mutation, donc l'image ne laisse jamais de vide dans le cadre.
 */
@Stable
public class CropGestureState(
    public val imageWidthPx: Int,
    public val imageHeightPx: Int,
    public val frame: CropFrameSize,
) {
    public var transform: CropTransform by mutableStateOf(CropTransform.initial())
        private set

    public fun onGesture(panX: Float, panY: Float, zoomChange: Float) {
        transform = transform
            .zoomed(zoomChange, imageWidthPx, imageHeightPx, frame)
            .panned(panX, panY, imageWidthPx, imageHeightPx, frame)
    }

    public fun nudge(direction: CropNudge) {
        transform = transform.nudged(direction, imageWidthPx, imageHeightPx, frame)
    }

    public fun zoomBy(factor: Float) {
        transform = transform.zoomed(factor, imageWidthPx, imageHeightPx, frame)
    }

    /** Pixels d'écran par pixel source, zoom compris. */
    public val displayScale: Float
        get() = ImageCropGeometry.coverScale(imageWidthPx, imageHeightPx, frame) * transform.zoom

    public fun sourceRect(): CropSourceRect =
        ImageCropGeometry.sourceRect(imageWidthPx, imageHeightPx, frame, transform)

    public companion object {
        public const val ZOOM_STEP: Float = 1.25f
    }
}
