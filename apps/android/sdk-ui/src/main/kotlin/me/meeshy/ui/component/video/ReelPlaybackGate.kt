package me.meeshy.ui.component.video

/** What the reel player must do for a given page activity and app visibility. */
data class ReelPlaybackCommand(val playWhenReady: Boolean, val rewind: Boolean)

/**
 * The playback rule of [ReelVideoSurface] (iOS `ReelPlaybackRules`): a reel plays only while it
 * is the active page AND the screen is at least STARTED. Leaving the app is a pause that keeps
 * the position — only a page that stops being the active one rewinds (when asked to).
 */
object ReelPlaybackGate {
    fun command(isActive: Boolean, isForeground: Boolean, rewindWhenInactive: Boolean): ReelPlaybackCommand =
        ReelPlaybackCommand(
            playWhenReady = isActive && isForeground,
            rewind = !isActive && rewindWhenInactive,
        )
}
