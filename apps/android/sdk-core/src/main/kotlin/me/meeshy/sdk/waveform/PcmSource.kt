package me.meeshy.sdk.waveform

import me.meeshy.sdk.model.waveform.PcmEncoding
import me.meeshy.sdk.model.waveform.WaveformAccumulator
import me.meeshy.sdk.model.waveform.WaveformMath
import java.io.File
import java.io.IOException
import java.io.RandomAccessFile
import me.meeshy.sdk.model.waveform.WavHeader

/** Un bloc de PCM entrelacé little-endian. [bytes] est réutilisé d'un bloc à l'autre. */
internal class PcmChunk(
    val bytes: ByteArray,
    val byteCount: Int,
    val channelCount: Int,
    val sampleRate: Int,
    val encoding: PcmEncoding,
)

/**
 * Une source d'audio décodé : le seul contrat que la mesure connaît. Un `.wav` PCM se lit tel quel
 * ([WavPcmSource]) ; tout autre conteneur passe par `MediaExtractor` + `MediaCodec`
 * ([MediaCodecPcmSource]).
 */
internal interface PcmSource : AutoCloseable {
    /** Le nombre de trames attendu à [sampleRate] Hz ; les compartiments en découlent. */
    fun estimatedFrames(sampleRate: Int): Long

    /** Le bloc suivant, ou `null` à la fin du flux. */
    fun nextChunk(): PcmChunk?
}

/**
 * **La mesure, du flux au relevé.** Mono par moyenne des canaux, RMS par compartiment dans un
 * [WaveformAccumulator] — la même arithmétique que les vecteurs de `WaveformMath`. Synchrone côté
 * CPU : l'appelant la pose hors du fil principal et fournit [checkActive], qui lève quand la
 * mesure est annulée.
 */
internal object WaveformStreamMeasurer {

    fun measure(source: PcmSource, count: Int, checkActive: () -> Unit): FloatArray {
        if (count <= 0) return FloatArray(0)
        var accumulator: WaveformAccumulator? = null
        var mono = FloatArray(0)
        while (true) {
            checkActive()
            val chunk = source.nextChunk() ?: break
            val target = accumulator
                ?: WaveformAccumulator(count, source.estimatedFrames(chunk.sampleRate)).also { accumulator = it }
            val frames = chunk.byteCount / (chunk.channelCount * chunk.encoding.bytesPerSample)
            if (mono.size < frames) mono = FloatArray(frames)
            val written = WaveformMath.monoFromInterleaved(
                bytes = chunk.bytes,
                byteCount = chunk.byteCount,
                channelCount = chunk.channelCount,
                encoding = chunk.encoding,
                out = mono,
            )
            target.append(mono, written)
        }
        return accumulator?.result() ?: FloatArray(0)
    }
}

/** Un `.wav` PCM lu par blocs de 64 Ki trames, sans codec. */
internal class WavPcmSource private constructor(
    private val handle: RandomAccessFile,
    private val header: WavHeader,
) : PcmSource {

    private val buffer = ByteArray(CHUNK_FRAMES * header.frameBytes)
    private var remainingBytes = header.totalFrames * header.frameBytes

    override fun estimatedFrames(sampleRate: Int): Long = header.totalFrames

    override fun nextChunk(): PcmChunk? {
        if (remainingBytes <= 0) return null
        val wanted = minOf(buffer.size.toLong(), remainingBytes).toInt()
        var read = 0
        while (read < wanted) {
            val step = handle.read(buffer, read, wanted - read)
            if (step <= 0) break
            read += step
        }
        remainingBytes = if (read < wanted) 0 else remainingBytes - read
        val aligned = read - read % header.frameBytes
        if (aligned == 0) return null
        return PcmChunk(buffer, aligned, header.channelCount, header.sampleRate, header.encoding)
    }

    override fun close() {
        handle.close()
    }

    companion object {
        private const val CHUNK_FRAMES = 65_536
        private const val HEAD_BYTES = 65_536

        /** La source de [file] si c'est un WAV PCM 16 bits ou flottant ; `null` sinon (autre conteneur). */
        fun open(file: File): WavPcmSource? {
            val handle = try {
                RandomAccessFile(file, "r")
            } catch (_: IOException) {
                return null
            }
            try {
                val length = handle.length()
                val head = ByteArray(minOf(length, HEAD_BYTES.toLong()).toInt())
                handle.readFully(head)
                val header = WavHeader.parse(head, length)
                if (header != null) {
                    handle.seek(header.dataOffset.toLong())
                    return WavPcmSource(handle, header)
                }
            } catch (_: IOException) {
                // Illisible : traité comme un autre conteneur.
            }
            handle.close()
            return null
        }
    }
}
