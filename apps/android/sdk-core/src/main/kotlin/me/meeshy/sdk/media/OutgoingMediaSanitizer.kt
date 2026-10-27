package me.meeshy.sdk.media

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
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
            ImageSourceFormat.PNG -> ImageMetadataScrubber.png(item.bytes)?.let { item.withBytes(it) } ?: asJpeg(item)
            ImageSourceFormat.WEBP -> ImageMetadataScrubber.webp(item.bytes)?.let { item.withBytes(it) } ?: asJpeg(item)
            ImageSourceFormat.HEIC -> if (isHeifImage(item.bytes)) asJpeg(item) else item
            ImageSourceFormat.GIF, ImageSourceFormat.UNKNOWN -> item
        }
        clean?.let { NetworkResult.Success(it) } ?: NetworkResult.Failure(ApiError(REFUSED_MESSAGE, code = REFUSED_CODE))
    }

    private fun MediaUploadItem.withBytes(bytes: ByteArray) = MediaUploadItem(bytes, fileName, mimeType)

    private fun verifiedJpeg(item: MediaUploadItem): MediaUploadItem? =
        ImageMetadataScrubber.jpeg(item.bytes)
            ?.takeUnless { ImageMetadataScrubber.jpegCarriesMetadata(it) }
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

    /** Une boîte `ftyp` de marque image (HEIC, HEIF, AVIF) — jamais une vidéo MP4/MOV, qui porte la même boîte. */
    private fun isHeifImage(bytes: ByteArray): Boolean =
        bytes.size >= 12 && String(bytes, 8, 4, Charsets.ISO_8859_1) in HEIF_BRANDS

    internal companion object {
        const val JPEG_QUALITY: Int = 92
        const val JPEG_MIME: String = "image/jpeg"
        const val REFUSED_CODE: String = "IMAGE_LOCATION_NOT_REMOVABLE"
        const val REFUSED_MESSAGE: String = "The photo's location could not be removed, so it was not sent."
        private val HEIF_BRANDS = setOf("heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1", "avif", "avis")
    }
}
