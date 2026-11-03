package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallRecordingVideoSizeTest {

    @Test
    fun `a phone portrait frame keeps its shape under the cap`() {
        assertThat(CallRecordingVideoSize.fit(1080, 2400)).isEqualTo(CallRecordingVideoSize(576, 1280))
    }

    @Test
    fun `a tablet landscape frame follows the frame, not a portrait screen`() {
        assertThat(CallRecordingVideoSize.fit(2560, 1600)).isEqualTo(CallRecordingVideoSize(1280, 800))
    }

    @Test
    fun `a multi-window half frame is recorded at its own size`() {
        assertThat(CallRecordingVideoSize.fit(540, 1200)).isEqualTo(CallRecordingVideoSize(540, 1200))
    }

    @Test
    fun `odd dimensions are rounded down to even ones`() {
        assertThat(CallRecordingVideoSize.fit(721, 1281, maxLongEdge = 2000)).isEqualTo(CallRecordingVideoSize(720, 1280))
    }

    @Test
    fun `an empty frame has no size`() {
        assertThat(CallRecordingVideoSize.fit(0, 800)).isNull()
        assertThat(CallRecordingVideoSize.fit(800, -1)).isNull()
    }
}
