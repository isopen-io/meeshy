package me.meeshy.sdk.model.composer.capture

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CaptureMicrophoneNoticeLawTest {

    @Test
    fun `a granted microphone never announces anything`() {
        val step = CaptureMicrophoneNoticeLaw.beforeFilm(CaptureMicrophoneNoticeLaw.State(), microphoneGranted = true)

        assertThat(step.announce).isFalse()
    }

    @Test
    fun `the first film without the microphone announces the silent video`() {
        val step = CaptureMicrophoneNoticeLaw.beforeFilm(CaptureMicrophoneNoticeLaw.State(), microphoneGranted = false)

        assertThat(step.announce).isTrue()
        assertThat(step.state.announced).isTrue()
    }

    @Test
    fun `the notice is given once per session, however many takes follow`() {
        val first = CaptureMicrophoneNoticeLaw.beforeFilm(CaptureMicrophoneNoticeLaw.State(), microphoneGranted = false)
        val second = CaptureMicrophoneNoticeLaw.beforeFilm(first.state, microphoneGranted = false)
        val third = CaptureMicrophoneNoticeLaw.beforeFilm(second.state, microphoneGranted = false)

        assertThat(listOf(first, second, third).map { it.announce }).containsExactly(true, false, false).inOrder()
    }

    @Test
    fun `a take that found the microphone granted does not spend the notice`() {
        val granted = CaptureMicrophoneNoticeLaw.beforeFilm(CaptureMicrophoneNoticeLaw.State(), microphoneGranted = true)
        val revoked = CaptureMicrophoneNoticeLaw.beforeFilm(granted.state, microphoneGranted = false)

        assertThat(revoked.announce).isTrue()
    }
}
