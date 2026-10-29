package me.meeshy.sdk.model.call.montage

import kotlin.math.max
import kotlin.math.min

/** Un tour de l'aperçu : peindre la scène choisie ou non, et quelles vignettes classiques refaire. */
public data class CallCapturePreviewPlan(val preview: Boolean, val thumbnails: List<CallMontageStyle>) {
    val isEmpty: Boolean get() = !preview && thumbnails.isEmpty()
}

/**
 * **L'APERÇU PEINT DU MODE MONTAGE** — les mesures et la cadence de `CallCaptureController` (iOS) :
 * l'aperçu en 540 × 960 toutes les 200 ms sur des images réduites à 640, les vignettes classiques en
 * 108 × 192 refaites un tour sur cinq, à trois styles de part et d'autre du choisi. Un cadre servi en
 * direct se montre sur le flux vidéo (`CallMontageFrameStage`) : rien ne se peint pour lui.
 */
public object CallCapturePreviewRule {
    public const val INTERVAL_MILLIS: Long = 200L
    public const val THUMBNAIL_EVERY_PREVIEWS: Int = 5
    public const val THUMBNAIL_RADIUS: Int = 3
    public const val MAX_DIMENSION: Int = 640
    public const val PREVIEW_WIDTH: Int = 540
    public const val PREVIEW_HEIGHT: Int = 960
    public const val THUMBNAIL_WIDTH: Int = 108
    public const val THUMBNAIL_HEIGHT: Int = 192

    /** `radius` éléments de part et d'autre de [selected] (le premier s'il est absent), jamais au-delà de la liste. */
    public fun <T> window(selected: T, items: List<T>, radius: Int): List<T> {
        if (items.isEmpty()) return emptyList()
        val reach = max(radius, 0)
        val centre = items.indexOf(selected).takeIf { it >= 0 } ?: 0
        return items.subList(max(centre - reach, 0), min(centre + reach, items.size - 1) + 1)
    }

    public fun rendersThumbnails(hasThumbnails: Boolean, previewsSinceThumbnails: Int): Boolean =
        !hasThumbnails || previewsSinceThumbnails >= THUMBNAIL_EVERY_PREVIEWS

    /** La scène peinte recouvre l'appel : un classique, ou un cadre que le direct ne sert pas. */
    public fun paintsPreview(look: CallCaptureLook, liveFrameShown: Boolean): Boolean =
        look is CallCaptureLook.Classic || !liveFrameShown

    public fun plan(look: CallCaptureLook, liveFrameShown: Boolean, hasThumbnails: Boolean, previewsSinceThumbnails: Int): CallCapturePreviewPlan {
        val thumbnails = when {
            look !is CallCaptureLook.Classic -> emptyList()
            !rendersThumbnails(hasThumbnails, previewsSinceThumbnails) -> emptyList()
            else -> window(look.style, CallMontageStyle.entries.toList(), THUMBNAIL_RADIUS)
        }
        return CallCapturePreviewPlan(preview = paintsPreview(look, liveFrameShown), thumbnails = thumbnails)
    }
}
