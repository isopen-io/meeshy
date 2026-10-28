package me.meeshy.sdk.media

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import java.util.UUID
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
 * Une vidéo ou un son (#13543, #13490, #13550) suit la même loi, au même réglage : MP4/MOV/3GP/M4A ([IsoMediaMetadataScrubber]),
 * WebM ([MatroskaMetadataScrubber]), MP3 ([Mp3MetadataScrubber]), WAV/AIFF/CAF ([ChunkedAudioMetadataScrubber]) et FLAC
 * ([FlacMetadataScrubber]) perdent leurs métadonnées sans réencodage ni déplacement d'octet, la sortie se revérifie
 * (stabilité + aucune signature de lieu, [MediaLocationSignatures]) ; un conteneur illisible ou inconnu ÉCHOUE
 * ([MEDIA_REFUSED_CODE]). Un fichier qui n'est ni une image ni un média connu ne part inchangé que s'il ne porte aucune
 * signature de lieu ; sinon, il est refusé aussi.
 *
 * **Une vidéo ou un son ne se charge JAMAIS en mémoire** (#13551) : il se lit par position ([MediaBytes]), le plan du nettoyeur
 * ([MediaPlan]) s'écrit EN FLUX dans une copie du cache privé ([scratch]), et cette copie se revérifie en flux (stabilité,
 * signatures par fenêtres) ; un média d'origine en mémoire reste en mémoire. La copie d'un envoi terminé s'efface ([release]) ;
 * une copie oubliée (processus tué) part au balayage suivant ([SCRATCH_TTL_MS]). Seule une IMAGE se charge pour être réécrite.
 */
@Singleton
public class OutgoingMediaSanitizer internal constructor(
    private val location: OutgoingPhotoLocationStore,
    private val dispatcher: CoroutineDispatcher,
    private val scratch: File,
    private val now: () -> Long = System::currentTimeMillis,
) {
    @Inject
    public constructor(
        location: OutgoingPhotoLocationStore,
        @DefaultDispatcher dispatcher: CoroutineDispatcher,
        @ApplicationContext context: Context,
    ) : this(location, dispatcher, File(context.cacheDir, SCRATCH_DIRECTORY))

    internal constructor(location: OutgoingPhotoLocationStore, dispatcher: CoroutineDispatcher) :
        this(location, dispatcher, File(System.getProperty("java.io.tmpdir"), "meeshy-$SCRATCH_DIRECTORY"))

    internal suspend fun sanitize(item: MediaUploadItem): NetworkResult<MediaUploadItem> = withContext(dispatcher) {
        if (location.keepsLocation.value) return@withContext NetworkResult.Success(item)
        sweepScratch()
        try {
            scrubbed(item)
        } catch (failure: java.io.IOException) {
            NetworkResult.Failure(ApiError(UNREADABLE_MESSAGE, code = UNREADABLE_CODE))
        }
    }

    /** Une lecture qui échoue (fichier balayé, blob scellé altéré) est un échec DIT ([UNREADABLE_CODE]), jamais une exception qui remonte. */
    private fun scrubbed(item: MediaUploadItem): NetworkResult<MediaUploadItem> {
        val media = item.mediaBytes()
        val head = media.bytes(0, minOf(media.size, HEAD_BYTES.toLong()).toInt())
        val format = ImageSourceFormat.sniff(head)
        return when (val container = mediaContainer(item, media, head, format)) {
            null -> when {
                format != ImageSourceFormat.UNKNOWN || mayBeAnImage(item, head) ->
                    image(item.loaded(), format)?.let { NetworkResult.Success(it) } ?: NetworkResult.Failure(ApiError(REFUSED_MESSAGE, code = REFUSED_CODE))
                MediaLocationSignatures.foundIn(media) -> mediaRefused()
                else -> NetworkResult.Success(item)
            }
            else -> media(item, media, container)?.let { NetworkResult.Success(it) } ?: mediaRefused()
        }
    }

    /** Efface la copie nettoyée de [sent] une fois l'envoi fini (réussi ou non) ; l'original de l'appelant n'est jamais touché. */
    internal fun release(sent: MediaUploadItem, original: MediaUploadItem) {
        if (sent === original) return
        val file = (sent.source as? MediaUploadSource.OnDisk)?.file ?: return
        if (file.parentFile?.canonicalFile == scratch.canonicalFile) file.delete()
    }

    /** La frontière de compte : toute copie nettoyée laissée par un envoi interrompu quitte le disque ([OutgoingMediaScratchTeardown]). */
    internal fun clearScratch() {
        scratch.listFiles().orEmpty().forEach { it.delete() }
    }

    /** Le balayage du démarrage (#13555) : les copies d'un processus mort, écrites avant [before], quittent le disque. */
    internal fun clearScratchBefore(before: Long) {
        scratch.listFiles().orEmpty().filter { it.lastModified() < before }.forEach { it.delete() }
    }

    private fun sweepScratch() {
        scratch.listFiles().orEmpty().filter { now() - it.lastModified() > SCRATCH_TTL_MS }.forEach { it.delete() }
    }

    /** Une image se réécrit en mémoire : elle est lue UNE fois, ici. */
    private fun MediaUploadItem.loaded(): MediaUploadItem =
        if (source is MediaUploadSource.InMemory) this else MediaUploadItem(bytes, fileName, mimeType)

    private fun MediaUploadItem.mediaBytes(): MediaBytes =
        (source as? MediaUploadSource.InMemory)?.let { ArrayMediaBytes(it.bytes) } ?: SourceMediaBytes(source)

    private fun mediaRefused(): NetworkResult<MediaUploadItem> = NetworkResult.Failure(ApiError(MEDIA_REFUSED_MESSAGE, code = MEDIA_REFUSED_CODE))

    private fun image(item: MediaUploadItem, format: ImageSourceFormat): MediaUploadItem? = when (format) {
        ImageSourceFormat.JPEG -> verifiedJpeg(item) ?: asJpeg(item)
        ImageSourceFormat.PNG -> verified(item, ImageMetadataScrubber::png) ?: asJpeg(item)
        ImageSourceFormat.WEBP -> verified(item, ImageMetadataScrubber::webp) ?: asJpeg(item)
        ImageSourceFormat.GIF -> verified(item, ImageMetadataScrubber::gif)
        ImageSourceFormat.HEIC -> asJpeg(item)
        ImageSourceFormat.UNKNOWN -> asJpeg(item)
    }

    private enum class MediaContainer(val plan: (MediaBytes) -> MediaPlan?) {
        ISO(IsoMediaMetadataScrubber::plan),
        MATROSKA(MatroskaMetadataScrubber::plan),
        MP3(Mp3MetadataScrubber::plan),
        WAVE(ChunkedAudioMetadataScrubber::wave),
        AIFF(ChunkedAudioMetadataScrubber::aiff),
        CAF(ChunkedAudioMetadataScrubber::caf),
        FLAC(FlacMetadataScrubber::plan),
        UNSUPPORTED({ null }),
    }

    /**
     * Une vidéo ou un son (#13543, #13490, #13550), reconnu par ses OCTETS quel que soit le type déclaré : ISO (MP4, MOV, 3GP,
     * M4A), Matroska (WebM), MP3, WAV, AIFF, CAF et FLAC se réécrivent sans réencodage ; un conteneur reconnu qu'on ne sait pas
     * réécrire (AVI, RF64/BW64, RIFX, Ogg, AMR, Sun AU, MPEG-TS, ou un des précédents illisible), et tout fichier qui se DÉCLARE `video/…` ou `audio/…`, est refusé — on ne
     * sait pas prouver qu'il ne porte pas de lieu. `null` : ce n'est pas un média connu ; une image suit son chemin, tout
     * autre fichier ne part que s'il ne porte aucune signature de lieu.
     */
    private fun mediaContainer(item: MediaUploadItem, media: MediaBytes, head: ByteArray, format: ImageSourceFormat): MediaContainer? = when {
        format == ImageSourceFormat.HEIC -> MediaContainer.ISO.takeIf { isClearlyNotAnImage(item, media) }
        format != ImageSourceFormat.UNKNOWN -> null
        MatroskaMetadataScrubber.looksLikeMatroska(media) -> MediaContainer.MATROSKA
        IsoMediaMetadataScrubber.looksLikeIsoMedia(media) -> MediaContainer.ISO
        FlacMetadataScrubber.looksLikeFlac(media) -> MediaContainer.FLAC
        ChunkedAudioMetadataScrubber.looksLikeWave(media) -> MediaContainer.WAVE
        ChunkedAudioMetadataScrubber.looksLikeAiff(media) -> MediaContainer.AIFF
        ChunkedAudioMetadataScrubber.looksLikeCaf(media) -> MediaContainer.CAF
        Mp3MetadataScrubber.looksLikeMp3(media) -> MediaContainer.MP3
        isUncleanableMedia(head, media) -> MediaContainer.UNSUPPORTED
        item.mimeType.startsWith("video/", ignoreCase = true) || item.mimeType.startsWith("audio/", ignoreCase = true) -> MediaContainer.UNSUPPORTED
        else -> null
    }

    private fun isUncleanableMedia(head: ByteArray, media: MediaBytes): Boolean =
        UNCLEANABLE_MAGICS.any { head.startsWith(it) } || isIsoBoxHeader(head) || isTransportStream(media)

    private fun ByteArray.startsWith(prefix: ByteArray): Boolean = size >= prefix.size && prefix.indices.all { this[it] == prefix[it] }

    private fun isIsoBoxHeader(bytes: ByteArray): Boolean =
        bytes.size >= 8 && String(bytes, 4, 4, Charsets.ISO_8859_1) in ISO_BOX_TYPES

    private fun isTransportStream(media: MediaBytes): Boolean =
        media.size > TS_PACKET * 2 && (0..2).all { media.byteAt(it * TS_PACKET.toLong()) == TS_SYNC }

    /**
     * Réécrit, puis revérifie la sortie : stable au second passage et sans aucune signature de lieu, sinon `null`. Un original
     * en mémoire se réécrit en mémoire ; tout autre s'écrit EN FLUX dans [scratch] et s'y revérifie en flux.
     */
    private fun media(item: MediaUploadItem, media: MediaBytes, container: MediaContainer): MediaUploadItem? {
        val plan = container.plan(media) ?: return null
        if (plan.isIdentity(media)) return item.takeUnless { MediaLocationSignatures.foundIn(media) }
        val inMemory = item.source as? MediaUploadSource.InMemory
        if (inMemory != null) {
            val clean = plan.render(inMemory.bytes)
            return item.withBytes(clean).takeIf { verified(ArrayMediaBytes(clean), container) }
        }
        check(scratch.isDirectory || scratch.mkdirs()) { "No private scratch directory" }
        val file = File(scratch, UUID.randomUUID().toString())
        return try {
            MediaRewrite.write(item.source, file, plan)
            val clean = MediaUploadItem.onDisk(file, item.fileName, item.mimeType)
            clean.takeIf { verified(SourceMediaBytes(clean.source), container) } ?: run { file.delete(); null }
        } catch (failure: Exception) {
            file.delete()
            throw failure
        }
    }

    private fun verified(clean: MediaBytes, container: MediaContainer): Boolean =
        container.plan(clean)?.isIdentity(clean) == true && !MediaLocationSignatures.foundIn(clean)

    private fun MediaUploadItem.withBytes(bytes: ByteArray) = MediaUploadItem(bytes, fileName, mimeType)

    private fun verified(item: MediaUploadItem, scrub: (ByteArray) -> ByteArray?): MediaUploadItem? =
        scrub(item.bytes)?.takeIf { ImageMetadataScrubber.isStable(it, scrub) }?.let { item.withBytes(it) }

    /** Un TIFF/DNG, une image déclarée comme telle, ou tout ce que le décodeur d'images sait lire : jamais renvoyé tel quel. */
    private fun mayBeAnImage(item: MediaUploadItem, head: ByteArray): Boolean =
        item.mimeType.startsWith("image/", ignoreCase = true) || isTiff(head) || decodes(item)

    private fun isTiff(bytes: ByteArray): Boolean =
        bytes.size >= 4 && (bytes[0] == bytes[1]) && ((bytes[0] == 0x49.toByte() && bytes[2] == 0x2A.toByte() && bytes[3] == 0.toByte()) ||
            (bytes[0] == 0x4D.toByte() && bytes[2] == 0.toByte() && bytes[3] == 0x2A.toByte()))

    /** Les dimensions seules, lues en flux : un fichier inconnu de 200 Mo n'est pas chargé pour savoir s'il est une image. */
    private fun decodes(item: MediaUploadItem): Boolean = runCatching {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        when (val source = item.source) {
            is MediaUploadSource.InMemory -> BitmapFactory.decodeByteArray(source.bytes, 0, source.bytes.size, bounds)
            else -> source.open().use { BitmapFactory.decodeStream(it, null, bounds) }
        }
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
    private fun isClearlyNotAnImage(item: MediaUploadItem, media: MediaBytes): Boolean {
        if (media.size < 16) return false
        val size = media.u32At(0).coerceIn(16L, media.size)
        val major = media.ascii(8, 4)
        val compatible = (16L until size - 3 step 4).map { media.ascii(it, 4) }
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
        const val UNREADABLE_CODE: String = "MEDIA_UNREADABLE"
        const val UNREADABLE_MESSAGE: String = "This file could not be read, so it was not sent."
        private val MEDIA_BRANDS = setOf(
            "isom", "iso2", "iso3", "iso4", "iso5", "iso6", "mp41", "mp42", "mp4x", "avc1", "qt  ", "M4V ", "M4A ", "M4B ", "M4P ",
            "3gp4", "3gp5", "3gp6", "3g2a", "dash",
        )
        private val HEIF_BRANDS = setOf("heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1", "avif", "avis")
        private val UNCLEANABLE_MAGICS = listOf("RIFF", "RF64", "BW64", "RIFX", "ID3", "OggS", "fLaC", "FORM", "caff", "#!AMR", ".snd").map { it.toByteArray(Charsets.ISO_8859_1) }
        private val ISO_BOX_TYPES = setOf("ftyp", "moov", "mdat", "moof", "styp", "sidx", "uuid", "free", "skip", "wide", "pnot", "meta")
        private const val TS_PACKET = 188
        private const val TS_SYNC = 0x47
        private const val HEAD_BYTES = 4096
        const val SCRATCH_DIRECTORY: String = "outgoing-clean"
        const val SCRATCH_TTL_MS: Long = 24L * 60L * 60_000L
    }
}
