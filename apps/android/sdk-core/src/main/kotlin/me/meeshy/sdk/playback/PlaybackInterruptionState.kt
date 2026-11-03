package me.meeshy.sdk.playback

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Ce qui a interrompu la lecture de Meeshy. */
public enum class InterruptionCause {
    /** Une autre application (ou un appel système) a pris le focus audio. */
    Focus,

    /** Un appel Meeshy tient la session. */
    Call,
}

/** L'interruption en cours, ou aucune. */
public data class PlaybackInterruption(val cause: InterruptionCause? = null) {
    public val isInterrupted: Boolean get() = cause != null
}

/**
 * **L'interruption publiée comme un ÉTAT**, pas comme un événement : un lecteur monté PENDANT
 * l'interruption (un minuteur de story qui se fige puis reprend en place) la lit à son montage au
 * lieu d'avoir manqué le signal.
 */
public class PlaybackInterruptionState {
    private val mutable = MutableStateFlow(PlaybackInterruption())

    public val current: StateFlow<PlaybackInterruption> = mutable.asStateFlow()

    public fun begin(cause: InterruptionCause) {
        mutable.value = PlaybackInterruption(cause)
    }

    public fun end() {
        mutable.value = PlaybackInterruption()
    }
}
