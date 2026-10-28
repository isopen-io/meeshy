package me.meeshy.ui.component.capture

import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMetadataRetriever
import android.media.MediaMuxer
import java.io.File
import java.nio.ByteBuffer

/**
 * Valider concatène des pistes DÉJÀ encodées : les échantillons passent d'un fichier à l'autre sans ré-encodage,
 * la sortie est quasi instantanée quelle que soit la durée (doctrine de la planche `4b`). À appeler HORS du fil principal.
 *
 * Tous les segments d'une prise sortent du même enregistreur, donc du même codec et des mêmes dimensions : le premier
 * fichier fixe les pistes du conteneur, les suivants s'y ajoutent avec un décalage de temps.
 */
public object CaptureSegmentMerger {
    private const val DEFAULT_BUFFER = 1 shl 20

    /** Rend [output] ; `false` si un segment est illisible (l'appelant garde alors les fichiers d'origine). */
    public fun concat(inputs: List<File>, output: File): Boolean {
        if (inputs.isEmpty()) return false
        val muxer = MediaMuxer(output.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
        val session = Session(muxer)
        return try {
            muxer.setOrientationHint(rotationOf(inputs.first()))
            var offsetUs = 0L
            for (file in inputs) offsetUs += appendTracks(file, session, offsetUs)
            true
        } catch (_: Exception) {
            false
        } finally {
            runCatching { if (session.started) muxer.stop() }
            runCatching { muxer.release() }
        }
    }

    private class Session(val muxer: MediaMuxer) {
        val tracks = mutableMapOf<String, Int>()
        var started = false
    }

    private fun rotationOf(file: File): Int {
        val retriever = MediaMetadataRetriever()
        return try {
            retriever.setDataSource(file.absolutePath)
            retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toIntOrNull() ?: 0
        } finally {
            retriever.release()
        }
    }

    /** Copie les échantillons de [file] décalés de [offsetUs] ; rend la durée que ce fichier ajoute. */
    private fun appendTracks(file: File, session: Session, offsetUs: Long): Long {
        val extractor = MediaExtractor()
        try {
            extractor.setDataSource(file.absolutePath)
            val mapping = mutableMapOf<Int, Int>()
            var durationUs = 0L
            for (index in 0 until extractor.trackCount) {
                val format = extractor.getTrackFormat(index)
                val mime = format.getString(MediaFormat.KEY_MIME) ?: continue
                val kind = if (mime.startsWith("video/")) "video" else if (mime.startsWith("audio/")) "audio" else continue
                val outIndex = session.tracks.getOrPut(kind) {
                    check(!session.started) { "track $kind absent from the first segment" }
                    session.muxer.addTrack(format)
                }
                mapping[index] = outIndex
                extractor.selectTrack(index)
                if (format.containsKey(MediaFormat.KEY_DURATION)) durationUs = maxOf(durationUs, format.getLong(MediaFormat.KEY_DURATION))
            }
            if (!session.started) {
                session.muxer.start()
                session.started = true
            }
            return copy(extractor, session.muxer, mapping, offsetUs, durationUs)
        } finally {
            extractor.release()
        }
    }

    private fun copy(extractor: MediaExtractor, muxer: MediaMuxer, mapping: Map<Int, Int>, offsetUs: Long, durationUs: Long): Long {
        val buffer = ByteBuffer.allocate(DEFAULT_BUFFER)
        val info = MediaCodec.BufferInfo()
        var lastUs = 0L
        while (true) {
            val size = extractor.readSampleData(buffer, 0)
            if (size < 0) break
            val outTrack = mapping[extractor.sampleTrackIndex]
            if (outTrack != null) {
                info.set(0, size, extractor.sampleTime + offsetUs, bufferFlags(extractor.sampleFlags))
                muxer.writeSampleData(outTrack, buffer, info)
                lastUs = maxOf(lastUs, extractor.sampleTime)
            }
            extractor.advance()
        }
        return maxOf(durationUs, lastUs)
    }

    /** Seul le drapeau d'image clé se transpose : les autres bits de l'extracteur ne veulent pas dire la même chose au muxer. */
    private fun bufferFlags(sampleFlags: Int): Int =
        if ((sampleFlags and MediaExtractor.SAMPLE_FLAG_SYNC) != 0) MediaCodec.BUFFER_FLAG_KEY_FRAME else 0
}
