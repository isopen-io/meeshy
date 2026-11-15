package me.meeshy.app.calls

import android.media.AudioDeviceInfo
import android.os.Build

/**
 * The concrete [android.media.AudioManager] step the speaker toggle must take,
 * decided by [CallAudioRoute.actionFor] — kept as data rather than a direct call
 * so the routing DECISION (which API, which device) is a pure, exhaustively
 * tested function, and [WebRtcCallCoordinator] only executes it.
 */
sealed interface CallAudioAction {
    /** API 31+: route to a specific communication device (the built-in speaker). */
    data class SelectCommunicationDevice(val deviceType: Int) : CallAudioAction

    /** API 31+: drop any device override — routes back to the default (earpiece). */
    data object ClearCommunicationDevice : CallAudioAction

    /** Pre-31 repli: the legacy speakerphone flag is the only routing API available. */
    data class SetSpeakerphoneOn(val on: Boolean) : CallAudioAction
}

/**
 * Pure decision for the call speaker toggle: `setCommunicationDevice` (API 31+,
 * the non-deprecated path) with a `setSpeakerphoneOn` repli below it — mirrors
 * iOS `CallManager.applySpeakerRoute`'s single override point, minus the platform
 * side effects, so the branch selection is unit-testable without a device or
 * Robolectric.
 */
object CallAudioRoute {
    fun actionFor(sdkInt: Int, speakerOn: Boolean): CallAudioAction = when {
        sdkInt < Build.VERSION_CODES.S -> CallAudioAction.SetSpeakerphoneOn(speakerOn)
        speakerOn -> CallAudioAction.SelectCommunicationDevice(AudioDeviceInfo.TYPE_BUILTIN_SPEAKER)
        else -> CallAudioAction.ClearCommunicationDevice
    }
}
