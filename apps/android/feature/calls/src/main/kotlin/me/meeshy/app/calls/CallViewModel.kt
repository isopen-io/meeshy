package me.meeshy.app.calls

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.call.CallEvent
import me.meeshy.sdk.model.call.CallInitiateResult
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.model.call.CallStateMachine
import me.meeshy.sdk.socket.CallSignalManager
import javax.inject.Inject

/**
 * UDF ViewModel driving the pure [CallStateMachine], now folded onto the live
 * transport. It owns the current [CallState], the local [CallMedia] intent, and
 * the server [callId] every outbound emit is keyed by, republishing an immutable
 * [CallUiState] via [CallPresenter].
 *
 * Three responsibilities, all thin orchestration over stateless building blocks:
 *  - **Fold in** remote signalling: [CallSignalManager.events] is collected in
 *    [viewModelScope] and each mapped [CallEvent] is reduced through the FSM, so a
 *    peer answer / remote hang-up / stall drives the screen with no manual wiring.
 *  - **Place** an outgoing call: [start] mints the real `callId` via the ACK-based
 *    [CallSignalManager.emitInitiate]; the ring shows instantly (optimistic) and a
 *    rejected / timed-out / malformed ACK settles the call to `Ended(Failed)`.
 *  - **Fan out** local actions: accept/decline/hang-up/mute/camera route to the
 *    matching [CallSignalManager] emit, keyed by the known id (inert until one is).
 *
 * Every *decision* still lives in the FSM, the presenter, and the pure ACK parser
 * behind [CallSignalManager.emitInitiate] — this class only sequences them.
 */
@HiltViewModel
class CallViewModel @Inject constructor(
    private val signalManager: CallSignalManager,
) : ViewModel() {

    private var config: CallConfig = CallConfig.EMPTY
    private var media: CallMedia = CallMedia()
    private var callState: CallState = CallState.Idle

    /** The id every outbound emit is keyed by: from the incoming config, or minted by [start]. */
    private var callId: String = ""

    private val _state = MutableStateFlow(CallPresenter.present(callState, config, media))
    val state: StateFlow<CallUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            signalManager.events.collect(::dispatch)
        }
    }

    /**
     * Begin a call for [config]. Inert unless the FSM is idle, so a re-entrant
     * `start` (e.g. a recomposition re-firing the launch effect) never resets a
     * call already in flight. Resets the local media intent to the call's kind and
     * adopts the config's [CallConfig.callId] (blank for an outgoing call, which
     * mints its own via the ACK).
     */
    fun start(config: CallConfig) {
        if (!callState.canStart) return
        this.config = config
        this.media = CallMedia(isCameraOn = config.isVideo)
        this.callId = config.callId
        if (config.isOutgoing) startOutgoing(config) else dispatch(CallEvent.ReceiveIncoming)
    }

    /**
     * Ring immediately (instant feedback), then place the call over the wire. The
     * initiate ACK mints the real [callId]; a gateway rejection / timeout / bad ACK
     * settles the ringing call to `Ended(Failed)` via the FSM's terminal path.
     */
    private fun startOutgoing(config: CallConfig) {
        dispatch(CallEvent.StartOutgoing)
        viewModelScope.launch {
            when (val result = signalManager.emitInitiate(config.conversationId, config.isVideo)) {
                is CallInitiateResult.Success -> callId = result.ack.callId
                is CallInitiateResult.ServerError -> dispatch(CallEvent.ConnectionFailed(result.message))
                CallInitiateResult.Timeout -> dispatch(CallEvent.ConnectionFailed(INITIATE_TIMED_OUT))
                CallInitiateResult.Malformed -> dispatch(CallEvent.ConnectionFailed(INITIATE_MALFORMED))
            }
        }
    }

    /** Local user accepts an incoming call — answer the FSM and join the call room. */
    fun accept() {
        dispatch(CallEvent.LocalAnswer)
        emitIfIdentified(signalManager::emitJoin)
    }

    /** Local user declines an incoming call — reject the FSM and end it on the wire. */
    fun decline() {
        dispatch(CallEvent.Reject)
        emitIfIdentified(signalManager::emitEnd)
    }

    /** Local user hangs up an active call — end the FSM and the call on the wire. */
    fun hangUp() {
        dispatch(CallEvent.LocalHangUp)
        emitIfIdentified(signalManager::emitEnd)
    }

    /** Feed a signalling/remote event directly (peer joined, answer, stall, remote end…). */
    fun onSignal(event: CallEvent) = dispatch(event)

    /** Toggle the local microphone mute and signal the peer. */
    fun toggleMute() {
        media = media.copy(isMuted = !media.isMuted)
        publish()
        emitIfIdentified { signalManager.emitToggleAudio(it, enabled = !media.isMuted) }
    }

    /** Toggle the local camera (only meaningful on a video call) and signal the peer. */
    fun toggleCamera() {
        media = media.copy(isCameraOn = !media.isCameraOn)
        publish()
        emitIfIdentified { signalManager.emitToggleVideo(it, enabled = media.isCameraOn) }
    }

    /** Settle a terminal call back to idle (dismissing the ended screen). */
    fun dismiss() = dispatch(CallEvent.Settle)

    /** Runs [emit] with the current [callId] only once one is known — inert otherwise. */
    private inline fun emitIfIdentified(emit: (String) -> Unit) {
        if (callId.isNotBlank()) emit(callId)
    }

    private fun dispatch(event: CallEvent) {
        callState = CallStateMachine.reduce(callState, event)
        publish()
    }

    private fun publish() {
        _state.value = CallPresenter.present(callState, config, media)
    }

    private companion object {
        const val INITIATE_TIMED_OUT = "call:initiate timed out"
        const val INITIATE_MALFORMED = "malformed call:initiate ack"
    }
}
