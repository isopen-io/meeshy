package me.meeshy.sdk.call.screen

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.screenshare.ScreenShareCaptureSize
import org.junit.Test

/** Une rotation pendant le partage redimensionne l'écran virtuel une fois, à la nouvelle orientation (#13735). */
class ScreenCaptureFollowerTest {

    @Test
    fun `turning the phone resizes the capture once to the new orientation`() {
        val resized = mutableListOf<ScreenShareCaptureSize>()
        val follower = ScreenCaptureFollower(ScreenShareCaptureSize.fit(1080, 2400), resized::add)

        follower.onDisplay(widthPx = 2400, heightPx = 1080)
        follower.onDisplay(widthPx = 2400, heightPx = 1080)
        follower.onDisplay(widthPx = 1080, heightPx = 2400)

        assertThat(resized).containsExactly(
            ScreenShareCaptureSize(width = 1280, height = 576),
            ScreenShareCaptureSize(width = 576, height = 1280),
        ).inOrder()
    }

    @Test
    fun `a display that cannot be read changes nothing`() {
        val resized = mutableListOf<ScreenShareCaptureSize>()
        val follower = ScreenCaptureFollower(ScreenShareCaptureSize.fit(1080, 2400), resized::add)

        follower.onDisplay(widthPx = 0, heightPx = 0)

        assertThat(resized).isEmpty()
        assertThat(follower.size).isEqualTo(ScreenShareCaptureSize.fit(1080, 2400))
    }
}
