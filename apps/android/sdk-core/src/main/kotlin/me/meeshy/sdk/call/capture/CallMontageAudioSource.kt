package me.meeshy.sdk.call.capture

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder

/** Le format du son du film (iOS `CallMontageAudioFormat`). */
public data class CallMontageAudioFormat(public val sampleRate: Int, public val channels: Int)

/** Un tampon PCM 16 bits du micro, daté sur l'horloge hôte commune ([startUs], iOS `CallMontageAudioChunk`). */
public class CallMontageAudioChunk(
    public val pcm: ByteArray,
    public val format: CallMontageAudioFormat,
    public val startUs: Long,
)

/** Ce qui capte le son du film : le micro en production (iOS `CallMontageAudioSourcing`). */
public interface CallMontageAudioSource {
    public val format: CallMontageAudioFormat?

    /** `false` : le micro n'est pas disponible, le film part muet. */
    public fun start(onChunk: (CallMontageAudioChunk) -> Unit): Boolean

    public fun stop()
}

/** Une entrée PCM 16 bits (un `AudioRecord` en production). */
public interface CallMontagePcmInput {
    public fun start(): Boolean

    /** Octets lus ; négatif : l'entrée est fermée. */
    public fun read(buffer: ByteArray): Int

    public fun stop()

    public fun release()
}

public fun interface CallMontagePcmInputFactory {
    /** `null` : refusée (permission, matériel occupé). */
    public fun open(format: CallMontageAudioFormat): CallMontagePcmInput?
}

/**
 * Le micro du film par un `AudioRecord` INDÉPENDANT du pipeline WebRTC (iOS `CallMontageMicrophoneTap`, un
 * `AVAudioEngine` à part) : source MIC, jamais VOICE_COMMUNICATION, pour ne pas toucher à l'annulation d'écho
 * de l'appel. Chaque tampon est daté sur [clock], l'horloge des images. Un micro refusé ou occupé rend `false` :
 * le film part sans son, l'appel n'est jamais touché.
 */
public class CallMontageMicrophone(
    private val clock: CallMontageClock,
    override val format: CallMontageAudioFormat = DEFAULT_FORMAT,
    private val inputs: CallMontagePcmInputFactory = AudioRecordInputFactory,
    private val launcher: (Runnable) -> Unit = { Thread(it, "call-montage-mic").start() },
) : CallMontageAudioSource {
    private var input: CallMontagePcmInput? = null

    @Volatile
    private var listening = false

    override fun start(onChunk: (CallMontageAudioChunk) -> Unit): Boolean {
        if (listening) return true
        val opened = runCatching { inputs.open(format) }.getOrNull() ?: return false
        val started = runCatching { opened.start() }.getOrDefault(false)
        if (!started) {
            runCatching { opened.release() }
            return false
        }
        input = opened
        listening = true
        launcher(Runnable { pump(opened, onChunk) })
        return true
    }

    override fun stop() {
        listening = false
        val closing = input ?: return
        input = null
        runCatching { closing.stop() }
        runCatching { closing.release() }
    }

    private fun pump(source: CallMontagePcmInput, onChunk: (CallMontageAudioChunk) -> Unit) {
        val stamper = CallMontageAudioStamper()
        val buffer = ByteArray(CHUNK_BYTES)
        val frameBytes = BYTES_PER_SAMPLE * format.channels
        while (listening) {
            val count = runCatching { source.read(buffer) }.getOrDefault(-1)
            if (count < 0) break
            val frames = count / frameBytes
            val startUs = stamper.stamp(frames, format.sampleRate, clock.nowUs()) ?: continue
            runCatching { onChunk(CallMontageAudioChunk(buffer.copyOf(frames * frameBytes), format, startUs)) }
        }
    }

    public companion object {
        public val DEFAULT_FORMAT: CallMontageAudioFormat = CallMontageAudioFormat(sampleRate = 44_100, channels = 1)
        private const val CHUNK_BYTES = 4_096
        private const val BYTES_PER_SAMPLE = 2
    }
}

private object AudioRecordInputFactory : CallMontagePcmInputFactory {
    @SuppressLint("MissingPermission")
    override fun open(format: CallMontageAudioFormat): CallMontagePcmInput? {
        val channelMask = if (format.channels == 1) AudioFormat.CHANNEL_IN_MONO else AudioFormat.CHANNEL_IN_STEREO
        val minimum = AudioRecord.getMinBufferSize(format.sampleRate, channelMask, AudioFormat.ENCODING_PCM_16BIT)
        if (minimum <= 0) return null
        val record = try {
            AudioRecord(
                MediaRecorder.AudioSource.MIC,
                format.sampleRate,
                channelMask,
                AudioFormat.ENCODING_PCM_16BIT,
                minimum * 2,
            )
        } catch (denied: SecurityException) {
            return null
        }
        if (record.state != AudioRecord.STATE_INITIALIZED) {
            record.release()
            return null
        }
        return object : CallMontagePcmInput {
            override fun start(): Boolean {
                record.startRecording()
                return record.recordingState == AudioRecord.RECORDSTATE_RECORDING
            }

            override fun read(buffer: ByteArray): Int = record.read(buffer, 0, buffer.size)

            override fun stop() = record.stop()

            override fun release() = record.release()
        }
    }
}
