package me.meeshy.sdk.model.composer.look

import me.meeshy.sdk.model.StoryMediaCrop
import me.meeshy.sdk.model.StoryMediaReframe
import me.meeshy.sdk.model.imageedit.CropFrame
import me.meeshy.sdk.model.imageedit.CropRect
import me.meeshy.sdk.model.imageedit.NormalizedCrop

/** Où se posent, à l'écran, le cadre du recadrage et l'image entière qu'il découpe. */
public data class ComposerCropStageLayout(val frame: CropRect, val image: CropRect)

/**
 * **LE RECADRAGE PLEIN ÉCRAN** (#15194) : le cadre est fixe, centré dans la place libre aux proportions du recadrage, et
 * l'image se pose dessous pour que la fenêtre choisie y tienne exactement. Pincer et glisser déplacent l'image sous le
 * cadre ([reframed], la loi du recadrage par le geste de la scène, [StoryMediaReframe]) ; tirer un angle redimensionne le
 * cadre sur l'image immobile ([resized]), puis le cadre se recentre à ses nouvelles proportions. Le recadrage reste la
 * fenêtre normalisée que la recette garde et que la cuisson peint : ce qu'on voit dans le cadre est ce qui part.
 */
public object ComposerCropStage {

    /** La part de la place libre que le cadre occupe : ses angles restent loin des bords de l'écran. */
    public const val FILL: Float = 0.92f

    private val WHOLE = NormalizedCrop(0f, 0f, 1f, 1f)

    public fun layout(crop: NormalizedCrop?, sourceWidth: Int, sourceHeight: Int, room: CropRect): ComposerCropStageLayout? {
        val window = crop ?: WHOLE
        if (sourceWidth <= 0 || sourceHeight <= 0 || room.width <= 1f || room.height <= 1f) return null
        if (window.width <= 0f || window.height <= 0f) return null
        val aspect = (window.width * sourceWidth).toDouble() / (window.height * sourceHeight)
        val frame = CropFrame.centered(aspect, room, FILL)
        val width = frame.width / window.width
        val height = frame.height / window.height
        return ComposerCropStageLayout(frame, CropRect(frame.left - window.x * width, frame.top - window.y * height, width, height))
    }

    /** Le geste sur l'image : [panX] et [panY] en pixels d'écran, [zoom] le facteur du pincement ; `null` ⇒ la prise entière. */
    public fun reframed(crop: NormalizedCrop?, frame: CropRect, panX: Float, panY: Float, zoom: Float): NormalizedCrop? {
        if (frame.width <= 0f || frame.height <= 0f) return crop
        val next = StoryMediaReframe.reframed(
            StoryMediaCrop.ofNormalized(crop),
            panX = (panX / frame.width).toDouble(),
            panY = (panY / frame.height).toDouble(),
            zoom = zoom.toDouble(),
        )
        return next?.normalized
    }

    /** Le cadre tiré à la main sur l'image posée : la fenêtre qu'il couvre, `null` pour la prise entière ; un cadre dégénéré ne change rien. */
    public fun resized(current: NormalizedCrop?, frame: CropRect, image: CropRect): NormalizedCrop? {
        val baked = CropFrame.bake(touched = true, hasSavedCrop = true, frame = frame, display = image) ?: return current
        return baked.crop
    }
}
