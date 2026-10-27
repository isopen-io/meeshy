package me.meeshy.sdk.media

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.withContext
import me.meeshy.core.common.DefaultDispatcher
import me.meeshy.sdk.model.media.ImageSourceFormat
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult

/**
 * **LE POINT DE PASSAGE UNIQUE : aucune image ne quitte l'appareil avec son lieu** (#13450).
 *
 * Posé à la sortie réseau (`MediaRepository.upload`, `TusUploadRepository.upload`) donc AVANT tout téléversement
 * — et avant tout chiffrement de pièce jointe qui viendrait après : chat, conversation E2EE, post, story, réel,
 * avatar, bannière, commentaire passent tous par là, y compris les octets que `ImageCompressor` renvoie tels quels.
 *
 * Sauf réglage « Conserver le lieu des photos » ([OutgoingPhotoLocationStore], désactivé par défaut), un JPEG, un PNG
 * ou un WebP est réécrit sans ré-encodage ([ImageMetadataScrubber]) puis le retrait se VÉRIFIE sur les octets
 * écrits. Un HEIC, ou un conteneur que l'on ne sait pas réécrire, est ré-encodé en JPEG debout (le décodeur ne
 * recopie aucune métadonnée). Si rien de cela n'aboutit, l'envoi ÉCHOUE : une image dont on ne prouve pas le
 * retrait ne part jamais. Un GIF, une vidéo ou un fichier qui n'est pas une image passent inchangés.
 */
