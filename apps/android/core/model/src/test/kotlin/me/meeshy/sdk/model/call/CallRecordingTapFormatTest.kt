package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallRecordingTapFormatTest {

    @Test
    fun `the formats WebRTC records are accepted`() {
        assertThat(CallRecordingTapFormat.mayCapture(48_000, 1)).isTrue()
        assertThat(CallRecordingTapFormat.mayCapture(16_000, 2)).isTrue()
    }

    @Test
    fun `an empty or unreadable format is refused before any file is opened`() {
        assertThat(CallRecordingTapFormat.mayCapture(0, 1)).isFalse()
        assertThat(CallRecordingTapFormat.mayCapture(48_000, 0)).isFalse()
        assertThat(CallRecordingTapFormat.mayCapture(48_000, 6)).isFalse()
        assertThat(CallRecordingTapFormat.mayCapture(12_345, 1)).isFalse()
    }
}
