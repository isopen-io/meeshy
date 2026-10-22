package me.meeshy.sdk.model.timeline

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.StorySlide
import me.meeshy.sdk.model.StoryTextObject
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class TimelineProjectTest {

    private fun slide(effects: StoryEffects = StoryEffects(), duration: Double = 6.0) =
        StorySlide(id = "s", effects = effects, duration = duration)

    @Test
    fun `appliquer le projet d une slide inchangee est un no-op`() {
        val plain = slide(StoryEffects(textObjects = listOf(StoryTextObject(id = "t", text = "hi"))))
        assertThat(TimelineProject.from(plain).applyTo(plain)).isEqualTo(plain)
        val pinned = slide(StoryEffects(timelineDuration = 7.3, mediaObjects = listOf(StoryMediaObject(id = "m", duration = 2.0))), duration = 7.3)
        assertThat(TimelineProject.from(pinned).applyTo(pinned)).isEqualTo(pinned)
        val defaultMirror = slide(StoryEffects(), duration = 12.0)
        assertThat(TimelineProject.from(defaultMirror).applyTo(defaultMirror)).isEqualTo(defaultMirror)
    }

    @Test
    fun `une duree d auteur differente du contenu est epinglee`() {
        val base = slide()
        val longer = TimelineProject.from(base).copy(slideDuration = 20f).applyTo(base)
        assertThat(longer.effects.timelineDuration).isEqualTo(20.0)
        assertThat(longer.duration).isEqualTo(20.0)
    }

    @Test
    fun `une duree egale au contenu ne pose aucun pin`() {
        val base = slide(StoryEffects(timelineDuration = 20.0))
        val auto = TimelineProject.from(base).copy(slideDuration = 6f).applyTo(base)
        assertThat(auto.effects.timelineDuration).isNull()
    }

    @Test
    fun `les collections vides reviennent a null`() {
        val withMedia = slide(StoryEffects(mediaObjects = listOf(StoryMediaObject(id = "m"))))
        val emptied = TimelineProject.from(withMedia).copy(mediaObjects = emptyList()).applyTo(withMedia)
        assertThat(emptied.effects.mediaObjects).isNull()
    }
}
