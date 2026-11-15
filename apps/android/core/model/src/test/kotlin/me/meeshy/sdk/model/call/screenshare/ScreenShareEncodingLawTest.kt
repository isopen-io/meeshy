package me.meeshy.sdk.model.call.screenshare

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ScreenShareEncodingLawTest {

    private val camera = SenderEncodingSnapshot(
        degradation = VideoDegradation.MaintainFramerate,
        encodings = listOf(SenderEncodingLimits(maxBitrateBps = 800_000, maxFramerate = 30, scaleResolutionDownBy = 2.0)),
    )

    @Test
    fun `the screen is read, so it keeps its resolution at 15 frames per second and the iOS ceiling`() {
        val screen = ScreenShareEncodingLaw.during(camera)

        assertThat(screen).isEqualTo(
            SenderEncodingSnapshot(
                degradation = VideoDegradation.MaintainResolution,
                encodings = listOf(SenderEncodingLimits(maxBitrateBps = 2_500_000, maxFramerate = 15, scaleResolutionDownBy = 1.0)),
            ),
        )
    }

    @Test
    fun `every encoding of the sender is capped, none is added nor removed`() {
        val layered = camera.copy(encodings = List(3) { SenderEncodingLimits(null, null, null) })

        assertThat(ScreenShareEncodingLaw.during(layered).encodings)
            .containsExactlyElementsIn(List(3) { ScreenShareEncodingLaw.SCREEN })
        assertThat(ScreenShareEncodingLaw.during(camera.copy(encodings = emptyList())).encodings).isEmpty()
    }
}
