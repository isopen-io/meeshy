package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.IncomingCallAnswer
import org.junit.Test

/** The gate runs a media action now when the mic is granted, otherwise asks and runs it on the grant. */
class CallPermissionGateTest {

    private class Harness(micGranted: Boolean, cameraGranted: Boolean = true) {
        var granted = micGranted
        var camera = cameraGranted
        var asked = 0
        var ran = 0
        val pending = CallPermissionGate.PendingAction()
        val gate = CallPermissionGate(
            isMicGranted = { granted },
            request = { asked += 1 },
            pending = pending,
            isCameraGranted = { camera },
        )
    }

    @Test
    fun `with the mic granted the action runs at once and nothing is asked`() {
        val h = Harness(micGranted = true)

        h.gate.withMediaPermissions { h.ran += 1 }

        assertThat(h.ran).isEqualTo(1)
        assertThat(h.asked).isEqualTo(0)
    }

    @Test
    fun `without the mic the user is asked and the action waits for the answer`() {
        val h = Harness(micGranted = false)

        h.gate.withMediaPermissions { h.ran += 1 }

        assertThat(h.asked).isEqualTo(1)
        assertThat(h.ran).isEqualTo(0)
    }

    @Test
    fun `the action runs once the mic is granted`() {
        val h = Harness(micGranted = false)
        h.gate.withMediaPermissions { h.ran += 1 }

        h.pending.resolve(granted = true)

        assertThat(h.ran).isEqualTo(1)
    }

    @Test
    fun `a refusal drops the action - the call never starts without a microphone`() {
        val h = Harness(micGranted = false)
        h.gate.withMediaPermissions { h.ran += 1 }

        h.pending.resolve(granted = false)
        h.pending.resolve(granted = true)

        assertThat(h.ran).isEqualTo(0)
    }

    @Test
    fun `an answer runs the action only once`() {
        val h = Harness(micGranted = false)
        h.gate.withMediaPermissions { h.ran += 1 }

        h.pending.resolve(granted = true)
        h.pending.resolve(granted = true)

        assertThat(h.ran).isEqualTo(1)
    }

    @Test
    fun `an answer with nothing waiting is inert`() {
        val h = Harness(micGranted = false)

        h.pending.resolve(granted = true)

        assertThat(h.ran).isEqualTo(0)
    }

    @Test
    fun `accepting with everything granted answers at once`() {
        val h = Harness(micGranted = true)
        var answer: IncomingCallAnswer? = null

        h.gate.answerIncoming(isVideo = true) { answer = it }

        assertThat(answer).isEqualTo(IncomingCallAnswer.Answer)
        assertThat(h.asked).isEqualTo(0)
    }

    @Test
    fun `a refused microphone hangs up once the prompt is answered`() {
        val h = Harness(micGranted = false)
        var answer: IncomingCallAnswer? = null

        h.gate.answerIncoming(isVideo = false) { answer = it }
        assertThat(answer).isNull()
        h.pending.resolve(granted = false)
        h.pending.settle()

        assertThat(answer).isEqualTo(IncomingCallAnswer.HangUp)
    }

    @Test
    fun `a refused camera answers in audio`() {
        val h = Harness(micGranted = true, cameraGranted = false)
        var answer: IncomingCallAnswer? = null

        h.gate.answerIncoming(isVideo = true) { answer = it }
        h.granted = true
        h.pending.resolve(granted = true)
        h.pending.settle()

        assertThat(answer).isEqualTo(IncomingCallAnswer.AnswerAudioOnly)
    }
}
