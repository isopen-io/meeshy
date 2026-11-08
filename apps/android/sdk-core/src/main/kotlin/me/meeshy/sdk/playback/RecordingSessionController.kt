package me.meeshy.sdk.playback

import me.meeshy.sdk.model.playback.PlaybackDuckLedger
import me.meeshy.sdk.model.playback.RecordingSource
import java.lang.ref.WeakReference

/** Un enregistreur qu'un appel Meeshy arrête (en gardant la prise déjà captée). */
public interface CallInterruptibleRecorder {
    public fun stopForCall()
}

/** iOS `RecorderCallGuard` : les enregistreurs actifs, tenus faiblement, que l'appel arrête. */
public class RecorderCallGuard {
    private val lock = Any()
    private val recorders = ArrayList<WeakReference<CallInterruptibleRecorder>>()

    public fun register(recorder: CallInterruptibleRecorder) {
        synchronized(lock) {
            recorders.removeAll { it.get() == null }
            if (recorders.none { it.get() === recorder }) recorders += WeakReference(recorder)
        }
    }

    public fun unregister(recorder: CallInterruptibleRecorder) {
        synchronized(lock) { recorders.removeAll { it.get() == null || it.get() === recorder } }
    }

    public fun stopAllForCall() {
        val active = synchronized(lock) { recorders.mapNotNull { it.get() } }
        active.forEach { it.stopForCall() }
    }
}

/**
 * **La session d'enregistrement** (iOS `MeeshyRecordingSession` + `RecordingPlaybackDucker`) :
 * [begin] prend le focus en exclusivité transitoire et baisse les lecteurs de Meeshy à 0,3 de leur
 * volume ; [finish] rend EXACTEMENT les volumes et le focus. [begin] refuse sous un appel.
 */
public class RecordingSessionController(
    private val system: AudioFocusSystem,
    private val focus: AudioFocusCoordinator,
    private val playback: PlaybackCoordinator,
    private val recorders: RecorderCallGuard,
    private val isCallActive: () -> Boolean,
) : CallInterruptibleRecorder {

    private var ledger = PlaybackDuckLedger<PlaybackVolumeTarget>()
    private var ducked: List<PlaybackVolumeTarget> = emptyList()

    public var isRecording: Boolean = false
        private set

    public fun begin(@Suppress("UNUSED_PARAMETER") source: RecordingSource): Boolean {
        if (isRecording) return true
        if (isCallActive()) return false
        focus.setRecordingHold(true)
        if (!system.request(FocusKind.Recording) { }) {
            focus.setRecordingHold(false)
            return false
        }
        isRecording = true
        ledger = PlaybackDuckLedger()
        ducked = playback.audibleVolumeTargets
        ducked.forEach { target -> ledger.duck(target, target.volume)?.let { target.volume = it } }
        recorders.register(this)
        return true
    }

    public fun finish() {
        if (!isRecording) return
        isRecording = false
        ducked.forEach { target -> ledger.restore(target, target.volume)?.let { target.volume = it } }
        ducked = emptyList()
        recorders.unregister(this)
        system.abandon(FocusKind.Recording)
        focus.setRecordingHold(false)
    }

    /** Un appel décroche : la prise s'arrête, la session se rend. */
    override fun stopForCall() {
        finish()
    }
}
