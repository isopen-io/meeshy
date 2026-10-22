package me.meeshy.app.calls

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The input seam for the health of the local video on a call. [isVideoAutoPaused]
 * is `true` while the app itself has frozen the outgoing picture to keep the call
 * alive (a sustained poor link, an overheating phone…) — as opposed to the user
 * turning the camera off. The call screen surfaces it as a quiet « video paused »
 * affordance so the user is never left guessing why the other side sees a still
 * image (iOS parity: `isVideoSuspended` of the video-survival controller).
 *
 * Isolated behind an interface for the reason every other call input is: the
 * *decision* to pause lives in a tested policy elsewhere, the screen only
 * projects the flag, and a test drives it with a plain flow.
 */
interface CallVideoHealth {
    val isVideoAutoPaused: StateFlow<Boolean>
}

/**
 * Interim health: never paused, until the capability that watches the link swaps
 * this [dagger.Binds]. The whole path — seam → view model → [CallUiState] → screen
 * — is live end-to-end; only the real source is pending.
 */
@Singleton
class NoopCallVideoHealth @Inject constructor() : CallVideoHealth {
    override val isVideoAutoPaused: StateFlow<Boolean> = MutableStateFlow(false).asStateFlow()
}
