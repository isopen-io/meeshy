package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryMediaObject
import org.junit.Test

class StoryVolumeTest {
    private fun media(volume: Float = 1f, memento: Float? = null) =
        StoryMediaObject(id = "m", volume = volume, mutedVolumeMemento = memento)

    @Test fun `le gain maximum est 2 et le facteur de ducking 0,25`() {
        assertThat(StoryVolume.MAX_GAIN).isEqualTo(2f)
        assertThat(StoryVolume.DUCKING_FACTOR).isEqualTo(0.25f)
    }

    @Test fun `clamp borne entre 0 et le gain maximum`() {
        assertThat(StoryVolume.clamp(-1f)).isEqualTo(0f)
        assertThat(StoryVolume.clamp(0.7f)).isEqualTo(0.7f)
        assertThat(StoryVolume.clamp(5f)).isEqualTo(StoryVolume.MAX_GAIN)
        assertThat(StoryVolume.clamp(Float.NaN)).isEqualTo(0f)
    }

    @Test fun `couper le son met 0 et memorise le niveau d'avant`() {
        val muted = media(volume = 0.6f).toggledMute()
        assertThat(muted.volume).isEqualTo(0f)
        assertThat(muted.mutedVolumeMemento).isEqualTo(0.6f)
        assertThat(muted.isMuted).isTrue()
    }

    @Test fun `retablir restaure le niveau memorise et non 1,0`() {
        val restored = media(volume = 0.6f).toggledMute().toggledMute()
        assertThat(restored.volume).isEqualTo(0.6f)
        assertThat(restored.mutedVolumeMemento).isNull()
    }

    @Test fun `piste creee muette se retablit a 1,0`() {
        assertThat(media(volume = 0f).toggledMute().volume).isEqualTo(1f)
    }

    @Test fun `un reglage manuel audible efface le memento`() {
        val muted = media(volume = 0.6f).toggledMute()
        val adjusted = muted.withVolumePreservingMuteMemento(0.3f)
        assertThat(adjusted.volume).isEqualTo(0.3f)
        assertThat(adjusted.mutedVolumeMemento).isNull()
    }

    @Test fun `un volume negatif est borne a 0 et memorise l'ancien niveau`() {
        val result = media(volume = 0.9f).withVolumePreservingMuteMemento(-3f)
        assertThat(result.volume).isEqualTo(0f)
        assertThat(result.mutedVolumeMemento).isEqualTo(0.9f)
    }

    @Test fun `couper deux fois un volume deja nul garde le memento`() {
        val again = media(volume = 0f, memento = 0.4f).withVolumePreservingMuteMemento(0f)
        assertThat(again.mutedVolumeMemento).isEqualTo(0.4f)
    }

    @Test fun `la meme loi vaut pour un clip audio`() {
        val audio = StoryAudioPlayerObject(id = "a", volume = 1.5f).toggledMute()
        assertThat(audio.volume).isEqualTo(0f)
        assertThat(audio.toggledMute().volume).isEqualTo(1.5f)
    }
}
