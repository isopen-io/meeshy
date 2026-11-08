package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.scene.MeeshySceneObject
import me.meeshy.sdk.model.scene.ScenePresence
import org.junit.Test

class ComposerSlideProjectionTest {

    private fun state(slide: StorySlide) = StoryComposerUiState(deck = StorySlideDeck(listOf(slide), slide.id))

    @Test
    fun `une diapo vierge ne peint rien`() {
        val slide = StorySlide(id = "s1")
        assertThat(ComposerSlideProjection.plan(slide, state(slide), "fr")).isEmpty()
    }

    @Test
    fun `les textes et les stickers de la diapo sont sur la scene a pleine opacite`() {
        val slide = StorySlide(
            id = "s1",
            elements = listOf(StoryTextElement(id = "t1", text = "Salut")),
            stickers = listOf(StoryStickerElement(id = "k1", emoji = "🔥")),
        )

        val plan = ComposerSlideProjection.plan(slide, state(slide), "fr")

        assertThat(plan.map { it.kind }).containsAtLeast(MeeshySceneObject.Kind.TEXT, MeeshySceneObject.Kind.STICKER)
        assertThat(plan.all { it.presence == ScenePresence.VISIBLE && it.pose.opacity == 1.0 }).isTrue()
        assertThat(plan.first { it.kind == MeeshySceneObject.Kind.TEXT }.displayText).isEqualTo("Salut")
    }

    @Test
    fun `la projection porte l id de la diapo et change quand un texte change`() {
        val a = StorySlide(id = "s1", elements = listOf(StoryTextElement(id = "t1", text = "a")))
        val b = a.copy(elements = listOf(StoryTextElement(id = "t1", text = "b")))

        val first = ComposerSlideProjection.sceneSlide(a, state(a), "fr")!!
        val second = ComposerSlideProjection.sceneSlide(b, state(b), "fr")!!

        assertThat(first.id).isEqualTo("s1")
        assertThat(me.meeshy.sdk.model.scene.SceneSlideDiff.equalForCanvas(first, second)).isFalse()
        assertThat(me.meeshy.sdk.model.scene.SceneSlideDiff.equalForCanvas(first, ComposerSlideProjection.sceneSlide(a, state(a), "fr")!!)).isTrue()
    }
}
