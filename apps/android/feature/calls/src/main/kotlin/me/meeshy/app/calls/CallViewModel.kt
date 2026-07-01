package me.meeshy.app.calls

import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import me.meeshy.sdk.model.call.CallEvent
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.model.call.CallStateMachine
import javax.inject.Inject

/**
 * UDF ViewModel driving the pure [CallStateMachine]. It owns the current
 * [CallState] and the local [CallMedia] intent, folds intents/signals through
 * the FSM, and republishes an immutable [CallUiState] via [CallPresenter].
 *
 * All decisions live in the FSM and the presenter; this class is thin
 * orchestration (SDK-purity rule). Every transition is deterministic and
 * synchronous, so no [androidx.lifecycle.viewModelScope] work is needed yet —
 * the WebRTC/signalling plumbing lands in the next slice.
 */
@HiltViewModel
class CallViewModel @Inject constructor() : ViewModel() {

    private var config: CallConfig = CallConfig.EMPTY
    private var media: CallMedia = CallMedia()
    private var callState: CallState = CallState.Idle

    private val _state = MutableStateFlow(CallPresenter.present(callState, config, media))
    val state: StateFlow<CallUiState> = _state.asStateFlow()

    /**
     * Begin a call for [config]. Inert unless the FSM is idle, so a re-entrant
     * `start` (e.g. a recomposition re-firing the launch effect) never resets a
     * call already in flight. Resets the local media intent to the call's kind.
     */
    fun start(config: CallConfig) {
        if (!callState.canStart) return
        this.config = config
        this.media = CallMedia(isCameraOn = config.isVideo)
        dispatch(if (config.isOutgoing) CallEvent.StartOutgoing else CallEvent.ReceiveIncoming)
    }

    /** Local user accepts an incoming call. */
    fun accept() = dispatch(CallEvent.LocalAnswer)

    /** Local user declines an incoming call. */
    fun decline() = dispatch(CallEvent.Reject)

    /** Local user hangs up an active call. */
    fun hangUp() = dispatch(CallEvent.LocalHangUp)

    /** Feed a signalling/remote event (peer joined, answer, stall, remote end…). */
    fun onSignal(event: CallEvent) = dispatch(event)

    /** Toggle the local microphone mute. */
    fun toggleMute() {
        media = media.copy(isMuted = !media.isMuted)
        publish()
    }

    /** Toggle the local camera (only meaningful on a video call). */
    fun toggleCamera() {
        media = media.copy(isCameraOn = !media.isCameraOn)
        publish()
    }

    /** Settle a terminal call back to idle (dismissing the ended screen). */
    fun dismiss() = dispatch(CallEvent.Settle)

    private fun dispatch(event: CallEvent) {
        callState = CallStateMachine.reduce(callState, event)
        publish()
    }

    private fun publish() {
        _state.value = CallPresenter.present(callState, config, media)
    }
}
