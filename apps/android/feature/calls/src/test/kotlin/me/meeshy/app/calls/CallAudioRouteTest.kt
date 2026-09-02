package me.meeshy.app.calls

import android.media.AudioDeviceInfo
import android.os.Build
import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * The speaker-toggle routing decision, exhaustively covered as a pure function —
 * no [android.media.AudioManager], no device, no Robolectric. The side-effecting
 * half (actually calling the AudioManager APIs this chooses) is exercised through
 * [WebRtcCallCoordinatorTest] instead.
 */
class CallAudioRouteTest {

    @Test
    fun `below API 31 the legacy speakerphone flag is the only option, on`() {
        val action = CallAudioRoute.actionFor(sdkInt = Build.VERSION_CODES.R, speakerOn = true)

        assertThat(action).isEqualTo(CallAudioAction.SetSpeakerphoneOn(true))
    }

    @Test
    fun `below API 31 the legacy speakerphone flag is the only option, off`() {
        val action = CallAudioRoute.actionFor(sdkInt = Build.VERSION_CODES.R, speakerOn = false)

        assertThat(action).isEqualTo(CallAudioAction.SetSpeakerphoneOn(false))
    }

    @Test
    fun `API 31 and above selects the built-in speaker as the communication device`() {
        val action = CallAudioRoute.actionFor(sdkInt = Build.VERSION_CODES.S, speakerOn = true)

        assertThat(action)
            .isEqualTo(CallAudioAction.SelectCommunicationDevice(AudioDeviceInfo.TYPE_BUILTIN_SPEAKER))
    }

    @Test
    fun `API 31 and above clears the device override to route back to the earpiece`() {
        val action = CallAudioRoute.actionFor(sdkInt = Build.VERSION_CODES.S, speakerOn = false)

        assertThat(action).isEqualTo(CallAudioAction.ClearCommunicationDevice)
    }

    @Test
    fun `a future SDK level still takes the modern communication-device path`() {
        val action = CallAudioRoute.actionFor(sdkInt = Build.VERSION_CODES.S + 10, speakerOn = true)

        assertThat(action)
            .isEqualTo(CallAudioAction.SelectCommunicationDevice(AudioDeviceInfo.TYPE_BUILTIN_SPEAKER))
    }

    @Test
    fun `the boundary just below 31 still uses the legacy repli`() {
        val action = CallAudioRoute.actionFor(sdkInt = Build.VERSION_CODES.S - 1, speakerOn = true)

        assertThat(action).isEqualTo(CallAudioAction.SetSpeakerphoneOn(true))
    }
}
