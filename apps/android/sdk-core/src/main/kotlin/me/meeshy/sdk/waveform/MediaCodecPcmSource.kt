package me.meeshy.sdk.waveform

import android.content.Context
import android.media.AudioFormat
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri
import me.meeshy.sdk.model.waveform.PcmEncoding
import me.meeshy.sdk.model.waveform.WaveformLocation
import java.io.IOException
import java.nio.ByteBuffer

/**
 * **Le décodeur de la plateforme, de la piste audio au PCM.** `MediaExtractor` isole la première
 * piste audio du conteneur (voix `.m4a`, son importé, audio d'une vidéo) et `MediaCodec` la
 * décode : c'est l'équivalent Android de la voie `AVAssetReader` d'iOS, pour tout ce qu'un
 * `.wav` PCM ne couvre pas.
 *
 * Le format de SORTIE du décodeur fait foi (fréquence, canaux, codage) : un flux HE-AAC annonce la
 * moitié de la fréquence qu'il rend, et estimer les compartiments depuis l'entrée y replierait la
 * moitié du son dans le dernier. Entrée/sortie restent entrelacées dans une seule boucle, sans
 * thread ni rappel — la mesure appartient à son appelant, qui l'annule entre deux blocs.
 */
internal class MediaCodecPcmSource private constructor(
    private val extractor: MediaExtractor,
    private val codec: MediaCodec,
    private val durationUs: Long,
    inputFormat: MediaFormat,
    private val checkActive: () -> Unit,
) : PcmSource {

    private val info = MediaCodec.BufferInfo()
    private var scratch = ByteArray(0)
    private var inputDone = false
    private var outputDone = false
    private var channelCount = inputFormat.integerOr(MediaFormat.KEY_CHANNEL_COUNT, 1)
    private var sampleRate = inputFormat.integerOr(MediaFormat.KEY_SAMPLE_RATE, 44_100)
    private var encoding = PcmEncoding.PCM_16BIT

    override fun estimatedFrames(sampleRate: Int): Long = durationUs * sampleRate / MICROS_PER_SECOND

    override fun nextChunk(): PcmChunk? {
        var idle = 0
        while (!outputDone) {
            checkActive()
            val fed = feedInput()
            val index = codec.dequeueOutputBuffer(info, if (fed) 0L else OUTPUT_TIMEOUT_US)
            when {
                index >= 0 -> {
                    idle = 0
                    val chunk = drain(index)
                    codec.releaseOutputBuffer(index, false)
                    if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) outputDone = true
                    if (chunk != null) return chunk
                }
                index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
                    idle = 0
                    readOutputFormat(codec.outputFormat)
                }
                fed -> idle = 0
                else -> if (++idle > MAX_IDLE_ROUNDS) throw IOException("decoder stalled")
            }
        }
        return null
    }

    private fun feedInput(): Boolean {
        if (inputDone) return false
        val index = codec.dequeueInputBuffer(0)
        if (index < 0) return false
        val buffer = checkNotNull(codec.getInputBuffer(index)) { "no input buffer" }
        val size = extractor.readSampleData(buffer, 0)
        if (size < 0) {
            codec.queueInputBuffer(index, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
            inputDone = true
        } else {
            codec.queueInputBuffer(index, 0, size, extractor.sampleTime, 0)
            extractor.advance()
        }
        return true
    }

    private fun drain(index: Int): PcmChunk? {
        if (info.size <= 0) return null
        val buffer: ByteBuffer = codec.getOutputBuffer(index) ?: return null
        buffer.position(info.offset)
        buffer.limit(info.offset + info.size)
        if (scratch.size < info.size) scratch = ByteArray(info.size)
        buffer.get(scratch, 0, info.size)
        return PcmChunk(scratch, info.size, channelCount, sampleRate, encoding)
    }

    private fun readOutputFormat(format: MediaFormat) {
        channelCount = format.integerOr(MediaFormat.KEY_CHANNEL_COUNT, channelCount)
        sampleRate = format.integerOr(MediaFormat.KEY_SAMPLE_RATE, sampleRate)
        encoding = when (format.integerOr(MediaFormat.KEY_PCM_ENCODING, AudioFormat.ENCODING_PCM_16BIT)) {
            AudioFormat.ENCODING_PCM_16BIT -> PcmEncoding.PCM_16BIT
            AudioFormat.ENCODING_PCM_FLOAT -> PcmEncoding.PCM_FLOAT
            else -> throw IOException("unsupported PCM encoding")
        }
    }

    override fun close() {
        runCatching { codec.stop() }
        runCatching { codec.release() }
        runCatching { extractor.release() }
    }

    companion object {
        private const val MICROS_PER_SECOND = 1_000_000L
        private const val OUTPUT_TIMEOUT_US = 10_000L
        private const val MAX_IDLE_ROUNDS = 500
        private const val SCAN_BUFFER_BYTES = 1 shl 20

        /**
         * Ouvre la première piste audio de [location], ou `null` s'il n'y en a aucune. Lève si le
         * conteneur ou le codec n'est pas lisible : l'extracteur en fait un relevé vide.
         */
        fun open(context: Context, location: WaveformLocation, checkActive: () -> Unit): MediaCodecPcmSource? {
            val extractor = MediaExtractor()
            var codec: MediaCodec? = null
            try {
                when (location) {
                    is WaveformLocation.Local -> extractor.setDataSource(location.path)
                    is WaveformLocation.Remote -> extractor.setDataSource(context, Uri.parse(location.address), null)
                }
                val track = audioTrack(extractor) ?: run {
                    extractor.release()
                    return null
                }
                extractor.selectTrack(track)
                val format = extractor.getTrackFormat(track)
                val mime = checkNotNull(format.getString(MediaFormat.KEY_MIME))
                val duration = format.durationUs().takeIf { it > 0 } ?: scanDurationUs(extractor)
                val decoder = MediaCodec.createDecoderByType(mime)
                codec = decoder
                decoder.configure(format, null, null, 0)
                decoder.start()
                return MediaCodecPcmSource(extractor, decoder, duration, format, checkActive)
            } catch (failure: Exception) {
                runCatching { codec?.release() }
                runCatching { extractor.release() }
                throw failure
            }
        }

        private fun audioTrack(extractor: MediaExtractor): Int? = (0 until extractor.trackCount).firstOrNull {
            extractor.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true
        }

        /** Un conteneur sans durée (ADTS brut) : on parcourt ses échantillons, sans les décoder. */
        private fun scanDurationUs(extractor: MediaExtractor): Long {
            val buffer = ByteBuffer.allocate(SCAN_BUFFER_BYTES)
            var last = 0L
            while (extractor.readSampleData(buffer, 0) >= 0) {
                last = maxOf(last, extractor.sampleTime)
                extractor.advance()
            }
            extractor.seekTo(0, MediaExtractor.SEEK_TO_CLOSEST_SYNC)
            return last
        }

        private fun MediaFormat.durationUs(): Long = try {
            if (containsKey(MediaFormat.KEY_DURATION)) getLong(MediaFormat.KEY_DURATION) else 0L
        } catch (_: ClassCastException) {
            0L
        }

        private fun MediaFormat.integerOr(key: String, fallback: Int): Int = try {
            if (containsKey(key)) getInteger(key) else fallback
        } catch (_: ClassCastException) {
            fallback
        }
    }
}
