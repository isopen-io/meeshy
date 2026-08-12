package me.meeshy.app.calls

import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharedFlow
import me.meeshy.sdk.model.call.WaitingCall
import me.meeshy.sdk.socket.CallSignalManager
import javax.inject.Inject

/**
 * App-lifetime bridge that surfaces the realtime socket's incoming-call offers to
 * the root navigation, so a `call:initiated` frame rings the callee while the app
 * is foregrounded — the Android analogue of iOS `CallManager.shared` observed at
 * the app root.
 *
 * The screen-scoped [CallViewModel] also collects [CallSignalManager.incomingOffers],
 * but only folds them for **call-waiting** (a second offer while a call is already
 * active, gated on `callState.isActive`); nothing surfaced the *first* offer at
 * rest, which is why an incoming call never rang. This view model is that missing
 * app-level observer: it merely re-exposes the hot offer stream so the root nav can
 * deep-link into the incoming-call screen, which drives the FSM → ringtone + accept
 * / decline UI on its own.
 */
@HiltViewModel
class IncomingCallViewModel @Inject constructor(
    signalManager: CallSignalManager,
) : ViewModel() {
    /** Hot, no-replay — mirrors [CallSignalManager.incomingOffers]. */
    val incomingOffers: SharedFlow<WaitingCall> = signalManager.incomingOffers
}
