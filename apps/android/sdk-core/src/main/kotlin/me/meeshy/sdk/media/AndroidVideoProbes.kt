package me.meeshy.sdk.media

import android.media.MediaCodecInfo
import android.media.MediaCodecList
import android.media.MediaExtractor
import android.media.MediaFormat
import android.os.Build
import java.io.File
import me.meeshy.sdk.model.media.HardwareDecoderHeuristic
import me.meeshy.sdk.model.media.VideoSourceCodec
import me.meeshy.sdk.model.media.VideoSourceInfo

/** Lit la piste vidéo avec `MediaExtractor` ; dimensions rendues telles que l'écran les montre. */
internal class MediaExtractorVideoProbe : VideoSourceProbe {

    override fun probe(file: File): VideoSourceInfo? {
        val extractor = MediaExtractor()
        return try {
            extractor.setDataSource(file.absolutePath)
            (0 until extractor.trackCount)
                .map { extractor.getTrackFormat(it) }
                .firstOrNull { it.getString(MediaFormat.KEY_MIME)?.startsWith("video/") == true }
                ?.let { describe(it, file) }
        } catch (failure: Exception) {
            null
        } finally {
            extractor.release()
        }
    }

    private fun describe(format: MediaFormat, file: File): VideoSourceInfo? {
        val width = format.intOrNull(MediaFormat.KEY_WIDTH) ?: return null
        val height = format.intOrNull(MediaFormat.KEY_HEIGHT) ?: return null
        val quarterTurn = (format.intOrNull(MediaFormat.KEY_ROTATION) ?: 0) % HALF_TURN != 0
        val durationUs = format.longOrNull(MediaFormat.KEY_DURATION)
        val bitRate = format.intOrNull(MediaFormat.KEY_BIT_RATE)?.toLong()
            ?: durationUs?.takeIf { it > 0 }?.let { file.length() * BITS * MICROS / it }
        return VideoSourceInfo(
            codec = codecOf(format.getString(MediaFormat.KEY_MIME)),
            displayWidth = if (quarterTurn) height else width,
            displayHeight = if (quarterTurn) width else height,
            bitRate = bitRate,
            frameRate = format.intOrNull(MediaFormat.KEY_FRAME_RATE)?.toFloat(),
        )
    }

    private fun codecOf(mime: String?): VideoSourceCodec = when (mime) {
        MediaFormat.MIMETYPE_VIDEO_AVC -> VideoSourceCodec.H264
        MediaFormat.MIMETYPE_VIDEO_HEVC -> VideoSourceCodec.HEVC
        else -> VideoSourceCodec.OTHER
    }

    private fun MediaFormat.intOrNull(key: String): Int? =
        if (containsKey(key)) runCatching { getInteger(key) }.getOrNull() else null

    private fun MediaFormat.longOrNull(key: String): Long? =
        if (containsKey(key)) runCatching { getLong(key) }.getOrNull() else null

    private companion object {
        const val HALF_TURN = 180
        const val BITS = 8L
        const val MICROS = 1_000_000L
    }
}

/** Le ré-encodage HEVC suppose un décodeur MATÉRIEL HEVC (le logiciel existe partout et ne dit rien). */
internal class MediaCodecVideoCapabilities : VideoCodecCapabilities {

    private val hardwareHevc: Boolean by lazy { detect() }

    override fun hasHardwareHevc(): Boolean = hardwareHevc

    private fun detect(): Boolean = runCatching {
        MediaCodecList(MediaCodecList.ALL_CODECS).codecInfos.any { info ->
            !info.isEncoder &&
                info.supportedTypes.any { it.equals(MediaFormat.MIMETYPE_VIDEO_HEVC, ignoreCase = true) } &&
                HardwareDecoderHeuristic.isHardware(
                    name = info.name,
                    hardwareAccelerated = info.hardwareAccelerated(),
                    softwareOnly = info.softwareOnly(),
                )
        }
    }.getOrDefault(false)

    private fun MediaCodecInfo.hardwareAccelerated(): Boolean? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) isHardwareAccelerated else null

    private fun MediaCodecInfo.softwareOnly(): Boolean? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) isSoftwareOnly else null
}
