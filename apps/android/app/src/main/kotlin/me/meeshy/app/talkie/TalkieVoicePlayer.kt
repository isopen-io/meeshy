package me.meeshy.app.talkie

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.media.MediaCodec
import android.media.MediaFormat
import dagger.hilt.android.qualifiers.ApplicationContext
import java.nio.ByteBuffer
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import me.meeshy.app.calls.ActiveCallSnapshotHolder
import me.meeshy.sdk.model.relation.AdtsFormat
import me.meeshy.sdk.model.relation.TalkieAdts
import timber.log.Timber

/**
 * La voix d'un talkie, fragment par fragment (#16675, iso `TalkieVoicePlayer.swift`). Chaque fragment AAC ADTS est
 * autonome : ses trames se décodent DÈS son arrivée ([MediaCodec]) et le PCM s'écrit à la suite du précédent sur une
 * [AudioTrack] en flux — le lecteur des vocaux lit des fichiers entiers, celui-ci joue dès le premier fragment.
 *
 * - Le mode silencieux est RESPECTÉ : sonnerie coupée ou vibreur ⇒ rien ne sort (l'indicateur reste, « Couper » aussi).
 * - Pendant un appel, rien ne sort : la passerelle coupe déjà (`cut`), et le son reste à l'appel.
 * - La voix se mêle à ce qui joue déjà en le baissant (focus transitoire « may duck »), jamais en le coupant.
 */
