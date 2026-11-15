package me.meeshy.sdk.model.composer.sound

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryAudioPlayerObject
import org.junit.Test

class StoryAudioIdentityTest {
    private fun track(soundId: String? = null, name: String? = null, author: String? = null, duration: Float? = null) =
        StoryAudioPlayerObject(id = "t", soundId = soundId, name = name, soundAuthorUsername = author, duration = duration)

    @Test
    fun `soundId decides, never the presence of a title`() {
        assertThat(StoryAudioIdentity.form(track(name = "Mémo du mardi"))).isEqualTo(StoryAudioForm.Recording)
        assertThat(StoryAudioIdentity.form(track(soundId = ""))).isEqualTo(StoryAudioForm.Recording)
        assertThat(StoryAudioIdentity.form(track(soundId = "s1")))
            .isEqualTo(StoryAudioForm.Borrowed(title = null, credit = null))
    }

    @Test
    fun `a borrowed track attributes title and author, a recording attributes nothing`() {
        assertThat(StoryAudioIdentity.attribution(track(soundId = "s", name = "Pulse", author = "belva")))
            .isEqualTo("Pulse · @belva")
        assertThat(StoryAudioIdentity.attribution(track(soundId = "s", author = "belva"))).isEqualTo("@belva")
        assertThat(StoryAudioIdentity.attribution(track(name = "Mémo du mardi", author = "x"))).isEmpty()
    }

    @Test
    fun `the waveform paints for a recording only and a borrowed track is not editable as a file`() {
        assertThat(StoryAudioIdentity.showsWaveform(track())).isTrue()
        assertThat(StoryAudioIdentity.showsWaveform(track(soundId = "s"))).isFalse()
        assertThat(StoryAudioIdentity.opensEditor(track())).isTrue()
        assertThat(StoryAudioIdentity.opensEditor(track(soundId = "s"))).isFalse()
    }

    @Test
    fun `the duration label is absent when unknown and never zero`() {
        assertThat(SoundCredit.durationLabel(track())).isNull()
        assertThat(SoundCredit.durationLabel(track(duration = 0f))).isNull()
        assertThat(SoundCredit.durationLabel(track(duration = 12.4f))).isEqualTo("0:12")
        assertThat(SoundCredit.durationLabel(track(duration = 75f))).isEqualTo("1:15")
    }

    @Test
    fun `the credit joins attribution and duration`() {
        assertThat(SoundCredit.label(track(soundId = "s", name = "Pulse", author = "b", duration = 7f)))
            .isEqualTo("Pulse · @b · 0:07")
        assertThat(SoundCredit.label(track(duration = 7f))).isEqualTo("0:07")
        assertThat(SoundCredit.label(track())).isEmpty()
    }
}

class SoundTraceBarsTest {
    @Test
    fun `without a measured waveform the bars are a sinusoid, never a flat line that would read as silence`() {
        val bars = SoundTraceBars.heights(emptyList(), count = 14)
        assertThat(bars).hasSize(14)
        assertThat(bars.all { it in 0.35f..0.8f }).isTrue()
        assertThat(bars.toSet().size).isGreaterThan(1)
    }

    @Test
    fun `a measured waveform is sampled evenly and read linearly`() {
        val samples = List(28) { if (it % 2 == 0) 1f else 0f }
        val bars = SoundTraceBars.heights(samples, count = 14)
        assertThat(bars).hasSize(14)
        assertThat(bars.all { it == 1f }).isTrue()
    }

    @Test
    fun `a bar never falls below the readable floor`() {
        assertThat(SoundTraceBars.heights(listOf(0f, 0f), count = 2).all { it >= SoundTraceBars.FLOOR }).isTrue()
    }
}
