package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.StoryToolMode
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class StoryComposerAnimatedSceneTest {

    private val base = StoryComposerUiState()

    @Test
    fun `allumer l animation ouvre la frise, tete a zero`() {
        val moved = StoryComposerSceneReducer.playheadMoved(base, 3f)
        val on = StoryComposerSceneReducer.animationToggled(moved)
        assertThat(on.sceneIsAnimated).isTrue()
        assertThat(on.band.activeTool).isEqualTo(StoryToolMode.TIMELINE)
        assertThat(on.playheadSeconds).isEqualTo(0f)
    }

    @Test
    fun `eteindre l animation referme la frise et rend la scene statique`() {
        val on = StoryComposerSceneReducer.animationToggled(base)
        val off = StoryComposerSceneReducer.animationToggled(on)
        assertThat(off.sceneIsAnimated).isFalse()
        assertThat(off.band.isPanelOpen).isFalse()
    }

    @Test
    fun `un objet pose sur une scene animee entre a la tete de lecture et reste jusqu a la fin`() {
        val animated = StoryComposerSceneReducer.playheadMoved(StoryComposerSceneReducer.animationToggled(base), 2f)
        val after = StoryComposerSceneReducer.placedAtPlayhead(animated) { StoryComposerTextReducer.added(it, "t1") }
        val timing = after.deck.selectedSlide.elements.single { it.id == "t1" }.timing
        assertThat(timing.startSeconds).isEqualTo(2f)
        assertThat(timing.durationSeconds).isGreaterThan(0f)
    }

    @Test
    fun `statique, la scene garde ses objets sur toute la slide`() {
        val after = StoryComposerSceneReducer.placedAtPlayhead(base) { StoryComposerTextReducer.added(it, "t1") }
        assertThat(after.deck.selectedSlide.elements.single().timing.hasStart).isFalse()
        assertThat(after.deck.selectedSlide.elements.single().timing.isTimed).isFalse()
    }

    @Test
    fun `seul le nouvel objet est fenetre, ceux deja poses gardent leur minutage`() {
        val first = StoryComposerTextReducer.added(base, "old")
        val animated = StoryComposerSceneReducer.playheadMoved(StoryComposerSceneReducer.animationToggled(first), 1f)
        val after = StoryComposerSceneReducer.placedAtPlayhead(animated) { StoryComposerStickerReducer.added(it, "x", "s1") }
        assertThat(after.deck.selectedSlide.elements.single { it.id == "old" }.timing.hasStart).isFalse()
        assertThat(after.deck.selectedSlide.stickers.single { it.id == "s1" }.timing.startSeconds).isEqualTo(1f)
    }
}
