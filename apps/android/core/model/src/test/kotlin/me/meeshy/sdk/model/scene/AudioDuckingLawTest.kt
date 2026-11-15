package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryKeyframe
import me.meeshy.sdk.model.StoryMediaObject
import org.junit.Test

class AudioDuckingLawTest {
    private fun video(id: String, volume: Float = 1f, bg: Boolean = false, noDuck: Boolean? = null) =
        StoryMediaObject(id = id, mediaType = "video", volume = volume, isBackground = bg, isDuckingDisabled = noDuck)

    private fun music(volume: Float = 1f) =
        StoryAudioPlayerObject(id = "music", isBackground = true, volume = volume)

    private fun clip(id: String = "clip", volume: Float = 1f) =
        StoryAudioPlayerObject(id = id, isBackground = false, volume = volume)

    @Test fun `la musique de fond avec une video sonore declenche le ducking`() {
        val effects = StoryEffects(audioPlayerObjects = listOf(music()), mediaObjects = listOf(video("v")))
        assertThat(AudioDuckingLaw.shouldDuckVideoAudio(effects, mapOf("v" to true))).isTrue()
    }

    @Test fun `une video muette ou non sondee ne declenche rien`() {
        val effects = StoryEffects(audioPlayerObjects = listOf(music()), mediaObjects = listOf(video("v")))
        assertThat(AudioDuckingLaw.shouldDuckVideoAudio(effects, mapOf("v" to false))).isFalse()
        assertThat(AudioDuckingLaw.shouldDuckVideoAudio(effects, emptyMap())).isFalse()
    }

    @Test fun `sans audio de fond pas de ducking`() {
        val effects = StoryEffects(mediaObjects = listOf(video("v")))
        assertThat(AudioDuckingLaw.shouldDuckVideoAudio(effects, mapOf("v" to true))).isFalse()
    }

    @Test fun `l'audio de fond herite de l'ancien champ backgroundAudioId`() {
        val effects = StoryEffects(backgroundAudioId = "pm", backgroundAudioVolume = 0.3f)
        assertThat(AudioDuckingLaw.resolvedBackgroundAudio(effects)?.volume).isEqualTo(0.3f)
        assertThat(AudioDuckingLaw.resolvedBackgroundAudio(StoryEffects())).isNull()
    }

    @Test fun `la piste des videos est attenuee sous la musique`() {
        val effects = StoryEffects(
            audioPlayerObjects = listOf(music()),
            mediaObjects = listOf(video("v", volume = 1f), video("bg", volume = 0.8f, bg = true)),
        )
        val resolved = AudioDuckingLaw.resolve(effects, time = 1f, videoHasAudioTrack = mapOf("v" to true))
        assertThat(resolved.videoVolumes["v"]).isEqualTo(0.25f)
        assertThat(resolved.videoVolumes["bg"]).isWithin(1e-6f).of(0.2f)
    }

    @Test fun `les clips audio de premier plan ne sont jamais attenues`() {
        val effects = StoryEffects(
            audioPlayerObjects = listOf(music(0.6f), clip("c", 0.9f)),
            mediaObjects = listOf(video("v")),
        )
        val resolved = AudioDuckingLaw.resolve(effects, time = 0f, videoHasAudioTrack = mapOf("v" to true))
        assertThat(resolved.foregroundAudioVolumes["c"]).isEqualTo(0.9f)
        assertThat(resolved.backgroundAudioVolume).isEqualTo(0.6f)
    }

    @Test fun `une video qui coupe le ducking garde son niveau`() {
        val effects = StoryEffects(
            audioPlayerObjects = listOf(music()),
            mediaObjects = listOf(video("dialogue", noDuck = true)),
        )
        val resolved = AudioDuckingLaw.resolve(effects, time = 0f, videoHasAudioTrack = mapOf("dialogue" to true))
        assertThat(resolved.videoVolumes["dialogue"]).isEqualTo(1f)
    }

    @Test fun `l'automation est lue relativement au debut du clip`() {
        val c = clip("c").copy(
            startTime = 2f,
            keyframes = listOf(StoryKeyframe(id = "a", time = 0f, volume = 0f), StoryKeyframe(id = "b", time = 2f, volume = 1f)),
        )
        val resolved = AudioDuckingLaw.resolve(StoryEffects(audioPlayerObjects = listOf(c)), time = 3f, videoHasAudioTrack = emptyMap())
        assertThat(resolved.foregroundAudioVolumes["c"]).isWithin(1e-6f).of(0.5f)
    }

    @Test fun `les images n'ont pas de volume resolu`() {
        val img = StoryMediaObject(id = "i", mediaType = "image")
        val resolved = AudioDuckingLaw.resolve(StoryEffects(mediaObjects = listOf(img)), 0f, emptyMap())
        assertThat(resolved.videoVolumes).isEmpty()
    }
}