@Singleton
class TalkieVoicePlayer @Inject constructor(
    @ApplicationContext context: Context,
    private val calls: ActiveCallSnapshotHolder,
) : TalkieSink {

    private val audio: AudioManager = context.getSystemService(AudioManager::class.java)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val voices = mutableMapOf<String, Voice>()
    private val attributes = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_MEDIA)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
        .build()
    private val focus = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
        .setAudioAttributes(attributes)
        .build()

    override fun play(talkieId: String, data: ByteArray) {
        if (!mayPlay()) return
        val voice = voices.getOrPut(talkieId) {
            if (voices.isEmpty()) audio.requestAudioFocus(focus)
            Voice(attributes).also { it.start(scope) }
        }
        voice.offer(data)
    }

    override fun silence(talkieId: String) {
        voices.remove(talkieId)?.silence()
        abandonFocusIfIdle()
    }

    override fun release(talkieId: String) {
        voices.remove(talkieId)?.finish()
        abandonFocusIfIdle()
    }

    private fun mayPlay(): Boolean = calls.snapshot.value == null &&
        audio.mode != AudioManager.MODE_IN_CALL &&
        audio.mode != AudioManager.MODE_IN_COMMUNICATION &&
        audio.ringerMode == AudioManager.RINGER_MODE_NORMAL

    private fun abandonFocusIfIdle() {
        if (voices.isEmpty()) audio.abandonAudioFocusRequest(focus)
    }

    /** Une prise de parole : sa file de fragments, son décodeur et sa piste, vivants jusqu'à la fin de sa file. */
    private class Voice(private val attributes: AudioAttributes) {
        private val chunks = Channel<ByteArray>(capacity = MAX_QUEUED_CHUNKS)
        private var job: Job? = null

        @Volatile private var track: AudioTrack? = null
        private var codec: MediaCodec? = null
        private var writtenFrames = 0L
        private var sampleRate = 0

        fun start(scope: CoroutineScope) {
            job = scope.launch {
                try {
                    for (chunk in chunks) decode(chunk)
                    drain()
                } catch (@Suppress("TooGenericExceptionCaught") failure: Exception) {
                    Timber.w("Talkie: lecture interrompue (%s)", failure.javaClass.simpleName)
                } finally {
                    close()
                }
            }
        }

        fun offer(data: ByteArray) {
            chunks.trySend(data)
        }

        /** Rien de plus n'arrivera : la file finit de sonner, puis se libère. */
        fun finish() {
            chunks.close()
        }

        /** Se taire sur-le-champ : la piste est vidée avant même que le décodage ne s'arrête. */
        fun silence() {
            chunks.close()
            job?.cancel()
            track?.runCatching {
                pause()
                flush()
            }
        }

        private fun decode(chunk: ByteArray) {
            TalkieAdts.frames(chunk).forEach { frame ->
                val decoder = codec ?: open(frame.format) ?: return
                queue(decoder, frame.payload)
                pull(decoder)
            }
        }

        private fun open(format: AdtsFormat): MediaCodec? {
            val rate = format.sampleRate ?: return null
            val mediaFormat = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, rate, format.channels).apply {
                setByteBuffer("csd-0", ByteBuffer.wrap(format.audioSpecificConfig))
            }
            val decoder = MediaCodec.createDecoderByType(MediaFormat.MIMETYPE_AUDIO_AAC)
            decoder.configure(mediaFormat, null, null, 0)
            decoder.start()
            codec = decoder
            sampleRate = rate
            track = openTrack(rate, format.channels)
            return decoder
        }

        private fun openTrack(rate: Int, channels: Int): AudioTrack {
            val mask = if (channels >= 2) AudioFormat.CHANNEL_OUT_STEREO else AudioFormat.CHANNEL_OUT_MONO
            val minimum = AudioTrack.getMinBufferSize(rate, mask, AudioFormat.ENCODING_PCM_16BIT)
            return AudioTrack.Builder()
                .setAudioAttributes(attributes)
                .setAudioFormat(
                    AudioFormat.Builder()
                        .setSampleRate(rate)
                        .setChannelMask(mask)
                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .build(),
                )
                .setTransferMode(AudioTrack.MODE_STREAM)
                .setBufferSizeInBytes(minimum * JITTER_BUFFERS)
                .build()
                .also { it.play() }
        }

        private fun queue(decoder: MediaCodec, payload: ByteArray) {
            repeat(INPUT_ATTEMPTS) {
                val index = decoder.dequeueInputBuffer(DEQUEUE_TIMEOUT_US)
                if (index >= 0) {
                    decoder.getInputBuffer(index)?.apply { clear(); put(payload) }
                    decoder.queueInputBuffer(index, 0, payload.size, 0, 0)
                    return
                }
                pull(decoder)
            }
        }

        private fun pull(decoder: MediaCodec, timeoutUs: Long = 0L) {
            val info = MediaCodec.BufferInfo()
            generateSequence { decoder.dequeueOutputBuffer(info, timeoutUs) }
                .takeWhile { it != MediaCodec.INFO_TRY_AGAIN_LATER }
                .filter { it >= 0 }
                .forEach { index ->
                    val pcm = ByteArray(info.size)
                    decoder.getOutputBuffer(index)?.apply { position(info.offset); get(pcm) }
                    decoder.releaseOutputBuffer(index, false)
                    track?.let { piste ->
                        piste.write(pcm, 0, pcm.size)
                        writtenFrames += pcm.size / (BYTES_PER_SAMPLE * piste.channelCount)
                    }
                }
        }

        /** La file est vide : la piste joue ce qui lui reste, puis s'arrête. */
        private suspend fun drain() {
            codec?.let { decoder -> repeat(INPUT_ATTEMPTS) { pull(decoder, DEQUEUE_TIMEOUT_US) } }
            val piste = track ?: return
            piste.stop()
            val deadline = System.currentTimeMillis() + MAX_DRAIN_MS
            while (currentCoroutineContext().isActive && piste.playbackHeadPosition < writtenFrames && System.currentTimeMillis() < deadline) {
                delay(DRAIN_POLL_MS)
            }
        }

        private fun close() {
            codec?.runCatching { stop(); release() }
            codec = null
            track?.runCatching { release() }
            track = null
        }
    }

    private companion object {
        /** Le plafond servi d'une prise de parole (`TALKIE_MAX_CHUNKS`) : la file ne grossit jamais au-delà. */
        const val MAX_QUEUED_CHUNKS = 300
        const val JITTER_BUFFERS = 4
        const val INPUT_ATTEMPTS = 20
        const val DEQUEUE_TIMEOUT_US = 10_000L
        const val BYTES_PER_SAMPLE = 2
        const val MAX_DRAIN_MS = 2_000L
        const val DRAIN_POLL_MS = 40L
    }
}
