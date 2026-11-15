package me.meeshy.sdk.talkie

import android.media.MediaCodec
import android.media.MediaFormat
import android.media.MediaMuxer
import java.io.File
import java.nio.ByteBuffer
import me.meeshy.sdk.model.relation.AdtsFrame
import me.meeshy.sdk.model.relation.TalkieAdts
import timber.log.Timber

/**
 * La copie vocale sur le disque (#17141, iso `TalkieVoiceCopyFile`) : les trames ADTS captées, réécrites SANS
 * réencodage dans un conteneur `.m4a` — le format des vocaux de Meeshy. Le fichier est FERMÉ avant de rendre la main
 * (#17255 : un `.m4a` sans son atome `moov` se lisait « 128 ms ») ; la durée rendue est celle des trames écrites.
 */
object TalkieVoiceCopyFile {
    private const val SAMPLES_PER_FRAME = 1_024L

    /** La durée écrite (ms), ou `null` : aucune trame lisible, ou l'écriture a échoué (le fichier est alors retiré). */
    fun write(frames: List<ByteArray>, file: File): Long? {
        val parsed = frames.flatMap { TalkieAdts.frames(it) }
        val first = parsed.firstOrNull() ?: return null
        val sampleRate = first.format.sampleRate ?: return null
        val kept = parsed.filter { it.format == first.format }
        val written = runCatching { mux(kept, first, sampleRate, file) }
            .onFailure { Timber.w(it, "talkie · copie vocale illisible") }
            .isSuccess
        if (!written) {
            file.delete()
            return null
        }
        return kept.size * SAMPLES_PER_FRAME * 1_000L / sampleRate
    }

    private fun mux(frames: List<AdtsFrame>, first: AdtsFrame, sampleRate: Int, file: File) {
        val format = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, sampleRate, first.format.channels).apply {
            setByteBuffer("csd-0", ByteBuffer.wrap(first.format.audioSpecificConfig))
        }
        val muxer = MediaMuxer(file.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
        try {
            val track = muxer.addTrack(format)
            muxer.start()
            val info = MediaCodec.BufferInfo()
            frames.forEachIndexed { index, frame ->
                info.set(0, frame.payload.size, index * SAMPLES_PER_FRAME * 1_000_000L / sampleRate, MediaCodec.BUFFER_FLAG_KEY_FRAME)
                muxer.writeSampleData(track, ByteBuffer.wrap(frame.payload), info)
            }
            muxer.stop()
        } finally {
            muxer.release()
        }
    }
}
