package me.meeshy.sdk.talkie

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.MediaRecorder
import androidx.core.content.ContextCompat
import java.nio.ByteOrder
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.playback.RecordingSource
import me.meeshy.sdk.model.relation.TalkieAdts
import me.meeshy.sdk.model.relation.TalkieWaveLaw
import me.meeshy.sdk.playback.RecordingSessionController
import timber.log.Timber

/**
 * Le micro du talkie (#17150, iso `TalkieMicCapture.swift`) : `AudioRecord` capte en PCM 16 bits mono, `MediaCodec`
 * encode en AAC-LC mono 64 kb/s, chaque paquet part en trame ADTS autonome ([TalkieAdts.frame]) — l'encodage que lisent
 * les trois récepteurs. La session audio se prend par [RecordingSessionController], le chemin des vocaux : le son de
 * Meeshy baisse, et pendant un appel le micro ne s'ouvre pas. Sans la permission micro, rien ne tourne.
 *
 * Le niveau de la voix captée nourrit [TalkieLevelMeter.outgoing], que l'onde de l'en-tête lit à chaque image.
 */
class TalkieMicCapture(
    private val context: Context,
    private val session: RecordingSessionController,
    private val meter: TalkieLevelMeter = TalkieLevelMeter.outgoing,
) : TalkieCapturing {

    private class Running(val record: AudioRecord, val codec: MediaCodec, val pump: Job, val delivery: Job, val frames: Channel<ByteArray>)

    private var running: Running? = null

    override suspend fun start(onFrame: (data: ByteArray, durationMs: Double) -> Unit): Boolean {
        if (running != null || !permitted()) return false
        if (!session.begin(RecordingSource.VoiceMessage)) return false
        val opened = withContext(Dispatchers.IO) { open() }
        if (opened == null) {
            session.finish()
            return false
        }
        val (record, codec) = opened
        val frames = Channel<ByteArray>(Channel.UNLIMITED)
        val caller = CoroutineScope(currentCoroutineContext().minusKey(Job))
        val pump = CoroutineScope(Dispatchers.IO).launch { pump(record, codec, frames) }
        val delivery = caller.launch { for (frame in frames) onFrame(frame, FRAME_DURATION_MS) }
        running = Running(record, codec, pump, delivery, frames)
        return true
    }

    override suspend fun stop() {
        val current = running ?: return
        running = null
        current.pump.cancel()
        current.pump.join()
        withContext(Dispatchers.IO) { release(current.record, current.codec) }
        current.frames.close()
        current.delivery.join()
        meter.reset()
        session.finish()
    }

    private fun permitted(): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

    @SuppressLint("MissingPermission")
    private fun open(): Pair<AudioRecord, MediaCodec>? = runCatching {
        val minBuffer = AudioRecord.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        val record = AudioRecord(
            MediaRecorder.AudioSource.VOICE_COMMUNICATION,
            SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
            maxOf(minBuffer, PCM_CHUNK_BYTES * 4),
        )
        if (record.state != AudioRecord.STATE_INITIALIZED) {
            record.release()
            return null
        }
        val format = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, SAMPLE_RATE, 1).apply {
            setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
            setInteger(MediaFormat.KEY_BIT_RATE, BIT_RATE)
            setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, PCM_CHUNK_BYTES * 2)
        }
        val codec = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC)
        codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        codec.start()
        record.startRecording()
        record to codec
    }.onFailure { Timber.w(it, "talkie · micro indisponible") }.getOrNull()

    /** La boucle du micro : lire, mesurer, encoder, vider. À l'annulation, la fin du flux est encodée et vidée. */
    private suspend fun pump(record: AudioRecord, codec: MediaCodec, frames: Channel<ByteArray>) {
        val pcm = ShortArray(PCM_CHUNK_BYTES / 2)
        val info = MediaCodec.BufferInfo()
        while (currentCoroutineContext().isActive) {
            val read = record.read(pcm, 0, pcm.size)
            if (read <= 0) continue
            meter.push(TalkieWaveLaw.rms(pcm, read))
            feed(codec, pcm, read, endOfStream = false)
            drain(codec, info, frames)
        }
        feed(codec, pcm, 0, endOfStream = true)
        drain(codec, info, frames, untilEnd = true)
    }

    private fun feed(codec: MediaCodec, pcm: ShortArray, count: Int, endOfStream: Boolean) {
        val index = codec.dequeueInputBuffer(INPUT_TIMEOUT_US)
        if (index < 0) return
        val buffer = codec.getInputBuffer(index) ?: return
        buffer.clear()
        buffer.order(ByteOrder.nativeOrder()).asShortBuffer().put(pcm, 0, count)
        val flags = if (endOfStream) MediaCodec.BUFFER_FLAG_END_OF_STREAM else 0
        codec.queueInputBuffer(index, 0, count * 2, System.nanoTime() / 1_000, flags)
    }

    private fun drain(codec: MediaCodec, info: MediaCodec.BufferInfo, frames: Channel<ByteArray>, untilEnd: Boolean = false) {
        repeat(MAX_DRAIN_STEPS) {
            val index = codec.dequeueOutputBuffer(info, if (untilEnd) INPUT_TIMEOUT_US else 0L)
            if (index < 0) {
                if (!untilEnd || index == MediaCodec.INFO_TRY_AGAIN_LATER) return
                return@repeat
            }
            val ended = info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0
            val config = info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0
            if (!config && info.size > 0) {
                val packet = ByteArray(info.size)
                codec.getOutputBuffer(index)?.apply { position(info.offset); get(packet) }
                TalkieAdts.frame(packet, SAMPLE_RATE, 1)?.let { frames.trySend(it) }
            }
            codec.releaseOutputBuffer(index, false)
            if (ended) return
        }
    }

    private fun release(record: AudioRecord, codec: MediaCodec) {
        runCatching { record.stop() }
        record.release()
        runCatching { codec.stop() }
        codec.release()
    }

    private companion object {
        /** Une fréquence que tout appareil Android capte et que la table ADTS connaît. */
        const val SAMPLE_RATE = 44_100
        const val BIT_RATE = 64_000
        const val PCM_CHUNK_BYTES = 2_048
        const val INPUT_TIMEOUT_US = 10_000L
        const val MAX_DRAIN_STEPS = 32
        const val FRAME_DURATION_MS = 1_024.0 * 1_000.0 / SAMPLE_RATE
    }
}
