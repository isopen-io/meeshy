package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallRecordingNotice
import me.meeshy.sdk.model.call.CallRecordingPhase
import org.junit.Test

class CallRecordingPresenterTest {
    private fun pending(mustAnswer: Boolean) = CallRecordingPhase.Pending("c", "r", "peer", mine = false, mustAnswer = mustAnswer)

    @Test
    fun `nothing shows at rest`() {
        assertThat(CallRecordingPresenter.status(CallRecordingPhase.Idle)).isNull()
    }

    @Test
    fun `asking and pending show the waiting pill with a cancel`() {
        val asking = CallRecordingPresenter.status(CallRecordingPhase.Asking("c"))!!
        assertThat(asking.textRes).isEqualTo(R.string.call_recording_waiting)
        assertThat(asking.stopLabelRes).isEqualTo(R.string.call_recording_cancel)
        assertThat(CallRecordingPresenter.status(pending(mustAnswer = false))).isEqualTo(asking)
    }

    @Test
    fun `a participant who must answer sees the card, not the pill`() {
        assertThat(CallRecordingPresenter.asksConsent(pending(mustAnswer = true))).isTrue()
        assertThat(CallRecordingPresenter.status(pending(mustAnswer = true))).isNull()
    }

    @Test
    fun `recording shows the persistent indicator for everyone`() {
        listOf(true, false).forEach { mine ->
            val status = CallRecordingPresenter.status(CallRecordingPhase.Recording("c", "r", "x", mine))!!
            assertThat(status.textRes).isEqualTo(R.string.call_recording_active)
            assertThat(status.stopLabelRes).isEqualTo(R.string.call_recording_stop)
        }
    }

    @Test
    fun `each stop reason has its own notice`() {
        fun res(reason: String) = CallRecordingPresenter.noticeRes(CallRecordingNotice.Stopped(reason, false))
        assertThat(res("refused")).isEqualTo(R.string.call_recording_stopped_refused)
        assertThat(res("timeout")).isEqualTo(R.string.call_recording_stopped_timeout)
        assertThat(res("participant-joined")).isEqualTo(R.string.call_recording_stopped_joined)
        assertThat(res("call-ended")).isEqualTo(R.string.call_recording_stopped_other)
    }

    @Test
    fun `failures and refusals have their notices`() {
        assertThat(CallRecordingPresenter.noticeRes(CallRecordingNotice.Unavailable("X"))).isEqualTo(R.string.call_recording_unavailable)
        assertThat(CallRecordingPresenter.noticeRes(CallRecordingNotice.Saved)).isEqualTo(R.string.call_recording_saved)
        assertThat(CallRecordingPresenter.noticeRes(CallRecordingNotice.SaveFailed)).isEqualTo(R.string.call_recording_saveFailed)
        assertThat(CallRecordingPresenter.noticeRes(CallRecordingNotice.EndToEndRefused)).isEqualTo(R.string.call_recording_end_to_end_refused)
    }
}
