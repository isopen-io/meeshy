package me.meeshy.sdk.model.call

enum class CallChromeElement {
    Header, Controls, OpenPanel, RecordingStatus, RecordingConsent, ScreenShareBanner, Captions, SelfView,

    /** The « Back to grid · Full screen » capsule of the featured person of a group (U1.10, #8550). */
    FeaturedCapsule,
}

/**
 * What the call chrome shows. It hides by a tap on the stage ([isTapStage]: the image on video, the background behind
 * the avatar on a duo audio call), in [FADE_DURATION_MILLIS]; never under TalkBack. Captions and the consent card
 * always stay. Mirrors iOS `CallChromeVisibility`.
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
        // Stowed WITH the controls, but the full screen does not stow it: it is the way out of it.
        CallChromeElement.FeaturedCapsule -> isRevealed && !isModeActive
    }

    fun toggled(): CallChromeVisibility = copy(isRevealed = !isRevealed)

    companion object {
        const val FADE_DURATION_MILLIS: Long = 250

        fun mayToggleByTap(isTapStage: Boolean, isTouchExplorationOn: Boolean = false): Boolean =
            isTapStage && !isTouchExplorationOn

        /**
         * Law 11 (#16663; extended to audio by #17945): a tap on the STAGE stows the chrome — the image on video, the
         * background behind the avatar on a duo audio call in progress. A group with no camera on has no image to free:
         * its tiles answer the tap. Vectors shared with iOS and the web: (duo, video) → true · (duo, audio, in
         * progress) → true · (duo, audio, not yet in progress) → false · (group, a camera) → true · (group, none) → false.
         */
        fun isTapStage(isGroup: Boolean, isVideoStage: Boolean, isConnected: Boolean): Boolean =
            isVideoStage || (!isGroup && isConnected)

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
