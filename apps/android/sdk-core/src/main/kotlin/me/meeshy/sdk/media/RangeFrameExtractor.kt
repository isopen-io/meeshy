package me.meeshy.sdk.media

import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
import java.io.File
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request

/** Décode la première image d'un fichier vidéo local, bornée à [maxDimension] px sur le plus grand côté. */
public fun interface FirstFrameDecoder {
    public fun decode(file: File, maxDimension: Int): Bitmap?
}

/** Décodeur matériel : `MediaMetadataRetriever`, image à 0,1 s (évite l'image noire de t=0). */
public object RetrieverFirstFrameDecoder : FirstFrameDecoder {
    private const val SEEK_US = 100_000L

    override fun decode(file: File, maxDimension: Int): Bitmap? {
        val retriever = MediaMetadataRetriever()
        return try {
            retriever.setDataSource(file.absolutePath)
            val frame = retriever.getFrameAtTime(SEEK_US, MediaMetadataRetriever.OPTION_CLOSEST_SYNC)
                ?: retriever.getFrameAtTime(0L, MediaMetadataRetriever.OPTION_CLOSEST_SYNC)
            frame?.let { downscale(it, maxDimension) }
        } catch (_: Exception) {
            null
        } finally {
            runCatching { retriever.release() }
        }
    }

    private fun downscale(frame: Bitmap, maxDimension: Int): Bitmap {
        val longest = maxOf(frame.width, frame.height)
        if (longest <= maxDimension || maxDimension <= 0) return frame
        val ratio = maxDimension.toFloat() / longest
        val scaled = Bitmap.createScaledBitmap(
            frame,
            (frame.width * ratio).toInt().coerceAtLeast(1),
            (frame.height * ratio).toInt().coerceAtLeast(1),
            true,
        )
        if (scaled !== frame) frame.recycle()
        return scaled
    }
}

/**
 * Première image d'une vidéo DISTANTE sans la télécharger : un `GET` partiel (`Range` sur le premier Mo,
 * où vit la première keyframe) décodé en matériel. Miroir de `MeeshyVideoThumbnail.extractRemoteFirstFrame`
 * (iOS). Atome : aucune politique réseau, aucune persistance — l'appelant décide QUAND l'appeler.
 * Hors ligne, rien ne part.
 */
public class RangeFrameExtractor(
    private val client: OkHttpClient,
    private val scratchDir: File,
    private val isOnline: () -> Boolean,
    private val decoder: FirstFrameDecoder = RetrieverFirstFrameDecoder,
) {
    public suspend fun extract(
        url: String,
        maxDimension: Int,
        timeoutMillis: Long = DEFAULT_TIMEOUT_MILLIS,
    ): Bitmap? {
        if (!isOnline()) return null
        return withContext(Dispatchers.IO) {
            val head = fetchHead(url, timeoutMillis) ?: return@withContext null
            try {
                decoder.decode(head, maxDimension)
            } finally {
                head.delete()
            }
        }
    }

    private fun fetchHead(url: String, timeoutMillis: Long): File? {
        val request = runCatching {
            Request.Builder().url(url).header("Range", RANGE_HEADER).build()
        }.getOrNull() ?: return null
        val call = client.newBuilder().callTimeout(timeoutMillis, TimeUnit.MILLISECONDS).build().newCall(request)
        return try {
            call.execute().use { response ->
                if (!response.isSuccessful) return null
                val body = response.body ?: return null
                scratchDir.mkdirs()
                val file = File.createTempFile("poster-head-", ".mp4", scratchDir)
                var remaining = HEAD_BYTES
                body.byteStream().use { input ->
                    file.outputStream().use { out ->
                        val buffer = ByteArray(BUFFER_SIZE)
                        while (remaining > 0) {
                            val read = input.read(buffer, 0, minOf(buffer.size.toLong(), remaining).toInt())
                            if (read < 0) break
                            out.write(buffer, 0, read)
                            remaining -= read
                        }
                    }
                }
                file
            }
        } catch (_: Exception) {
            null
        }
    }

    public companion object {
        public const val HEAD_BYTES: Long = 1_048_576L
        public const val RANGE_HEADER: String = "bytes=0-1048575"
        public const val DEFAULT_TIMEOUT_MILLIS: Long = 8_000L
        private const val BUFFER_SIZE = 16 * 1024
    }
}
