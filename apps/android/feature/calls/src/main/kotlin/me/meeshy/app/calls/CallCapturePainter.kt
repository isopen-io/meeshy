package me.meeshy.app.calls

import android.graphics.Bitmap
import java.io.ByteArrayOutputStream
import java.io.File
import java.text.DateFormat
import java.util.Date
import java.util.Locale
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.sdk.call.frames.CallFramePortrait
import me.meeshy.sdk.call.frames.CallFrameRenderer
import me.meeshy.sdk.call.montage.CallMontagePainter
import me.meeshy.sdk.call.montage.CallMontagePhoto
import me.meeshy.sdk.media.CaptureGallery
import me.meeshy.sdk.model.call.frames.CallFrameTexts
import me.meeshy.sdk.model.call.montage.CallCaptureLook
import me.meeshy.sdk.model.call.montage.CallCaptureScene
import me.meeshy.sdk.model.call.montage.CallCaptureSpec
import me.meeshy.sdk.model.call.montage.CallMontageCaption

/**
 * Peindre une capture avec les peintres du dépôt (miroir de `CallCaptureController.render`, iOS) : un
 * classique par [CallMontagePainter], un cadre par [CallFrameRenderer]. Une personne sans image garde sa
 * case (initiale).
 */
class CallCapturePainter(
    private val now: () -> Date = ::Date,
    private val locale: () -> Locale = Locale::getDefault,
) : CallCapturePainting {

    override fun paint(scene: CallCaptureScene, images: Map<String, Bitmap>, width: Int, height: Int): Bitmap? {
        val date = now()
        val locale = locale()
        val day = DateFormat.getDateInstance(DateFormat.LONG, locale).format(date)
        return when (val look = scene.look) {
            is CallCaptureLook.Classic -> CallMontagePainter.render(
                style = look.style,
                photos = scene.subjects.map { CallMontagePhoto(it.id, it.name, images[it.id]) },
                width = width,
                height = height,
                caption = caption(date, locale),
            )
            is CallCaptureLook.Frame -> CallFrameRenderer.render(
                frame = look.design,
                portraits = scene.subjects.map { CallFramePortrait(it.id, it.name, it.handle, it.isSelf, images[it.id]) },
                texts = CallFrameTexts(groupName = null, isGroup = false, date = day, accentHex = null),
                width = width,
                height = height,
            )
        }
    }

    private fun caption(date: Date, locale: Locale): CallMontageCaption = CallMontageCaption(
        title = CallMontageCaption.BRAND_TITLE,
        subtitle = DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT, locale).format(date),
        clock = DateFormat.getTimeInstance(DateFormat.SHORT, locale).format(date),
    )
}

/** Une capture part dans l'album « Meeshy » de la galerie, par la galerie de capture du SDK (MediaStore). */
class GalleryCallCaptureSaver(private val gallery: CaptureGallery) : CallCaptureSaving {
    override suspend fun saveImage(image: Bitmap, name: String): Boolean {
        val jpeg = withContext(Dispatchers.Default) {
            ByteArrayOutputStream().use { out ->
                image.compress(Bitmap.CompressFormat.JPEG, CallCaptureSpec.JPEG_QUALITY, out)
                out.toByteArray()
            }
        }
        return jpeg.isNotEmpty() && gallery.saveImage(jpeg, name)
    }

    override suspend fun saveVideo(file: File, name: String): Boolean = gallery.saveVideo(file, name)
}
