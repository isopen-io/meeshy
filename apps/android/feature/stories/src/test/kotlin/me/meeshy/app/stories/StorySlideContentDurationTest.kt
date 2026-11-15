package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.media.MediaTrimBounds
import me.meeshy.sdk.model.scene.StoryElementTiming
import org.junit.Test

/**
 * La durée d'une diapo sans épingle est celle de sa donnée la plus longue (#14280, iOS `StoryEffects.contentDerivedDuration`) :
 * vidéo de fond, vidéos posées et sons, 6 s au moins. Recette S8 : un fond vidéo de 8 s restait coupé à 6 s.
 */
class StorySlideContentDurationTest {

    private fun video(id: String, seconds: Double) =
        UploadedMedia(id, "https://cdn/$id.mp4", "video/mp4", 1, 1080, 1920, (seconds * 1000).toLong(), null)

    private fun photo(id: String) = UploadedMedia(id, "https://cdn/$id.jpg", "image/jpeg", 1, 10, 10, null, null)

    private fun state(slide: StorySlide, vararg media: UploadedMedia) =
        StoryComposerUiState(deck = StorySlideDeck(listOf(slide), slide.id), attachments = media.toList())

    @Test
    fun `une diapo prend la duree de sa video de fond`() {
        val slide = StorySlide(id = "s", mediaIds = listOf("v"), backgroundMediaId = "v")

        assertThat(state(slide, video("v", 8.0)).selectedSlideDurationSeconds).isWithin(1e-6).of(8.0)
    }

    @Test
    fun `une video de fond rognee compte pour sa fenetre, six secondes au moins`() {
        val slide = StorySlide(id = "s", mediaIds = listOf("v"), backgroundMediaId = "v", backgroundTrim = MediaTrimBounds(1.0, 4.0))

        assertThat(state(slide, video("v", 20.0)).selectedSlideDurationSeconds).isWithin(1e-6).of(6.0)
    }

    @Test
    fun `une video posee compte depuis son depart`() {
        val placed = StoryPlacedMedia(mediaId = "v", timing = StoryElementTiming(startSeconds = 2f))
        val slide = StorySlide(id = "s", mediaIds = listOf("v"), placedMedia = listOf(placed))

        assertThat(state(slide, video("v", 9.0)).selectedSlideDurationSeconds).isWithin(1e-6).of(11.0)
    }

    @Test
    fun `un son pose compte aussi`() {
        val slide = StorySlide(id = "s", audio = listOf(StoryAudioPlayerObject(id = "a", startTime = 1f, duration = 9f)))

        assertThat(state(slide).selectedSlideDurationSeconds).isWithin(1e-6).of(10.0)
    }

    @Test
    fun `une image de fond ne change rien, et l'epingle de l'auteur gagne`() {
        val image = StorySlide(id = "s", mediaIds = listOf("p"), backgroundMediaId = "p")
        val pinned = StorySlide(id = "s", mediaIds = listOf("v"), backgroundMediaId = "v", durationSecondsPin = 5.0)

        assertThat(state(image, photo("p")).selectedSlideDurationSeconds).isWithin(1e-6).of(6.0)
        assertThat(state(pinned, video("v", 8.0)).selectedSlideDurationSeconds).isWithin(1e-6).of(5.0)
    }
}
