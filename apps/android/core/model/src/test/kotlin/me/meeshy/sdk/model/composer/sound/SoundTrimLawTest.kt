package me.meeshy.sdk.model.composer.sound

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.media.MediaTrimBounds
import org.junit.Test

class SoundTrimLawTest {
    private fun sound(duration: Float? = 30f, start: Float? = null, end: Float? = null, url: String? = "https://cdn/s.mp3") =
        StoryAudioPlayerObject(id = "a", mediaURL = url, duration = duration, sourceStart = start, sourceEnd = end)

    @Test
    fun `la source vient de ce que la slide a retenu, sinon de la fenetre posee, sinon de la duree`() {
        assertThat(SoundTrimLaw.sourceSeconds(sound(duration = 5f), declared = 42f)).isEqualTo(42.0)
        assertThat(SoundTrimLaw.sourceSeconds(sound(duration = 5f, start = 1f, end = 20f), declared = null)).isEqualTo(20.0)
        assertThat(SoundTrimLaw.sourceSeconds(sound(duration = 30f), declared = null)).isEqualTo(30.0)
        assertThat(SoundTrimLaw.sourceSeconds(sound(duration = null), declared = null)).isNull()
    }

    @Test
    fun `une source hostile ne se rogne pas ou se borne`() {
        assertThat(SoundTrimLaw.sourceSeconds(sound(), declared = Float.NaN)).isNull()
        assertThat(SoundTrimLaw.sourceSeconds(sound(), declared = Float.POSITIVE_INFINITY)).isNull()
        assertThat(SoundTrimLaw.sourceSeconds(sound(), declared = -3f)).isNull()
        assertThat(SoundTrimLaw.sourceSeconds(sound(), declared = 0.1f)).isNull()
        assertThat(SoundTrimLaw.sourceSeconds(sound(), declared = 1e30f)).isEqualTo(SoundTrimLaw.MAX_SOURCE_SECONDS)
    }

    @Test
    fun `une piste sans adresse ou sans source mesuree n offre aucun rognage`() {
        assertThat(SoundTrimLaw.isTrimmable(sound(), null)).isTrue()
        assertThat(SoundTrimLaw.isTrimmable(sound(url = null), null)).isFalse()
        assertThat(SoundTrimLaw.isTrimmable(sound(url = ""), null)).isFalse()
        assertThat(SoundTrimLaw.isTrimmable(sound(duration = null), null)).isFalse()
    }

    @Test
    fun `rogner ecrit les deux bornes et la duree occupee, d un seul tenant`() {
        val trimmed = SoundTrimLaw.trimmed(sound(), MediaTrimBounds(5.0, 12.0), 30.0)
        assertThat(trimmed.sourceStart).isEqualTo(5f)
        assertThat(trimmed.sourceEnd).isEqualTo(12f)
        assertThat(trimmed.duration).isEqualTo(7f)
        assertThat(trimmed.mediaURL).isEqualTo("https://cdn/s.mp3")
    }

    @Test
    fun `la source entiere n ecrit aucune borne et rend la duree de la source`() {
        val trimmed = SoundTrimLaw.trimmed(sound(duration = 7f, start = 5f, end = 12f), MediaTrimBounds(0.0, 30.0), 30.0)
        assertThat(trimmed.sourceStart).isNull()
        assertThat(trimmed.sourceEnd).isNull()
        assertThat(trimmed.duration).isEqualTo(30f)
    }

    @Test
    fun `des bornes hors de la source ou croisees sont ramenees, jamais ecrites telles quelles`() {
        val beyond = SoundTrimLaw.trimmed(sound(), MediaTrimBounds(-10.0, 999.0), 30.0)
        assertThat(beyond.sourceStart).isNull()
        assertThat(beyond.sourceEnd).isNull()
        val crossed = SoundTrimLaw.trimmed(sound(), MediaTrimBounds(20.0, 10.0), 30.0)
        assertThat(crossed.sourceStart).isNull()
        val nan = SoundTrimLaw.trimmed(sound(), MediaTrimBounds(Double.NaN, Double.NaN), 30.0)
        assertThat(nan.sourceStart).isNull()
    }

    @Test
    fun `la fenetre posee se relit, la fenetre perimee vaut la source entiere`() {
        val trimmed = SoundTrimLaw.trimmed(sound(), MediaTrimBounds(5.0, 12.0), 30.0)
        assertThat(SoundTrimLaw.window(trimmed, 30.0)).isEqualTo(MediaTrimBounds(5.0, 12.0))
        assertThat(SoundTrimLaw.window(trimmed, 8.0)).isEqualTo(MediaTrimBounds(5.0, 8.0))
        assertThat(SoundTrimLaw.window(trimmed, 5.2)).isEqualTo(MediaTrimBounds(0.0, 5.2))
    }
}
