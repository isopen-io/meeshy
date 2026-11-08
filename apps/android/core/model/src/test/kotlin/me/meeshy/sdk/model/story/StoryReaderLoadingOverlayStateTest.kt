package me.meeshy.sdk.model.story

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryReaderLoadingOverlayStateTest {
    private fun state(elapsed: Long, progress: Double, cached: Boolean = false) =
        StoryReaderLoadingOverlayState(elapsed, progress, cached)

    @Test
    fun `le spinner n'apparait qu'apres 200 ms`() {
        assertThat(state(199, 0.0).spinnerVisible).isFalse()
        assertThat(state(200, 0.0).spinnerVisible).isTrue()
    }

    @Test
    fun `l'overlay disparait a 95 pour cent`() {
        assertThat(state(500, 0.94).mounted).isTrue()
        assertThat(state(500, 0.95).mounted).isFalse()
        assertThat(state(500, 0.95).spinnerVisible).isFalse()
    }

    @Test
    fun `jamais de spinner sur un cache non vide`() {
        assertThat(state(1000, 0.0, cached = true).spinnerVisible).isFalse()
        assertThat(StoryReaderLoadingOverlayState.armsSpinner(0.0, hasCachedContent = true)).isFalse()
        assertThat(StoryReaderLoadingOverlayState.armsSpinner(0.0, hasCachedContent = false)).isTrue()
    }

    @Test
    fun `une slide deja avancee ne montre pas de spinner`() {
        assertThat(state(400, 0.5).spinnerVisible).isFalse()
    }
}
