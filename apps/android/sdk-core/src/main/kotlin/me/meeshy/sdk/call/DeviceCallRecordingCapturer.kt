package me.meeshy.sdk.call

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import me.meeshy.sdk.model.call.CallRecordingKind
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

/**
 * La projection d'écran dont l'enregistrement VIDÉO dispose, ou `null`. Posée par `:feature:calls`, qui tient le
 * service de premier plan et l'accord du système : ici on ne demande rien, on prend ce qui a été accordé.
 */
public fun interface CallRecordingProjectionSource {
    public fun current(): CallScreenFrame?
}

/**
 * Ce qui CAPTE un appel enregistré, sur l'appareil de celui qui l'a demandé (#14553). Aucune capture ne démarre
 * ailleurs que dans [start], que seul `CallRecordingController` appelle sur la diffusion `call:recording-started`
 * qui nomme ce lecteur enregistreur. Audio : micro + voix des autres en M4A. Vidéo : l'écran en MP4 si une
 * projection a été accordée ; sinon l'audio seul — mieux vaut la voix qu'un échec (iOS retombe de même sur le micro).
 */
@Singleton
public class DeviceCallRecordingCapturer internal constructor(
    private val microphone: kotlinx.coroutines.flow.Flow<CallPcmFrame>,
    private val remote: kotlinx.coroutines.flow.Flow<CallPcmFrame>,
    private val projections: CallRecordingProjectionSource,
    private val scope: CoroutineScope,
    private val writerFactory: () -> CallAacFileWriter,
) : CallRecordingCapturer {
    @Inject
    public constructor(
        microphone: CallMicrophoneSamples,
        remote: CallRemoteAudioSamples,
        projections: CallRecordingProjectionSource,
    ) : this(
        microphone.frames,
        remote.frames,
        projections,
        CoroutineScope(SupervisorJob() + Dispatchers.Default),
        { MediaCodecAacFileWriter() },
    )

    override val isAvailable: Boolean = true

    private var audio: CallAudioRecorder? = null
    private var screen: CallScreenRecorder? = null

    @Synchronized
    override fun start(file: File, kind: CallRecordingKind): Boolean {
        if (audio != null || screen != null) return false
        val recorder = CallAudioRecorder(microphone, remote, writerFactory, scope)
        if (kind == CallRecordingKind.VIDEO && projections.current() != null) {
            val video = CallScreenRecorder(recorder) { projections.current() }
            if (video.start(file)) {
                screen = video
                return true
            }
        }
        if (!recorder.start(file)) return false
        audio = recorder
        return true
    }

    @Synchronized
    override fun stop(): File? {
        val video = screen
        val voice = audio
        screen = null
        audio = null
        return video?.stop() ?: voice?.stop()
    }
}
