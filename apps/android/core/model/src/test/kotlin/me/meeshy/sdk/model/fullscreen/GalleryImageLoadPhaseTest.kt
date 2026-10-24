package me.meeshy.sdk.model.fullscreen

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class GalleryImageLoadPhaseTest {

    @Test
    fun `a page starts loading on its first attempt`() {
        val phase = GalleryImageLoadPhase()
        assertThat(phase.isFailed).isFalse()
        assertThat(phase.attempt).isEqualTo(0)
    }

    @Test
    fun `a failure of the current attempt is drawn`() {
        assertThat(GalleryImageLoadPhase().failed(attempt = 0).isFailed).isTrue()
    }

    @Test
    fun `retry starts a new attempt and clears the failure`() {
        val retried = GalleryImageLoadPhase().failed(attempt = 0).retried()
        assertThat(retried.isFailed).isFalse()
        assertThat(retried.attempt).isEqualTo(1)
    }

    @Test
    fun `a late failure of a replaced attempt never fails the page`() {
        val retried = GalleryImageLoadPhase().failed(attempt = 0).retried()
        assertThat(retried.failed(attempt = 0).isFailed).isFalse()
    }
}
