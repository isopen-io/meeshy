package me.meeshy.sdk.playback

import me.meeshy.sdk.call.CallActivityGate
import me.meeshy.sdk.model.playback.MediaSessionEvent

/**
 * **Le passage de relais avec les appels Meeshy** : un appel décroché met en pause (marquée
 * interrompue) chaque lecteur capable de reprendre — ils reprennent au raccrochage —, arrête les
 * autres et les enregistreurs (la prise est gardée), et rend le focus sans le disputer à l'appel.
 */
public class CallHandoff(
    private val playback: PlaybackCoordinator,
    private val focus: AudioFocusCoordinator,
    private val interruption: PlaybackInterruptionState,
    private val recorders: RecorderCallGuard,
    private val gate: CallActivityGate,
) {
    private var inCall = false

    public fun onCallStarted() {
        if (inCall) return
        inCall = true
        gate.setActive(true)
        focus.yieldToCall()
        interruption.begin(InterruptionCause.Call)
        recorders.stopAllForCall()
        playback.interruptAllForCall()
    }

    public fun onCallEnded() {
        if (!inCall) return
        inCall = false
        gate.setActive(false)
        interruption.end()
        focus.onCallEnded()
        playback.dispatchSessionEvent(MediaSessionEvent.CallEndedShouldResume)
    }
}
