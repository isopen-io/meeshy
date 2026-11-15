package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallControlRefusalTest {
    @Test
    fun `gateway codes map to typed reasons`() {
        assertThat(CallControlRefusal("PERMISSION_DENIED").reason).isEqualTo(CallControlRefusal.Reason.INSUFFICIENT_RIGHT)
        assertThat(CallControlRefusal("CALL_NOT_ACTIVE").reason).isEqualTo(CallControlRefusal.Reason.CALL_ENDED)
        assertThat(CallControlRefusal("MAX_PARTICIPANTS_REACHED").reason).isEqualTo(CallControlRefusal.Reason.LIMIT)
        assertThat(CallControlRefusal("TIMEOUT").reason).isEqualTo(CallControlRefusal.Reason.OFFLINE)
        assertThat(CallControlRefusal("SOMETHING_NEW").reason).isEqualTo(CallControlRefusal.Reason.OTHER)
    }

    @Test
    fun `recording codes map to typed reasons`() {
        assertThat(CallRecordingRefusal("NO_PEER_TO_CONSENT").reason).isEqualTo(CallRecordingRefusal.Reason.NO_PEER)
        assertThat(CallRecordingRefusal("RECORDING_ALREADY_PENDING").reason).isEqualTo(CallRecordingRefusal.Reason.ALREADY_PENDING)
        assertThat(CallRecordingRefusal("RECORDING_EXPIRED").reason).isEqualTo(CallRecordingRefusal.Reason.EXPIRED)
        assertThat(CallRecordingRefusal("NO_SOCKET").reason).isEqualTo(CallRecordingRefusal.Reason.OFFLINE)
    }

    @Test
    fun `refusals with the same code are equal`() {
        assertThat(CallControlRefusal("X")).isEqualTo(CallControlRefusal("X"))
    }
}
