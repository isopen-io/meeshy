package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.media.MediaUploadProgress
import org.junit.Test

class StoryComposerUploadReducerTest {

    private val initial = StoryComposerUiState()

    private fun uploaded(id: String) = UploadedMedia(id, "https://cdn/$id.jpg", "image/jpeg", 10L, null, null, null, null)

    @Test
    fun `picking N media shows N lines waiting their turn and locks publishing`() {
        val state = StoryComposerUploadReducer.started(initial, count = 3)

        assertThat(state.isUploadingMedia).isTrue()
        assertThat(state.uploadingMedia).containsExactly(
            MediaUploadProgress.Idle, MediaUploadProgress.Idle, MediaUploadProgress.Idle,
        )
    }

    @Test
    fun `the bytes of one media move only its own line`() {
        val state = StoryComposerUploadReducer.progressed(
            StoryComposerUploadReducer.started(initial, count = 2), index = 1, sent = 5L, total = 20L,
        )

        assertThat(state.uploadingMedia).containsExactly(
            MediaUploadProgress.Idle, MediaUploadProgress.Uploading(5L, 20L),
        ).inOrder()
    }

    @Test
    fun `a media that finished reads ready while the next one is still in flight`() {
        val running = StoryComposerUploadReducer.started(initial, count = 2)
        val state = StoryComposerUploadReducer.progressed(running, index = 0, sent = 20L, total = 20L)
            .let { StoryComposerUploadReducer.progressed(it, index = 1, sent = 1L, total = 9L) }

        assertThat(state.uploadingMedia[1]).isEqualTo(MediaUploadProgress.Uploading(1L, 9L))
    }

    @Test
    fun `progress for a line that does not exist is ignored`() {
        val state = StoryComposerUploadReducer.progressed(StoryComposerUploadReducer.started(initial, 1), index = 4, sent = 1L, total = 2L)

        assertThat(state.uploadingMedia).containsExactly(MediaUploadProgress.Idle)
    }

    @Test
    fun `uploaded media attach, one slide each, and the lines go away`() {
        val state = StoryComposerUploadReducer.uploaded(StoryComposerUploadReducer.started(initial, 2), listOf(uploaded("pm1"), uploaded("pm2")))

        assertThat(state.isUploadingMedia).isFalse()
        assertThat(state.uploadingMedia).isEmpty()
        assertThat(state.mediaLandings).isEmpty()
        assertThat(state.deck.slides.map { it.mediaIds }).containsExactly(listOf("pm1"), listOf("pm2")).inOrder()
        assertThat(state.attachments.map { it.id }).containsExactly("pm1", "pm2").inOrder()
    }

    @Test
    fun `an upload that yields nothing says so and releases the picker`() {
        val state = StoryComposerUploadReducer.uploaded(StoryComposerUploadReducer.started(initial, 1), emptyList())

        assertThat(state.errorMessage).isEqualTo(StoryComposerViewModel.MEDIA_UNUSABLE)
        assertThat(state.isUploadingMedia).isFalse()
        assertThat(state.uploadingMedia).isEmpty()
    }

    @Test
    fun `a media queued for later stays a placeholder on the slide`() {
        val item = MediaUploadItem(byteArrayOf(1), "a.jpg", "image/jpeg")

        val state = StoryComposerUploadReducer.queued(initial, cmid = "cmid_1", item = item)

        assertThat(state.deck.selectedSlide.mediaIds).containsExactly("cmid_1")
        assertThat(state.pendingUploads.single().cmid).isEqualTo("cmid_1")
    }

    @Test
    fun `settling clears the lines and keeps the rest`() {
        val state = StoryComposerUploadReducer.settled(StoryComposerUploadReducer.started(initial, 2))

        assertThat(state.isUploadingMedia).isFalse()
        assertThat(state.uploadingMedia).isEmpty()
    }
}
