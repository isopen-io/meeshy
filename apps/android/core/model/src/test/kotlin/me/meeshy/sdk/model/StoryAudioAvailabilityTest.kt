package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryAudioAvailabilityTest {
    private fun video(id: String = "v", volume: Float = 1f) = StoryMediaObject(id = id, mediaType = "video", volume = volume)
    private fun audible(effects: StoryEffects?, tracks: Map<String, Boolean> = emptyMap()) =
        StoryAudioAvailability.hasAudibleSound(effects, tracks)

    @Test fun `sans effets rien n'est audible`() = assertThat(audible(null)).isFalse()

    @Test fun `une note vocale est toujours audible`() =
        assertThat(audible(StoryEffects(voiceAttachmentId = "a"))).isTrue()

    @Test fun `une video sans piste n'est pas audible`() {
        val fx = StoryEffects(mediaObjects = listOf(video()))
        assertThat(audible(fx, mapOf("v" to false))).isFalse()
        assertThat(audible(fx)).isFalse()
        assertThat(audible(fx, mapOf("v" to true))).isTrue()
    }

    @Test fun `une video muette n'est pas audible meme avec piste`() =
        assertThat(audible(StoryEffects(mediaObjects = listOf(video(volume = 0f))), mapOf("v" to true))).isFalse()

    @Test fun `un fond muet n'est pas audible un fond a volume non nul l'est`() {
        assertThat(audible(StoryEffects(backgroundAudioId = "b", backgroundAudioVolume = 0f))).isFalse()
        assertThat(audible(StoryEffects(backgroundAudioId = "b", backgroundAudioVolume = 0.3f))).isTrue()
        assertThat(audible(StoryEffects(backgroundAudioId = "b"))).isTrue()
    }

    @Test fun `le baffle se tait quand le fond est annonce et seul`() {
        val fx = StoryEffects(backgroundAudioId = "b")
        assertThat(StoryAudioAvailability.needsSoundButton(fx, emptyMap(), backgroundSoundIsAnnounced = true)).isFalse()
        assertThat(StoryAudioAvailability.needsSoundButton(fx, emptyMap(), backgroundSoundIsAnnounced = false)).isTrue()
        val withVoice = fx.copy(voiceAttachmentId = "v")
        assertThat(StoryAudioAvailability.needsSoundButton(withVoice, emptyMap(), true)).isTrue()
    }

    @Test fun `seules les videos non muettes sont a sonder`() {
        val fx = StoryEffects(mediaObjects = listOf(video("a"), video("b", 0f), StoryMediaObject(id = "i")))
        assertThat(StoryAudioAvailability.videosNeedingAudioProbe(fx).map { it.id }).containsExactly("a")
    }

    @Test fun `un sondage impossible laisse la table inchangee`() {
        assertThat(StoryAudioAvailability.merging(mapOf("a" to true), "v", null)).containsExactly("a", true)
        assertThat(StoryAudioAvailability.merging(emptyMap(), "v", 0)).containsExactly("v", false)
        assertThat(StoryAudioAvailability.merging(emptyMap(), "v", 2)).containsExactly("v", true)
    }
}
