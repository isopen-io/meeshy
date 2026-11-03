package me.meeshy.ui.component.video

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.playback.FocusChange
import org.junit.Test

class PlaybackAudioFocusTest {
    private class Fixture {
        var pauses = 0
        var resumes = 0
        val focus = PlaybackAudioFocus(pause = { pauses += 1 }, resume = { resumes += 1 })
    }

    @Test
    fun `une perte passagere (appel) met en pause et le gain reprend`() {
        val f = Fixture()
        f.focus.onFocusChange(FocusChange.LossTransient)
        assertThat(f.pauses).isEqualTo(1)
        f.focus.onFocusChange(FocusChange.Gain)
        assertThat(f.resumes).isEqualTo(1)
    }

    @Test
    fun `une perte definitive met en pause et ne reprend jamais seule`() {
        val f = Fixture()
        f.focus.onFocusChange(FocusChange.Loss)
        f.focus.onFocusChange(FocusChange.Gain)
        assertThat(f.pauses).isEqualTo(1)
        assertThat(f.resumes).isEqualTo(0)
    }

    @Test
    fun `une pause de l utilisateur annule la reprise`() {
        val f = Fixture()
        f.focus.onFocusChange(FocusChange.LossTransient)
        f.focus.onUserPaused()
        f.focus.onFocusChange(FocusChange.Gain)
        assertThat(f.resumes).isEqualTo(0)
    }

    @Test
    fun `un gain sans perte ne relance rien`() {
        val f = Fixture()
        f.focus.onFocusChange(FocusChange.Gain)
        assertThat(f.resumes).isEqualTo(0)
    }
}
