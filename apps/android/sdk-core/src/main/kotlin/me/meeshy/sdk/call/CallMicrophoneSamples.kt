package me.meeshy.sdk.call

import android.media.AudioFormat
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.buffer
import kotlinx.coroutines.flow.callbackFlow
import org.webrtc.audio.JavaAudioDeviceModule
import java.util.concurrent.CopyOnWriteArraySet
import javax.inject.Inject
import javax.inject.Singleton

/** One buffer of my microphone as WebRTC recorded it (about 10 ms of 16-bit little-endian PCM). */
public class CallPcmFrame(public val pcm: ByteArray, public val sampleRate: Int, public val channelCount: Int)

/**
 * The microphone samples the call ALREADY records (#13718): WebRTC holds the microphone, and a
 * second capture beside it either hears silence (concurrent capture, Android 10+) or cuts the call.
 * The audio device module hands every recorded buffer to [callback] (its own copy, on WebRTC's
 * recording thread); they go nowhere unless [frames] is collected, and a slow collector loses the
 * oldest buffers rather than holding the call's thread. Every collector hears every buffer: the
 * captions and the montage film (#13692) listen side by side.
 */
@Singleton
public class CallMicrophoneSamples @Inject constructor() {

    private val sinks = CopyOnWriteArraySet<(CallPcmFrame) -> Unit>()

    internal val callback = JavaAudioDeviceModule.SamplesReadyCallback { samples ->
        deliver(samples.audioFormat, samples.sampleRate, samples.channelCount, samples.data)
    }

    public val frames: Flow<CallPcmFrame> = callbackFlow {
        val mine: (CallPcmFrame) -> Unit = { trySend(it) }
        sinks += mine
        awaitClose { sinks -= mine }
    }.buffer(BACKLOG_FRAMES, BufferOverflow.DROP_OLDEST)

    internal fun deliver(audioFormat: Int, sampleRate: Int, channelCount: Int, pcm: ByteArray) {
        if (audioFormat != AudioFormat.ENCODING_PCM_16BIT || sampleRate <= 0 || channelCount <= 0) return
        if (sinks.isEmpty()) return
        val frame = CallPcmFrame(pcm, sampleRate, channelCount)
        sinks.forEach { it(frame) }
    }

    private companion object {
        /** Two seconds of 10 ms buffers. */
        const val BACKLOG_FRAMES = 200
    }
}
