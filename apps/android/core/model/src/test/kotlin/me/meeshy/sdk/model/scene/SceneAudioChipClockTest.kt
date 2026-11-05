package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryAudioPlayerObject
import org.junit.Test

class SceneAudioChipClockTest {

    private fun sound(
        startTime: Float? = null,
        duration: Float? = null,
        sourceStart: Float? = null,
        sourceEnd: Float? = null,
        loop: Boolean? = null,
        isBackground: Boolean? = null,
    ) = StoryAudioPlayerObject(
        id = "s",
        startTime = startTime,
        duration = duration,
        sourceStart = sourceStart,
        sourceEnd = sourceEnd,
        loop = loop,
        isBackground = isBackground,
    )

    @Test
    fun `a pass is the trimmed window of the source`() {
        assertThat(SceneAudioChipClock.passSeconds(sound(sourceStart = 2f, sourceEnd = 7f, duration = 20f))).isWithin(1e-9).of(5.0)
    }

    @Test
    fun `without a window the pass is the length the sound occupies`() {
        assertThat(SceneAudioChipClock.passSeconds(sound(duration = 4f))).isWithin(1e-9).of(4.0)
    }

    @Test
    fun `a sound with neither window nor length has no known pass`() {
        assertThat(SceneAudioChipClock.passSeconds(sound())).isNull()
    }

    @Test
    fun `a looping sound comes back to zero at the end of its pass`() {
        val looping = sound(sourceStart = 0f, sourceEnd = 5f, loop = true)
        assertThat(SceneAudioChipClock.positionSeconds(looping, slideElapsed = 4.5)).isWithin(1e-9).of(4.5)
        assertThat(SceneAudioChipClock.positionSeconds(looping, slideElapsed = 5.0)).isWithin(1e-9).of(0.0)
        assertThat(SceneAudioChipClock.positionSeconds(looping, slideElapsed = 12.0)).isWithin(1e-9).of(2.0)
    }

    @Test
    fun `the clock counts from the moment the sound enters the scene`() {
        val late = sound(startTime = 3f, sourceEnd = 5f, loop = true)
        assertThat(SceneAudioChipClock.positionSeconds(late, slideElapsed = 2.0)).isWithin(1e-9).of(0.0)
        assertThat(SceneAudioChipClock.positionSeconds(late, slideElapsed = 9.0)).isWithin(1e-9).of(1.0)
    }

    @Test
    fun `a clip played once stops at the end of its pass`() {
        val once = sound(sourceEnd = 5f, loop = false)
        assertThat(SceneAudioChipClock.positionSeconds(once, slideElapsed = 8.0)).isWithin(1e-9).of(5.0)
    }

    @Test
    fun `in the composer every sound loops, as the live preview plays it`() {
        val once = sound(sourceEnd = 5f, loop = false)
        assertThat(SceneAudioChipClock.positionSeconds(once, slideElapsed = 8.0, isEditPreview = true)).isWithin(1e-9).of(3.0)
    }

    @Test
    fun `a background sound loops unless its author refused`() {
        assertThat(SceneAudioChipClock.positionSeconds(sound(sourceEnd = 5f, isBackground = true), slideElapsed = 6.0)).isWithin(1e-9).of(1.0)
        assertThat(SceneAudioChipClock.positionSeconds(sound(sourceEnd = 5f, isBackground = true, loop = false), slideElapsed = 6.0)).isWithin(1e-9).of(5.0)
    }

    @Test
    fun `a broken clock reads zero`() {
        assertThat(SceneAudioChipClock.positionSeconds(sound(sourceEnd = 5f, loop = true), slideElapsed = Double.NaN)).isEqualTo(0.0)
    }

    @Test
    fun `the chrono reads minutes and seconds, truncated`() {
        assertThat(SceneAudioChipClock.label(0.0)).isEqualTo("0:00")
        assertThat(SceneAudioChipClock.label(9.99)).isEqualTo("0:09")
        assertThat(SceneAudioChipClock.label(75.2)).isEqualTo("1:15")
        assertThat(SceneAudioChipClock.label(-3.0)).isEqualTo("0:00")
        assertThat(SceneAudioChipClock.label(Double.POSITIVE_INFINITY)).isEqualTo("0:00")
    }
}
