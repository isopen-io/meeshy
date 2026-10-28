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
 * retrait ne part jamais.
 *
 * Une vidéo ou un son (#13543, #13490) suit la même loi, au même réglage : MP4/MOV/3GP/M4A ([IsoMediaMetadataScrubber]) et
 * WebM ([MatroskaMetadataScrubber]) perdent leurs métadonnées sans réencodage ni déplacement d'octet, la sortie se revérifie
 * (stabilité + aucune signature de lieu, [MediaLocationSignatures]) ; un conteneur illisible ou inconnu ÉCHOUE
 * ([MEDIA_REFUSED_CODE]). Un fichier qui n'est ni une image ni un média connu ne part inchangé que s'il ne porte aucune
 * signature de lieu ; sinon, il est refusé aussi.
 */
@Singleton
public class OutgoingMediaSanitizer @Inject constructor(
    private val location: OutgoingPhotoLocationStore,
    @DefaultDispatcher private val dispatcher: CoroutineDispatcher,
) {
    internal suspend fun sanitize(item: MediaUploadItem): NetworkResult<MediaUploadItem> = withContext(dispatcher) {
        if (location.keepsLocation.value) return@withContext NetworkResult.Success(item)
        val format = ImageSourceFormat.sniff(item.bytes)
        when (val container = mediaContainer(item, format)) {
            null -> when {
                format != ImageSourceFormat.UNKNOWN || mayBeAnImage(item) ->
                    image(item, format)?.let { NetworkResult.Success(it) } ?: NetworkResult.Failure(ApiError(REFUSED_MESSAGE, code = REFUSED_CODE))
                MediaLocationSignatures.foundIn(item.bytes) -> mediaRefused()
                else -> NetworkResult.Success(item)
            }
            else -> media(item, container)?.let { NetworkResult.Success(it) } ?: mediaRefused()
        }
    }

    private fun mediaRefused(): NetworkResult<MediaUploadItem> = NetworkResult.Failure(ApiError(MEDIA_REFUSED_MESSAGE, code = MEDIA_REFUSED_CODE))

    private fun image(item: MediaUploadItem, format: ImageSourceFormat): MediaUploadItem? = when (format) {
        ImageSourceFormat.JPEG -> verifiedJpeg(item) ?: asJpeg(item)
        ImageSourceFormat.PNG -> verified(item, ImageMetadataScrubber::png) ?: asJpeg(item)
        ImageSourceFormat.WEBP -> verified(item, ImageMetadataScrubber::webp) ?: asJpeg(item)
        ImageSourceFormat.GIF -> verified(item, ImageMetadataScrubber::gif)
        ImageSourceFormat.HEIC -> asJpeg(item)
        ImageSourceFormat.UNKNOWN -> asJpeg(item)
    }

    private enum class MediaContainer(val scrub: (ByteArray) -> ByteArray?) {
        ISO(IsoMediaMetadataScrubber::scrub),
        MATROSKA(MatroskaMetadataScrubber::scrub),
        UNSUPPORTED({ null }),
    }

    /**
     * Une vidéo ou un son (#13543, #13490), reconnu par ses OCTETS quel que soit le type déclaré : ISO (MP4, MOV, 3GP, M4A)
     * et Matroska (WebM) se réécrivent sans réencodage ; un conteneur reconnu qu'on ne sait pas réécrire (RIFF AVI/WAVE,
     * ID3, Ogg, FLAC, AIFF, CAF, AMR, MPEG-TS), et tout fichier qui se DÉCLARE `video/…` ou `audio/…`, est refusé — on ne
     * sait pas prouver qu'il ne porte pas de lieu. `null` : ce n'est pas un média connu ; une image suit son chemin, tout
     * autre fichier ne part que s'il ne porte aucune signature de lieu.
     */
    private fun mediaContainer(item: MediaUploadItem, format: ImageSourceFormat): MediaContainer? = when {
        format == ImageSourceFormat.HEIC -> MediaContainer.ISO.takeIf { isClearlyNotAnImage(item) }
        format != ImageSourceFormat.UNKNOWN -> null
        MatroskaMetadataScrubber.looksLikeMatroska(item.bytes) -> MediaContainer.MATROSKA
        IsoMediaMetadataScrubber.looksLikeIsoMedia(item.bytes) -> MediaContainer.ISO
        isUncleanableMedia(item.bytes) -> MediaContainer.UNSUPPORTED
        item.mimeType.startsWith("video/", ignoreCase = true) || item.mimeType.startsWith("audio/", ignoreCase = true) -> MediaContainer.UNSUPPORTED
        else -> null
    }

    private fun isUncleanableMedia(bytes: ByteArray): Boolean =
        UNCLEANABLE_MAGICS.any { bytes.startsWith(it) } || isIsoBoxHeader(bytes) || isTransportStream(bytes)

    private fun ByteArray.startsWith(prefix: ByteArray): Boolean = size >= prefix.size && prefix.indices.all { this[it] == prefix[it] }

    private fun isIsoBoxHeader(bytes: ByteArray): Boolean =
        bytes.size >= 8 && String(bytes, 4, 4, Charsets.ISO_8859_1) in ISO_BOX_TYPES

    private fun isTransportStream(bytes: ByteArray): Boolean =
        bytes.size > TS_PACKET * 2 && (0..2).all { bytes[it * TS_PACKET] == TS_SYNC }

    /** Réécrit, puis revérifie la sortie : stable au second passage et sans aucune signature de lieu, sinon `null`. */
    private fun media(item: MediaUploadItem, container: MediaContainer): MediaUploadItem? {
        val clean = container.scrub(item.bytes) ?: return null
        val stable = clean === item.bytes || container.scrub(clean)?.contentEquals(clean) == true
        if (!stable || MediaLocationSignatures.foundIn(clean)) return null
        return if (clean === item.bytes) item else item.withBytes(clean)
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
        const val MEDIA_REFUSED_CODE: String = "MEDIA_LOCATION_NOT_REMOVABLE"
        const val MEDIA_REFUSED_MESSAGE: String = "The location of this video or audio could not be removed, so it was not sent."
        private val MEDIA_BRANDS = setOf(
            "isom", "iso2", "iso3", "iso4", "iso5", "iso6", "mp41", "mp42", "mp4x", "avc1", "qt  ", "M4V ", "M4A ", "M4B ", "M4P ",
            "3gp4", "3gp5", "3gp6", "3g2a", "dash",
        )
        private val HEIF_BRANDS = setOf("heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1", "avif", "avis")
        private val UNCLEANABLE_MAGICS = listOf("RIFF", "ID3", "OggS", "fLaC", "FORM", "caff", "#!AMR", ".snd").map { it.toByteArray(Charsets.ISO_8859_1) }
        private val ISO_BOX_TYPES = setOf("ftyp", "moov", "mdat", "moof", "styp", "sidx", "uuid", "free", "skip", "wide", "pnot", "meta")
        private const val TS_PACKET = 188
        private const val TS_SYNC: Byte = 0x47
    }
}
