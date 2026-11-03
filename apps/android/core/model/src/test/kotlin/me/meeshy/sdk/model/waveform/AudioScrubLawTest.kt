package me.meeshy.sdk.model.waveform

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AudioScrubLawTest {
    @Test fun `x devient une fraction bornee`() {
        assertThat(AudioScrubLaw.fraction(50f, 200f)).isWithin(1e-9).of(0.25)
        assertThat(AudioScrubLaw.fraction(-10f, 200f)).isEqualTo(0.0)
        assertThat(AudioScrubLaw.fraction(900f, 200f)).isEqualTo(1.0)
        assertThat(AudioScrubLaw.fraction(10f, 0f)).isEqualTo(0.0)
    }

    @Test fun `en sens inverse l axe est miroite`() {
        assertThat(AudioScrubLaw.fraction(50f, 200f, isRtl = true)).isWithin(1e-9).of(0.75)
    }

    @Test fun `une distance nulle est un tap qui cherche aussi`() {
        assertThat(AudioScrubLaw.kind(travelPx = 0f, slopPx = 8f)).isEqualTo(ScrubKind.TAP)
        assertThat(AudioScrubLaw.kind(travelPx = 7.9f, slopPx = 8f)).isEqualTo(ScrubKind.TAP)
        assertThat(AudioScrubLaw.kind(travelPx = 8f, slopPx = 8f)).isEqualTo(ScrubKind.DRAG)
    }

    @Test fun `le signal de scrub se pose au contact et se retire a la levee`() {
        val down = AudioScrubLaw.reduce(ScrubState.IDLE, ScrubEvent.Down)
        assertThat(down.isScrubbing).isTrue()
        assertThat(AudioScrubLaw.reduce(down, ScrubEvent.Up).isScrubbing).isFalse()
        assertThat(AudioScrubLaw.reduce(down, ScrubEvent.Cancel).isScrubbing).isFalse()
    }

    @Test fun `un tap leve fait une haptique, un geste annule non`() {
        assertThat(AudioScrubLaw.hapticOnEnd(ScrubEvent.Up)).isTrue()
        assertThat(AudioScrubLaw.hapticOnEnd(ScrubEvent.Cancel)).isFalse()
    }
}
