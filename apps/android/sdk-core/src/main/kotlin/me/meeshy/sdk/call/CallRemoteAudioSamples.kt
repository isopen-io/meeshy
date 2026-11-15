package me.meeshy.sdk.call

import android.media.AudioFormat
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.buffer
import kotlinx.coroutines.flow.callbackFlow
import org.webrtc.audio.JavaAudioDeviceModule
import java.lang.reflect.Proxy
import java.util.concurrent.CopyOnWriteArraySet
import javax.inject.Inject
import javax.inject.Singleton

/**
 * La voix des AUTRES, telle que WebRTC la joue (#14553) : le pendant de [CallMicrophoneSamples] côté lecture.
 * Android sait la taper (iOS non : la voix distante y sort par l'unité VoiceProcessingIO), à condition que la
 * bibliothèque WebRTC embarquée expose `setPlaybackSamplesReadyCallback`. Cette couture est posée par
 * réflexion : sur une bibliothèque qui ne l'a pas, [attachTo] rend `false`, aucun tampon n'arrive et
 * l'enregistrement ne porte que la voix locale — il se dégrade, il ne casse pas l'appel.
 */
@Singleton
public class CallRemoteAudioSamples @Inject constructor() {

    private val sinks = CopyOnWriteArraySet<(CallPcmFrame) -> Unit>()

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

    /** Branche le rappel de lecture sur le constructeur du module audio ; `false` si la bibliothèque ne le connaît pas. */
    internal fun attachTo(builder: JavaAudioDeviceModule.Builder): Boolean = try {
        val callbackType = Class.forName("$MODULE_CLASS\$PlaybackSamplesReadyCallback")
        val setter = builder.javaClass.getMethod(SETTER, callbackType)
        val callback = Proxy.newProxyInstance(callbackType.classLoader, arrayOf(callbackType)) { _, method, args ->
            val samples = args?.firstOrNull() as? JavaAudioDeviceModule.AudioSamples
            if (method.name == CALLBACK && samples != null) {
                runCatching { deliver(samples.audioFormat, samples.sampleRate, samples.channelCount, samples.data) }
            }
            null
        }
        setter.invoke(builder, callback)
        true
    } catch (unavailable: ReflectiveOperationException) {
        false
    } catch (unavailable: LinkageError) {
        false
    }

    private companion object {
        const val MODULE_CLASS = "org.webrtc.audio.JavaAudioDeviceModule"
        const val SETTER = "setPlaybackSamplesReadyCallback"
        const val CALLBACK = "onWebRtcAudioTrackSamplesReady"

        /** Two seconds of 10 ms buffers. */
        const val BACKLOG_FRAMES = 200
    }
}
