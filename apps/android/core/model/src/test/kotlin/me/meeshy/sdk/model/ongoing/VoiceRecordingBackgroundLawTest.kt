package me.meeshy.sdk.model.ongoing

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class VoiceRecordingBackgroundLawTest {

    private fun leave(recording: Boolean, keptAlive: Boolean) =
        VoiceRecordingBackgroundLaw.onAppLeft(VoiceRecordingBackgroundLaw.Input(isRecording = recording, keptAliveByService = keptAlive))

    @Test
    fun `leaving the app with no take touches nothing`() {
        assertThat(leave(recording = false, keptAlive = false)).isEqualTo(VoiceRecordingBackgroundLaw.Decision.Nothing)
        assertThat(leave(recording = false, keptAlive = true)).isEqualTo(VoiceRecordingBackgroundLaw.Decision.Nothing)
    }

    @Test
    fun `a take held by the foreground service goes on, like the iOS Live Activity`() {
        assertThat(leave(recording = true, keptAlive = true)).isEqualTo(VoiceRecordingBackgroundLaw.Decision.KeepRecording)
    }

    @Test
    fun `a take the system would silence is handed to the tray instead of lost`() {
        assertThat(leave(recording = true, keptAlive = false)).isEqualTo(VoiceRecordingBackgroundLaw.Decision.AbandonToTray)
    }
}
