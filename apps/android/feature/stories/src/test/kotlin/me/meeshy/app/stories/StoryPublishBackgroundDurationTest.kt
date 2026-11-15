package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.encodeToString
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.StorySlideDuration
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.api.CreateStoryRequest
import me.meeshy.sdk.story.PublishMediaWriteBack
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/** #13606 — un fond vidéo garde la durée de sa vidéo, qu'il parte tout de suite ou depuis la file hors ligne. */
@RunWith(JUnit4::class)
class StoryPublishBackgroundDurationTest {

    private val video = "v1"

    private fun slide(pin: Double? = null) =
        StorySlide(id = "s", mediaIds = listOf(video), backgroundMediaId = video, durationSecondsPin = pin)

    private fun uploadedVideo(durationMs: Long) = UploadedMedia(
        id = video, url = "https://x/v.mp4", mimeType = "video/mp4", fileSize = 1L,
        width = 1080, height = 1920, durationMs = durationMs, thumbnailUrl = null,
    )

    private fun pendingVideo(durationMs: Long?) =
        PendingMediaUpload(video, MediaUploadItem(ByteArray(1), "v.mp4", "video/mp4", durationMs = durationMs))

    private fun stateOnline(slide: StorySlide, durationMs: Long) =
        StoryComposerUiState(deck = StorySlideDeck(listOf(slide), slide.id), attachments = listOf(uploadedVideo(durationMs)))

    private fun stateOffline(slide: StorySlide, durationMs: Long?) =
        StoryComposerUiState(deck = StorySlideDeck(listOf(slide), slide.id), pendingUploads = listOf(pendingVideo(durationMs)))

    private fun readerSeconds(request: CreateStoryRequest) = StorySlideDuration.computeSeconds(request.storyEffects)

    private fun drained(request: CreateStoryRequest): CreateStoryRequest {
        val payload = MeeshyApi.json.encodeToString(request)
        val grafted = PublishMediaWriteBack.graft(payload, placeholder = video, realId = "real-1")
        return MeeshyApi.json.decodeFromString(grafted!!)
    }

    private fun planned(state: StoryComposerUiState) = publishPlans(state, "fr").single().request

    @Test
    fun `a video background published online lasts as long as its video`() {
        assertThat(readerSeconds(planned(stateOnline(slide(), 12_000)))).isWithin(1e-9).of(12.0)
    }

    @Test
    fun `the same background published offline carries the duration probed at pick time`() {
        val media = planned(stateOffline(slide(), 12_000)).storyEffects!!.mediaObjects!!.single()

        assertThat(media.duration).isWithin(1e-9).of(12.0)
        assertThat(media.intrinsicDuration).isWithin(1e-9).of(12.0)
    }

    @Test
    fun `the same background drained from the outbox lasts as long as its video`() {
        val request = drained(planned(stateOffline(slide(), 12_000)))

        assertThat(request.storyEffects!!.mediaObjects!!.single().postMediaId).isEqualTo("real-1")
        assertThat(readerSeconds(request)).isWithin(1e-9).of(12.0)
    }

    @Test
    fun `a duration the author pinned wins online, offline and after the drain`() {
        val pinned = slide(pin = 5.0)

        assertThat(readerSeconds(planned(stateOnline(pinned, 12_000)))).isWithin(1e-9).of(5.0)
        assertThat(readerSeconds(planned(stateOffline(pinned, 12_000)))).isWithin(1e-9).of(5.0)
        assertThat(readerSeconds(drained(planned(stateOffline(pinned, 12_000))))).isWithin(1e-9).of(5.0)
    }

    @Test
    fun `a video longer than two hours is held to the two hour cap`() {
        val threeHours = 3L * 3_600_000L

        assertThat(readerSeconds(planned(stateOnline(slide(), threeHours)))).isWithin(1e-9).of(7200.0)
        assertThat(readerSeconds(drained(planned(stateOffline(slide(), threeHours))))).isWithin(1e-9).of(7200.0)
    }

    @Test
    fun `an unprobed pending video publishes no duration rather than a fake one`() {
        val media = planned(stateOffline(slide(), null)).storyEffects!!.mediaObjects!!.single()

        assertThat(media.duration).isNull()
    }
}
