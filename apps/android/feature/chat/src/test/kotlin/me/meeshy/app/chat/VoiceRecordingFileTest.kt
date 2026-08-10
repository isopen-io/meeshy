package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * [VoiceRecordingFile] names the destination file a chat voice-recording take writes
 * into before `android.media.MediaRecorder.start()` — the recorder needs a concrete
 * `File` path up front, unlike a picked gallery item which hands back an already-existing
 * content `Uri`. Pure — the timestamp is an explicit parameter, never read internally, so
 * the same instant always yields the same name. Mirrors `:feature:feed`'s
 * `CameraCaptureFile` naming pattern.
 */
class VoiceRecordingFileTest {

    @Test
    fun `next names the file from the given instant with an m4a extension`() {
        assertThat(VoiceRecordingFile.next(1_700_000_000_000L))
            .isEqualTo("voice_1700000000000.m4a")
    }

    @Test
    fun `next is deterministic for the same instant`() {
        assertThat(VoiceRecordingFile.next(42L)).isEqualTo(VoiceRecordingFile.next(42L))
    }

    @Test
    fun `two different instants produce two different file names`() {
        val first = VoiceRecordingFile.next(1_000L)
        val second = VoiceRecordingFile.next(1_001L)

        assertThat(first).isNotEqualTo(second)
    }

    @Test
    fun `next always ends with the m4a extension`() {
        assertThat(VoiceRecordingFile.next(0L)).endsWith(".m4a")
    }
}
