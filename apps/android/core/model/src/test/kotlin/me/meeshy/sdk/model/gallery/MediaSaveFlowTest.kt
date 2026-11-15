package me.meeshy.sdk.model.gallery

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import org.junit.Test

class MediaSaveFlowTest {
    @Test
    fun `gallery and files are offered where MediaStore works, files alone otherwise`() {
        assertThat(MediaSaveFlow.destinations(true)).containsExactly(GallerySaveDestination.GALLERY, GallerySaveDestination.FILES).inOrder()
        assertThat(MediaSaveFlow.destinations(false)).containsExactly(GallerySaveDestination.FILES)
    }

    @Test
    fun `a successful write reports saved to the chosen destination`() = runTest {
        val outcome = MediaSaveFlow.perform(GallerySaveDestination.FILES) { true }

        assertThat(outcome).isEqualTo(MediaSaveOutcome.Saved(GallerySaveDestination.FILES))
    }

    @Test
    fun `a refused or crashing write is a failure, never an exception`() = runTest {
        assertThat(MediaSaveFlow.perform(GallerySaveDestination.GALLERY) { false })
            .isEqualTo(MediaSaveOutcome.Failed(GallerySaveDestination.GALLERY))
        assertThat(MediaSaveFlow.perform(GallerySaveDestination.GALLERY) { error("disk full") })
            .isEqualTo(MediaSaveOutcome.Failed(GallerySaveDestination.GALLERY))
    }
}
