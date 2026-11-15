package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.SharedPlace
import org.junit.Test

class MediaPresentationTest {

    private fun image(index: Int = 0) = MediaPresentation.Image(messageId = "m1", index = index)
    private fun video() = MediaPresentation.Video(url = "https://x/v.mp4", secure = false)

    @Test
    fun `aucune presentation n'est active au depart`() {
        assertThat(MediaPresentationState().active).isNull()
    }

    @Test
    fun `ouvrir une presentation la rend active`() {
        val state = MediaPresentationState().open(image())
        assertThat(state.active).isEqualTo(image())
    }

    @Test
    fun `ouvrir une seconde presentation remplace la premiere`() {
        val state = MediaPresentationState().open(image()).open(video())
        assertThat(state.active).isEqualTo(video())
    }

    @Test
    fun `fermer ne laisse aucune presentation`() {
        assertThat(MediaPresentationState().open(image()).close().active).isNull()
    }

    @Test
    fun `fermer sans presentation est sans effet`() {
        assertThat(MediaPresentationState().close().active).isNull()
    }

    @Test
    fun `les six formes de presentation sont distinctes`() {
        val all = listOf(
            image(),
            video(),
            MediaPresentation.Audio(attachmentId = "a"),
            MediaPresentation.Document(attachmentId = "d"),
            MediaPresentation.Code(attachmentId = "c"),
            MediaPresentation.Place(messageId = "m", place = SharedPlace(1.0, 2.0, null, null)),
        )
        assertThat(all.map { it::class }.toSet()).hasSize(6)
    }
}
