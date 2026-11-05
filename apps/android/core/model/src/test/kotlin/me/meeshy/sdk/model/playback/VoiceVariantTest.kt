package me.meeshy.sdk.model.playback

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.QueuedAudio
import org.junit.Test

class VoiceVariantTest {

    private fun audio(
        id: String = "att",
        url: String = "https://m/original.m4a",
        language: String? = "fr",
        translated: Boolean = false,
    ) = QueuedAudio(
        attachmentId = id,
        messageId = "msg",
        conversationId = "conv",
        fileUrl = url,
        durationMs = 1_000,
        senderName = "Ada",
        senderAvatarUrl = null,
        receivedAtEpochMs = 1L,
        trackLanguage = language,
        isTranslatedTrack = translated,
        isProtected = false,
    )

    @Test
    fun `la meme piece sur une autre piste de langue est perimee`() {
        val playing = audio()
        val served = audio(url = "https://m/en.m4a", language = "en", translated = true)
        assertThat(VoiceVariant.isStale(playing, served)).isTrue()
    }

    @Test
    fun `la meme piste n est pas perimee`() {
        assertThat(VoiceVariant.isStale(audio(), audio())).isFalse()
    }

    @Test
    fun `une autre piece n est jamais perimee`() {
        assertThat(VoiceVariant.isStale(audio(id = "a"), audio(id = "b", url = "https://m/en.m4a", language = "en"))).isFalse()
    }

    @Test
    fun `une adresse changee sans changement de langue n est pas perimee`() {
        assertThat(VoiceVariant.isStale(audio(), audio(url = "https://m/autre.m4a"))).isFalse()
    }

    @Test
    fun `la casse de la langue ne rend pas la piste perimee`() {
        assertThat(VoiceVariant.isStale(audio(language = "FR"), audio(url = "https://m/x.m4a", language = "fr"))).isFalse()
    }

    @Test
    fun `revenir a l original est une bascule`() {
        val playing = audio(url = "https://m/en.m4a", language = "en", translated = true)
        val served = audio(url = "https://m/original.m4a", language = "fr", translated = false)
        assertThat(VoiceVariant.isStale(playing, served)).isTrue()
    }
}