@Singleton
public class OutgoingMediaSanitizer @Inject constructor(
    private val location: OutgoingPhotoLocationStore,
    @DefaultDispatcher private val dispatcher: CoroutineDispatcher,
) {
    internal suspend fun sanitize(item: MediaUploadItem): NetworkResult<MediaUploadItem> = withContext(dispatcher) {
        if (location.keepsLocation.value) return@withContext NetworkResult.Success(item)
        val clean = when (ImageSourceFormat.sniff(item.bytes)) {
            ImageSourceFormat.JPEG -> verifiedJpeg(item) ?: asJpeg(item)
            ImageSourceFormat.PNG -> verified(item, ImageMetadataScrubber::png) ?: asJpeg(item)
            ImageSourceFormat.WEBP -> verified(item, ImageMetadataScrubber::webp) ?: asJpeg(item)
            ImageSourceFormat.GIF -> verified(item, ImageMetadataScrubber::gif)
            ImageSourceFormat.HEIC -> if (isClearlyNotAnImage(item)) item else asJpeg(item)
            ImageSourceFormat.UNKNOWN -> if (mayBeAnImage(item)) asJpeg(item) else item
        }
        clean?.let { NetworkResult.Success(it) } ?: NetworkResult.Failure(ApiError(REFUSED_MESSAGE, code = REFUSED_CODE))
    }

    private fun MediaUploadItem.withBytes(bytes: ByteArray) = MediaUploadItem(bytes, fileName, mimeType)

    private fun verified(item: MediaUploadItem, scrub: (ByteArray) -> ByteArray?): MediaUploadItem? =
        scrub(item.bytes)?.takeIf { ImageMetadataScrubber.isStable(it, scrub) }?.let { item.withBytes(it) }

    /** Un TIFF/DNG, une image déclarée comme telle, ou tout ce que le décodeur d'images sait lire : jamais renvoyé tel quel. */
    private fun mayBeAnImage(item: MediaUploadItem): Boolean =
        item.mimeType.startsWith("image/", ignoreCase = true) || isTiff(item.bytes) || decodes(item.bytes)

    private fun isTiff(bytes: ByteArray): Boolean =
        bytes.size >= 4 && (bytes[0] == bytes[1]) && ((bytes[0] == 0x49.toByte() && bytes[2] == 0x2A.toByte() && bytes[3] == 0.toByte()) ||
            (bytes[0] == 0x4D.toByte() && bytes[2] == 0.toByte() && bytes[3] == 0x2A.toByte()))

    private fun decodes(bytes: ByteArray): Boolean = runCatching {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        bounds.outWidth > 0 && bounds.outHeight > 0
    }.getOrDefault(false)

    private fun verifiedJpeg(item: MediaUploadItem): MediaUploadItem? =
        ImageMetadataScrubber.jpeg(item.bytes)
            ?.takeIf { ImageMetadataScrubber.isStable(it, ImageMetadataScrubber::jpeg) && !ImageMetadataScrubber.jpegCarriesMetadata(it) }
            ?.let { item.withBytes(it) }

    /** Le ré-encodage de dernier recours : pixels debout, aucune métadonnée. `null` si l'image ne se décode pas. */
    private fun asJpeg(item: MediaUploadItem): MediaUploadItem? = runCatching {
        val decoded = BitmapFactory.decodeByteArray(item.bytes, 0, item.bytes.size) ?: return null
        val oriented = decoded.oriented(orientationOf(item.bytes))
        val output = ByteArrayOutputStream()
        oriented.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, output)
        MediaUploadItem(output.toByteArray(), item.fileName.withJpegExtension(), JPEG_MIME)
    }.getOrNull()

    private fun orientationOf(bytes: ByteArray): Int = runCatching {
        ExifInterface(ByteArrayInputStream(bytes)).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
    }.getOrDefault(ExifInterface.ORIENTATION_NORMAL)

    private fun Bitmap.oriented(orientation: Int): Bitmap {
        val matrix = Matrix()
        when (orientation) {
            ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.postScale(-1f, 1f)
            ExifInterface.ORIENTATION_ROTATE_180 -> matrix.postRotate(180f)
            ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.postScale(1f, -1f)
            ExifInterface.ORIENTATION_TRANSPOSE -> { matrix.postRotate(90f); matrix.postScale(-1f, 1f) }
            ExifInterface.ORIENTATION_ROTATE_90 -> matrix.postRotate(90f)
            ExifInterface.ORIENTATION_TRANSVERSE -> { matrix.postRotate(270f); matrix.postScale(-1f, 1f) }
            ExifInterface.ORIENTATION_ROTATE_270 -> matrix.postRotate(270f)
        }
        return if (matrix.isIdentity) this else Bitmap.createBitmap(this, 0, 0, width, height, matrix, true)
    }

    private fun String.withJpegExtension(): String =
        if (isBlank()) "image.jpg" else substringBeforeLast('.', this) + ".jpg"

    /**
     * Une boîte `ftyp` est une vidéo ou un son SEULEMENT si sa marque principale l'est — ou que l'appelant la déclare
     * `video/…` ou `audio/…` — ET qu'aucune marque compatible ne dit « image » (HEIC, HEIF, AVIF). Dans le doute —
     * marque inconnue d'un fichier qui ne se déclare ni vidéo ni son — c'est une image.
     */
    private fun isClearlyNotAnImage(item: MediaUploadItem): Boolean {
        val bytes = item.bytes
        if (bytes.size < 16) return false
        val size = ByteBuffer.wrap(bytes, 0, 4).int.toLong().and(0xFFFFFFFFL).coerceIn(16L, bytes.size.toLong()).toInt()
        val major = String(bytes, 8, 4, Charsets.ISO_8859_1)
        val compatible = (16 until size - 3 step 4).map { String(bytes, it, 4, Charsets.ISO_8859_1) }
        val declaredMedia = item.mimeType.startsWith("video/", ignoreCase = true) || item.mimeType.startsWith("audio/", ignoreCase = true)
        return (major in MEDIA_BRANDS || declaredMedia) && (compatible + major).none { it in HEIF_BRANDS }
    }

    internal companion object {
        const val JPEG_QUALITY: Int = 92
        const val JPEG_MIME: String = "image/jpeg"
        const val REFUSED_CODE: String = "IMAGE_LOCATION_NOT_REMOVABLE"
        const val REFUSED_MESSAGE: String = "The photo's location could not be removed, so it was not sent."
        private val MEDIA_BRANDS = setOf(
            "isom", "iso2", "iso3", "iso4", "iso5", "iso6", "mp41", "mp42", "mp4x", "avc1", "qt  ", "M4V ", "M4A ", "M4B ", "M4P ",
            "3gp4", "3gp5", "3gp6", "3g2a", "dash",
        )
        private val HEIF_BRANDS = setOf("heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1", "avif", "avis")
    }
}
