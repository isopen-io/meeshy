package me.meeshy.sdk.model.call

/**
 * The continuous loop that should be audible for a call phase. Faithful port of
 * the iOS `RingbackTonePlayer` loop vocabulary (`RingbackTonePlayer.swift`):
 *
 *  - [Ringback] — the "rrr-rrr" the **caller** hears while the callee has not yet
 *    answered.
 *  - [Ringtone] — the alert the **callee** hears while a call is incoming.
 *  - [None] — silence (idle, negotiating, connected, ended).
 */
enum class CallSound { None, Ringback, Ringtone }

/**
 * A one-shot audio cue fired on a specific lifecycle edge. Port of the iOS
 * `playConnected()` / `playEnded()` system-sound cues.
 */
enum class CallCue { Connected, Ended }

/**
 * The audio the controller should be producing for a single FSM transition:
 * the [loop] that must be active now, plus any one-shot [cue] to fire on this
 * edge (`null` when the edge fires none).
 */
data class CallSoundPlan(val loop: CallSound, val cue: CallCue?)

/**
 * The pure, side-effect-free SSOT mapping call lifecycle → call audio. It is the
 * Android analogue of the decisions the iOS `CallManager` scatters across its
 * `ringbackPlayer.start()/stop()/startRingtone()/playConnected()/playEnded()`
 * call sites — collected here into one total function so every branch is unit
 * tested and the Android tone controller is left as thin, decision-free glue.
 *
 * Design choices vs iOS (SOTA tightening, documented):
 *  - **Ringback spans the whole pre-answer wait** — [CallState.Ringing] outgoing
 *    and [CallState.Offering] (SDP offer out, awaiting the answer) — and stops the
 *    instant the answer lands ([CallState.Connecting]). iOS drags ringback to
 *    `.connected`; stopping at the answer is tighter and never rings over a callee
 *    who has already picked up. `Offering` is an outgoing-exclusive state, so the
 *    mapping stays keyed purely on [CallState] with no direction ambiguity.
 *  - **The connected cue fires on every entry into [CallState.Connected]** — first
 *    connect *and* a successful reconnect (`Reconnecting → Connected`) — mirroring
 *    iOS, which routes both through `transitionToConnected`.
 *  - **The ended cue fires only when a live call ends** (`previous.isActive`),
 *    mirroring iOS's `if wasActive { playEnded() }`: a phantom `Idle → Ended` or an
 *    idempotent `Ended → Ended` stays silent.
 */
object CallSoundPolicy {

    /** The loop that must be active for [state]. Total over every [CallState]. */
    fun loopFor(state: CallState): CallSound = when (state) {
        is CallState.Ringing -> if (state.isOutgoing) CallSound.Ringback else CallSound.Ringtone
        is CallState.Offering -> CallSound.Ringback
        is CallState.Idle,
        is CallState.Connecting,
        is CallState.Connected,
        is CallState.Reconnecting,
        is CallState.Ended,
        -> CallSound.None
    }

    /** The one-shot cue (if any) for the [previous] → [next] edge. */
    fun cueFor(previous: CallState, next: CallState): CallCue? = when {
        next is CallState.Connected && previous !is CallState.Connected -> CallCue.Connected
        next is CallState.Ended && previous.isActive -> CallCue.Ended
        else -> null
    }

    /** The full audio directive for the [previous] → [next] transition. */
    fun plan(previous: CallState, next: CallState): CallSoundPlan =
        CallSoundPlan(loop = loopFor(next), cue = cueFor(previous, next))
}
