package me.meeshy.app.stories.composer.timeline

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.StorySlide
import me.meeshy.sdk.model.composer.timeline.TimelineGeometry
import me.meeshy.sdk.model.composer.timeline.TimelineSlideBinding
import org.junit.Test

class TimelineSessionTest {

    private fun slide(id: String = "s1") = StorySlide(
        id = id,
        effects = StoryEffects(mediaObjects = listOf(StoryMediaObject(id = "v1", mediaType = "video", startTime = 0.0, duration = 4.0))),
    )

    @Test
    fun `le ViewModel n'existe que si la timeline est ouverte`() {
        val session = TimelineSession()
        assertThat(session.isOpen).isFalse()
        assertThat(session.current).isNull()

        session.open(slide())
        assertThat(session.isOpen).isTrue()

        session.shutdown()
        assertThat(session.current).isNull()
    }

    @Test
    fun `publier sans fermer ne perd aucune edition`() {
        val session = TimelineSession()
        val original = slide()
        val vm = session.open(original, hasBackgroundImage = true)
        vm.edit { nudgeStart("v1", 2f) }

        val committed = session.commit(original)

        assertThat(committed.effects.mediaObjects!!.map { it.id }).containsExactly("v1")
        assertThat(committed.effects.mediaObjects!!.single().startTime).isWithin(1e-4).of(2.0)
        assertThat(session.isOpen).isTrue()
    }

    @Test
    fun `une timeline fermee laisse la slide intacte`() {
        val original = slide()

        assertThat(TimelineSession().commit(original)).isEqualTo(original)
    }

    @Test
    fun `le clip synthetique ne fuit jamais dans la slide`() {
        val session = TimelineSession()
        val original = slide()
        val vm = session.open(original, hasBackgroundImage = false)
        assertThat(vm.editor.value.project.mediaObjects.none { TimelineSlideBinding.isSynthetic(it.id) }).isTrue()

        val withBackground = TimelineSession().also { it.open(StorySlide(id = "s9"), hasBackgroundImage = true) }
        val written = withBackground.close(StorySlide(id = "s9"))

        assertThat(written.effects.mediaObjects.orEmpty()).isEmpty()
        assertThat(withBackground.isOpen).isFalse()
    }

    @Test
    fun `l'historique est range par slide et ne fuit pas sur la suivante`() {
        val session = TimelineSession()
        val first = slide("a")
        session.open(first).edit { nudgeStart("v1", 1f) }

        val second = session.open(slide("b"))
        assertThat(second.editor.value.canUndo).isFalse()

        val back = session.open(first)
        assertThat(back.editor.value.canUndo).isTrue()
    }

    @Test
    fun `l'accroche de l'aimant emet un effet haptique`() {
        val session = TimelineSession()
        val vm = session.open(
            StorySlide(
                id = "s1",
                effects = StoryEffects(
                    mediaObjects = listOf(
                        StoryMediaObject(id = "a", mediaType = "video", startTime = 0.0, duration = 2.0),
                        StoryMediaObject(id = "b", mediaType = "video", startTime = 5.0, duration = 2.0),
                    ),
                ),
            ),
        )

        vm.edit { beginDrag("b").dragMoved(2.1f, TimelineGeometry(1f)) }

        assertThat(vm.editor.value.snapPulse).isEqualTo(1)
    }
}
