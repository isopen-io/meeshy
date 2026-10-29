package me.meeshy.sdk.model.call.screenshare

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallScreenShareLawTest {

    @Test
    fun `a projection that goes live while nothing is shared attaches the screen track`() {
        assertThat(CallScreenShareLaw.step(isSharing = false, capture = ScreenShareCapture.Live))
            .isEqualTo(ScreenShareStep.Attach)
    }

    @Test
    fun `a live projection already shared changes nothing`() {
        assertThat(CallScreenShareLaw.step(isSharing = true, capture = ScreenShareCapture.Live))
            .isEqualTo(ScreenShareStep.None)
    }

    @Test
    fun `any end of the projection while sharing detaches the track`() {
        listOf(ScreenShareCapture.Over, ScreenShareCapture.Idle, ScreenShareCapture.Failed).forEach { capture ->
            assertThat(CallScreenShareLaw.step(isSharing = true, capture = capture)).isEqualTo(ScreenShareStep.Detach)
        }
    }

    @Test
    fun `a projection that failed before sharing is reported`() {
        assertThat(CallScreenShareLaw.step(isSharing = false, capture = ScreenShareCapture.Failed))
            .isEqualTo(ScreenShareStep.Report)
    }

    @Test
    fun `a declined consent is only acknowledged, never reported as a failure`() {
        assertThat(CallScreenShareLaw.step(isSharing = false, capture = ScreenShareCapture.Declined))
            .isEqualTo(ScreenShareStep.Acknowledge)
    }

    @Test
    fun `waiting for the consent or the service does nothing yet`() {
        assertThat(CallScreenShareLaw.step(isSharing = false, capture = ScreenShareCapture.Pending))
            .isEqualTo(ScreenShareStep.None)
    }

    @Test
    fun `the phase is sharing once the track is attached, requesting while the projection is pending`() {
        assertThat(CallScreenShareLaw.phase(isSharing = true, capture = ScreenShareCapture.Live))
            .isEqualTo(CallScreenSharePhase.Sharing)
        assertThat(CallScreenShareLaw.phase(isSharing = false, capture = ScreenShareCapture.Pending))
            .isEqualTo(CallScreenSharePhase.Requesting)
        assertThat(CallScreenShareLaw.phase(isSharing = false, capture = ScreenShareCapture.Live))
            .isEqualTo(CallScreenSharePhase.Requesting)
        assertThat(CallScreenShareLaw.phase(isSharing = false, capture = ScreenShareCapture.Over))
            .isEqualTo(CallScreenSharePhase.Idle)
    }

    @Test
    fun `the action is offered on an established call, and kept to stop a share in flight`() {
        assertThat(CallScreenShareLaw.isOffered(isEstablished = true, phase = CallScreenSharePhase.Idle)).isTrue()
        assertThat(CallScreenShareLaw.isOffered(isEstablished = false, phase = CallScreenSharePhase.Idle)).isFalse()
        assertThat(CallScreenShareLaw.isOffered(isEstablished = false, phase = CallScreenSharePhase.Sharing)).isTrue()
    }
}
