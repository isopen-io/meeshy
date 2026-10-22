package me.meeshy.app.calls

import android.content.Context
import android.media.AudioManager
import android.os.Build
import android.os.PowerManager
import androidx.annotation.RequiresApi
import me.meeshy.sdk.model.call.CallAudioRouteKind

/**
 * The platform audio routing of ONE call: puts the device in communication mode,
 * picks earpiece or loudspeaker, and gives everything back when the call ends.
 * Pure Android-framework glue — every decision (which route on which API level)
 * is the tested [CallAudioRoute]'s.
 */
internal class CallAudioSession(
    private val appContext: Context,
    private val onFocusChanged: (hasFocus: Boolean) -> Unit = {},
) {

    private val audioManager: AudioManager by lazy {
        appContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    }

    private var routed: Boolean = false

    private val focus: CallAudioFocusController by lazy {
        CallAudioFocusController(audioManager, ::onFocus)
    }

    private val proximity: CallProximityController by lazy {
        CallProximityController(appContext.getSystemService(Context.POWER_SERVICE) as? PowerManager)
    }

    private var isVideo: Boolean = false

    /** Le focus revient : le mode communication et la route sont remis avant de rendre l'audio. */
    private fun onFocus(hasFocus: Boolean) {
        if (hasFocus && routed) {
            audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
            applySpeakerRoute(speakerOn)
        }
        onFocusChanged(hasFocus)
    }

    private var speakerOn: Boolean = false

    private fun updateProximity() {
        val kind = if (speakerOn) CallAudioRouteKind.Speaker else CallAudioRouteKind.Earpiece
        proximity.update(isVideo, kind)
    }

    /** The call opens: communication mode, on the loudspeaker or the earpiece. */
    fun route(speakerOn: Boolean, isVideo: Boolean = false) {
        this.isVideo = isVideo
        this.speakerOn = speakerOn
        audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
        applySpeakerRoute(speakerOn)
        routed = true
        runCatching { focus.request() }
        runCatching { updateProximity() }
    }

    /** Speaker/earpiece toggle — local audio routing only, never signalled to the peer. */
    fun setSpeaker(enabled: Boolean) {
        speakerOn = enabled
        applySpeakerRoute(enabled)
        if (routed) runCatching { updateProximity() }
    }

    /**
     * Undoes [route] symmetrically: the speaker route must be cleared BEFORE the
     * mode drops back to NORMAL — a mode change alone does not release a selected
     * communication device (API 31+) or the legacy speakerphone flag (below it), so
     * without this the call's speaker route silently survived the call and leaked
     * onto the next audio played (a voice message at ear volume coming out of the
     * loudspeaker).
     */
    fun restore() {
        if (!routed) return
        routed = false
        runCatching { proximity.release() }
        runCatching { focus.abandon() }
        applySpeakerRoute(speakerOn = false)
        audioManager.mode = AudioManager.MODE_NORMAL
    }

    /**
     * Executes the pure [CallAudioRoute.actionFor] decision — `setCommunicationDevice`
     * on API 31+ (the non-deprecated routing API, absent below it), `setSpeakerphoneOn`
     * as the minSdk-26 repli. A missing built-in-speaker device (no such hardware, or
     * the platform not yet reporting it) leaves the current route untouched rather
     * than crash — the toggle stays inert instead of throwing mid-call.
     */
    private fun applySpeakerRoute(speakerOn: Boolean) {
        when (val action = CallAudioRoute.actionFor(Build.VERSION.SDK_INT, speakerOn)) {
            is CallAudioAction.SelectCommunicationDevice -> applyCommunicationDevice(action)
            CallAudioAction.ClearCommunicationDevice -> clearCommunicationDevice()
            is CallAudioAction.SetSpeakerphoneOn -> {
                @Suppress("DEPRECATION")
                audioManager.isSpeakerphoneOn = action.on
            }
        }
    }

    /**
     * The API 31+ branches of [applySpeakerRoute], extracted so the `@RequiresApi`
     * guard is LOCAL and syntactic — lint's NewApi detector cannot follow a
     * decision made in [CallAudioRoute.actionFor] (a plain function returning a
     * sealed interface, not a boolean/threshold check it recognizes), so calling
     * `availableCommunicationDevices`/`setCommunicationDevice`/
     * `clearCommunicationDevice` straight from the `when` above trips
     * `lintVitalRelease` even though [CallAudioRoute.actionFor] only ever produces
     * these actions on API 31+.
     */
    @RequiresApi(Build.VERSION_CODES.S)
    private fun applyCommunicationDevice(action: CallAudioAction.SelectCommunicationDevice) {
        audioManager.availableCommunicationDevices
            .firstOrNull { it.type == action.deviceType }
            ?.let(audioManager::setCommunicationDevice)
    }

    @RequiresApi(Build.VERSION_CODES.S)
    private fun clearCommunicationDevice() {
        audioManager.clearCommunicationDevice()
    }
}
