package me.meeshy.sdk.call.screen

import me.meeshy.sdk.model.call.screenshare.ScreenShareCaptureSize

/**
 * Suit l'écran pendant le partage (#13735) : une rotation redimensionne l'écran virtuel à la nouvelle
 * orientation, une seule fois par changement, selon [ScreenShareCaptureSize.reoriented].
 */
internal class ScreenCaptureFollower(
    initial: ScreenShareCaptureSize,
    private val resize: (ScreenShareCaptureSize) -> Unit,
) {
    var size: ScreenShareCaptureSize = initial
        private set

    fun onDisplay(widthPx: Int, heightPx: Int) {
        val next = ScreenShareCaptureSize.reoriented(size, widthPx, heightPx) ?: return
        size = next
        resize(next)
    }
}
