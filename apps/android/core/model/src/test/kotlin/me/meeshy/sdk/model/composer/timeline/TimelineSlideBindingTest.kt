package me.meeshy.sdk.model.composer.timeline

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.StorySlide
import me.meeshy.sdk.model.StoryTextObject
import me.meeshy.sdk.model.timeline.TimelineProject
import org.junit.Test

class TimelineSlideBindingTest {

    private fun slide(media: List<StoryMediaObject>? = null) =
        StorySlide(id = "s1", effects = StoryEffects(mediaObjects = media))

    private fun video(id: String, background: Boolean = false) =
        StoryMediaObject(id = id, mediaType = "video", isBackground = background, startTime = 1.0, duration = 4.0)

    @Test
    fun `un fond image devient un clip synthetique verrouille et permanent`() {
        val project = TimelineSlideBinding.load(slide(), hasBackgroundImage = true, imageAspectRatio = 0.5625)

        val synthetic = project.mediaObjects.single()
        assertThat(TimelineSlideBinding.isSynthetic(synthetic.id)).isTrue()
        assertThat(synthetic.isBackground).isTrue()
        assertThat(synthetic.duration).isNull()
        assertThat(synthetic.volume).isEqualTo(0f)
        assertThat(synthetic.aspectRatio).isEqualTo(0.5625)
    }

    @Test
    fun `un vrai fond existant gagne sur le clip synthetique`() {
        val project = TimelineSlideBinding.load(slide(listOf(video("real", background = true))), hasBackgroundImage = true)

        assertThat(project.mediaObjects.map { it.id }).containsExactly("real")
    }

    @Test
    fun `sans fond image aucun clip synthetique n'est ajoute`() {
        assertThat(TimelineSlideBinding.load(slide(), hasBackgroundImage = false).mediaObjects).isEmpty()
    }

    @Test
    fun `la reecriture retire le clip synthetique et garde les edits`() {
        val original = slide(listOf(video("v1")))
        val loaded = TimelineSlideBinding.load(original, hasBackgroundImage = true)
        val edited = loaded.copy(
            mediaObjects = loaded.mediaObjects.map { if (it.id == "v1") it.copy(startTime = 2.5) else it },
        )

        val written = TimelineSlideBinding.commit(edited, original)

        assertThat(written.effects.mediaObjects!!.map { it.id }).containsExactly("v1")
        assertThat(written.effects.mediaObjects!!.single().startTime).isEqualTo(2.5)
    }

    @Test
    fun `aller retour slide projet sans edition rend la slide a l'identique`() {
        val textual = StorySlide(
            id = "s2",
            effects = StoryEffects(
                mediaObjects = listOf(video("v1")),
                textObjects = listOf(StoryTextObject(id = "t1", text = "salut")),
            ),
        )

        assertThat(TimelineSlideBinding.roundTrips(textual, hasBackgroundImage = true)).isTrue()
        assertThat(TimelineSlideBinding.roundTrips(slide(), hasBackgroundImage = false)).isTrue()
    }

    @Test
    fun `les chips d'ouverture du composer vivant priment sur la slide`() {
        val project = TimelineSlideBinding.load(slide(), openingEffect = null, closingEffect = null)

        assertThat(project.openingEffect).isNull()
        assertThat(project.closingEffect).isNull()
        assertThat(project).isInstanceOf(TimelineProject::class.java)
    }
}
