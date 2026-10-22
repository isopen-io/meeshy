package me.meeshy.sdk.model.call

enum class CallChromeElement {
    Header, Controls, OpenPanel, RecordingStatus, RecordingConsent, ScreenShareBanner, Captions, SelfView,
}

/**
 * What the call chrome shows. It hides only on a video stage, by a tap, in
 * [FADE_DURATION_MILLIS]; never on audio or under TalkBack (the caller passes
 * `isStageFullScreen = false`). Captions and the consent card always stay.
 * Mirrors iOS `CallChromeVisibility`.
 */
data class CallChromeVisibility(
    val isRevealed: Boolean = true,
    val isStageFullScreen: Boolean = false,
    val isModeActive: Boolean = false,
) {
    fun isVisible(element: CallChromeElement): Boolean = when (element) {
        CallChromeElement.Captions, CallChromeElement.RecordingConsent -> true
        CallChromeElement.SelfView -> !isModeActive
        CallChromeElement.Header,
        CallChromeElement.Controls,
        CallChromeElement.OpenPanel,
        CallChromeElement.RecordingStatus,
        CallChromeElement.ScreenShareBanner,
        -> isRevealed && !isStageFullScreen && !isModeActive
    }

    fun toggled(): CallChromeVisibility = copy(isRevealed = !isRevealed)

    companion object {
        const val FADE_DURATION_MILLIS: Long = 250

        fun mayToggleByTap(isVideoStage: Boolean, isTouchExplorationOn: Boolean = false): Boolean =
            isVideoStage && !isTouchExplorationOn

        fun isVideoStage(
            isGroup: Boolean,
            isLocalVideoEnabled: Boolean,
            isDuoVideoActive: Boolean,
            remoteCamerasOn: Int,
        ): Boolean = if (!isGroup) isDuoVideoActive else isLocalVideoEnabled || remoteCamerasOn > 0

        /** During the fade-out the button is still seen: it still answers until the fade ends. */
        fun acceptsTouches(isVisible: Boolean, hiddenForMillis: Long): Boolean =
            isVisible || hiddenForMillis < FADE_DURATION_MILLIS
    }
}

/** What the chrome learns from a touch; [Revive] (a touch during the fade) relights it. */
enum class CallChromeInteraction {
    TouchBegan, TouchEnded, Tap, Revive;

    val revealsChrome: Boolean get() = this == Revive
}

/** A row that starts scrolling puts a finger on the chrome; one that stops lifts it. */
object CallChromeScrollRule {
    fun interaction(wasScrolling: Boolean, isScrolling: Boolean): CallChromeInteraction? = when {
        !wasScrolling && isScrolling -> CallChromeInteraction.TouchBegan
        wasScrolling && !isScrolling -> CallChromeInteraction.TouchEnded
        else -> null
    }
}
