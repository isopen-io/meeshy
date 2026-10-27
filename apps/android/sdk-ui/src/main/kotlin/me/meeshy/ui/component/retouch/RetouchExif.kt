package me.meeshy.ui.component.retouch

import android.graphics.Bitmap
import android.media.ExifInterface
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File

/**
 * **LA PHOTO RETOUCHÉE GARDE LES MÉTADONNÉES DE LA PRISE** (iOS `ComposerPhotoEncoding`, décision porteur
 * 2026-10-04, #9347, #12606) : date et lieu de prise, appareil, objectif, exposition — rendus VRAIS pour l'image
 * qui part (orientation 1, les pixels sont debout ; dimensions du rendu). Un seul encodeur pour toutes les portes
 * de la retouche. Sans prise lisible, ou si l'écriture échoue, le JPEG part sans métadonnées plutôt que de ne pas partir.
 */
public object RetouchExif {
    public const val JPEG_QUALITY: Int = 92

    /** Ce qui voyage de la prise au rendu : l'orientation, la taille et la vignette en sont absentes à dessein. */
    internal val CARRIED_TAGS: List<String> = listOf(
        ExifInterface.TAG_DATETIME, ExifInterface.TAG_DATETIME_ORIGINAL, ExifInterface.TAG_DATETIME_DIGITIZED,
        ExifInterface.TAG_SUBSEC_TIME, ExifInterface.TAG_SUBSEC_TIME_ORIGINAL, ExifInterface.TAG_SUBSEC_TIME_DIGITIZED,
        ExifInterface.TAG_MAKE, ExifInterface.TAG_MODEL, ExifInterface.TAG_SOFTWARE,
        "LensMake", "LensModel", "LensSpecification",
        ExifInterface.TAG_EXPOSURE_TIME, ExifInterface.TAG_F_NUMBER, ExifInterface.TAG_ISO_SPEED_RATINGS,
        ExifInterface.TAG_FOCAL_LENGTH, ExifInterface.TAG_FOCAL_LENGTH_IN_35MM_FILM, ExifInterface.TAG_FLASH,
        ExifInterface.TAG_WHITE_BALANCE, ExifInterface.TAG_EXPOSURE_PROGRAM, ExifInterface.TAG_EXPOSURE_BIAS_VALUE,
        ExifInterface.TAG_METERING_MODE, ExifInterface.TAG_APERTURE_VALUE, ExifInterface.TAG_SHUTTER_SPEED_VALUE,
        ExifInterface.TAG_BRIGHTNESS_VALUE, ExifInterface.TAG_SCENE_CAPTURE_TYPE,
        ExifInterface.TAG_GPS_LATITUDE, ExifInterface.TAG_GPS_LATITUDE_REF, ExifInterface.TAG_GPS_LONGITUDE,
        ExifInterface.TAG_GPS_LONGITUDE_REF, ExifInterface.TAG_GPS_ALTITUDE, ExifInterface.TAG_GPS_ALTITUDE_REF,
        ExifInterface.TAG_GPS_TIMESTAMP, ExifInterface.TAG_GPS_DATESTAMP, ExifInterface.TAG_GPS_PROCESSING_METHOD,
    )

    /** Le rendu en JPEG ; avec [like] (les octets de la prise), il en reprend les métadonnées. */
    public fun jpeg(bitmap: Bitmap, like: ByteArray? = null): ByteArray {
        val plain = ByteArrayOutputStream().also { bitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, it) }.toByteArray()
        if (like == null) return plain
        return runCatching { carry(like, plain, bitmap.width, bitmap.height) }.getOrNull() ?: plain
    }

    internal fun carry(original: ByteArray, jpeg: ByteArray, width: Int, height: Int): ByteArray? {
        val source = ExifInterface(ByteArrayInputStream(original))
        val file = File.createTempFile("retouch-exif", ".jpg")
        try {
            file.writeBytes(jpeg)
            val target = ExifInterface(file.absolutePath)
            CARRIED_TAGS.forEach { tag -> source.getAttribute(tag)?.let { target.setAttribute(tag, it) } }
            target.setAttribute(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL.toString())
            target.setAttribute(ExifInterface.TAG_PIXEL_X_DIMENSION, width.toString())
            target.setAttribute(ExifInterface.TAG_PIXEL_Y_DIMENSION, height.toString())
            target.saveAttributes()
            return file.readBytes()
        } finally {
            file.delete()
        }
    }
}
