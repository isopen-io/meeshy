package me.meeshy.sdk.model.call.screenshare

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ScreenShareSenderLawTest {

    @Test
    fun `a video sender that was sending takes the screen without renegotiation`() {
        val plan = ScreenShareSenderLaw.begin(hasVideoSender = true, wasSending = true)

        assertThat(plan).isEqualTo(ScreenShareBegin(addsSender = false, needsRenegotiation = false))
    }

    @Test
    fun `a video sender that only received changes direction, so the peer gets an offer`() {
        val plan = ScreenShareSenderLaw.begin(hasVideoSender = true, wasSending = false)

        assertThat(plan).isEqualTo(ScreenShareBegin(addsSender = false, needsRenegotiation = true))
    }

    @Test
    fun `without a video sender one is added, and the peer gets an offer`() {
        val plan = ScreenShareSenderLaw.begin(hasVideoSender = false, wasSending = false)

        assertThat(plan).isEqualTo(ScreenShareBegin(addsSender = true, needsRenegotiation = true))
    }

    @Test
    fun `the end restores what the sender carried and renegotiates only when it stops sending`() {
        assertThat(ScreenShareSenderLaw.end(wasSendingBefore = true)).isEqualTo(ScreenShareEnd(needsRenegotiation = false))
        assertThat(ScreenShareSenderLaw.end(wasSendingBefore = false)).isEqualTo(ScreenShareEnd(needsRenegotiation = true))
    }

    @Test
    fun `the capture keeps the screen ratio, fits the long side and stays even`() {
        assertThat(ScreenShareCaptureSize.fit(widthPx = 1080, heightPx = 2220))
            .isEqualTo(ScreenShareCaptureSize(width = 622, height = 1280))
        assertThat(ScreenShareCaptureSize.fit(widthPx = 2400, heightPx = 1080))
            .isEqualTo(ScreenShareCaptureSize(width = 1280, height = 576))
    }

    @Test
    fun `a small screen is captured as is, and an unreadable one falls back to the default`() {
        assertThat(ScreenShareCaptureSize.fit(widthPx = 720, heightPx = 1280))
            .isEqualTo(ScreenShareCaptureSize(width = 720, height = 1280))
        assertThat(ScreenShareCaptureSize.fit(widthPx = 0, heightPx = 1280)).isEqualTo(ScreenShareCaptureSize.DEFAULT)
    }

    @Test
    fun `a rotation during the share gives the capture the new orientation, same ratio`() {
        val portrait = ScreenShareCaptureSize.fit(widthPx = 1080, heightPx = 2400)

        val turned = ScreenShareCaptureSize.reoriented(portrait, widthPx = 2400, heightPx = 1080)

        assertThat(turned).isEqualTo(ScreenShareCaptureSize(width = 1280, height = 576))
        assertThat(ScreenShareCaptureSize.reoriented(turned!!, widthPx = 1080, heightPx = 2400)).isEqualTo(portrait)
    }

    @Test
    fun `a display change that keeps the size, or an unreadable display, leaves the capture alone`() {
        val portrait = ScreenShareCaptureSize.fit(widthPx = 1080, heightPx = 2400)

        assertThat(ScreenShareCaptureSize.reoriented(portrait, widthPx = 1080, heightPx = 2400)).isNull()
        assertThat(ScreenShareCaptureSize.reoriented(portrait, widthPx = 0, heightPx = 0)).isNull()
    }
}
