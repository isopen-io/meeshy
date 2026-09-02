package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ChatCameraCaptureFileTest {

    @Test
    fun `next names a jpg capture from the given instant`() {
        assertThat(ChatCameraCaptureFile.next(1_700_000_000_000L))
            .isEqualTo("chat_capture_1700000000000.jpg")
    }

    @Test
    fun `nextVideo names an mp4 capture from the given instant`() {
        assertThat(ChatCameraCaptureFile.nextVideo(1_700_000_000_000L))
            .isEqualTo("chat_video_1700000000000.mp4")
    }

    @Test
    fun `a fixed instant always yields the identical name`() {
        assertThat(ChatCameraCaptureFile.next(42L)).isEqualTo(ChatCameraCaptureFile.next(42L))
        assertThat(ChatCameraCaptureFile.nextVideo(42L)).isEqualTo(ChatCameraCaptureFile.nextVideo(42L))
    }

    @Test
    fun `photo and video names never collide for the same instant`() {
        assertThat(ChatCameraCaptureFile.next(1_000L)).isNotEqualTo(ChatCameraCaptureFile.nextVideo(1_000L))
    }
}
