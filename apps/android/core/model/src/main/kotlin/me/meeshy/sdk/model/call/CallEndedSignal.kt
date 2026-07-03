package me.meeshy.sdk.model.call

/**
 * The identity-carrying decode of an inbound teardown frame (`call:ended` /
 * `call:missed`): the id of the call that ended plus the [CallEvent] the
 * [CallStateMachine] reduces **iff** that id is the *active* call's.
 *
 * Why identity matters. The gateway fans a `call:ended` out to every member USER
 * room, so a busy user (one call active, a second ringing as a call-waiting
 * banner) receives the *waiting* call's teardown too. The FSM-facing
 * [CallSignalMapper.map] deliberately discards identity, so folding its
 * [CallEvent.RemoteHangUp] / [CallEvent.RingTimeout] blindly into the active FSM
 * would tear the **wrong** call down. This signal keeps the id alongside the
 * event so the consumer can gate the FSM teardown on the active call's id and
 * merely dismiss the banner when the *waiting* call's id ends.
 */
data class CallEndedSignal(val callId: String, val event: CallEvent)
