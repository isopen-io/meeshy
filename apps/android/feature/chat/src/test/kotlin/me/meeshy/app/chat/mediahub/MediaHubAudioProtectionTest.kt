package me.meeshy.app.chat.mediahub

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.mediahub.MediaHubAttachment
import org.junit.Test

/** Un vocal protégé dans le hub reste protégé dans la ligne qui le joue : ni cache disque, ni onde, ni carte complète. */
class MediaHubAudioProtectionTest {

    private fun hubVoice(isProtected: Boolean) = MediaHubAttachment(
        id = "a", url = "https://gate.meeshy.me/api/v1/attachments/file/a.m4a", thumbnailUrl = null, name = "a.m4a",
        mimeType = "audio/mp4", sizeBytes = 2_048, durationMs = 12_000, isVideo = false, isEncrypted = false, alt = null,
        isProtected = isProtected,
    )

    @Test
    fun `la protection du hub voyage jusqu'au lecteur de la ligne`() {
        assertThat(hubVoice(isProtected = true).toBubbleAudio().isProtected).isTrue()
    }

    @Test
    fun `un vocal ordinaire du hub se lit comme un vocal ordinaire`() {
        val audio = hubVoice(isProtected = false).toBubbleAudio()
        assertThat(audio.isProtected).isFalse()
        assertThat(audio.url).isEqualTo("https://gate.meeshy.me/api/v1/attachments/file/a.m4a")
        assertThat(audio.durationSeconds).isEqualTo(12)
    }
}
