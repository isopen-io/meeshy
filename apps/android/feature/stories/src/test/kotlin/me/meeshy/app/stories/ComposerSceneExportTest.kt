package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryBackgroundValue
import me.meeshy.sdk.model.composer.scene.ComposerOverflowEntry
import me.meeshy.sdk.model.composer.scene.SceneExportDestination
import me.meeshy.sdk.model.scene.export.StoryExportMode
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/**
 * #13897 — le compositeur exporte TOUTES ses slides publiables, bout à bout, par le moteur des stories : la projection que
 * l'aperçu joue et que la publication enverrait, pas la seule slide affichée.
 */
@RunWith(JUnit4::class)
class ComposerSceneExportTest {

    private val base = StoryComposerUiState()

    private fun StoryComposerUiState.written(id: String, text: String): StoryComposerUiState =
        StoryComposerTextReducer.added(this, id).withDeckTransform { it.updateTextElement(id) { e -> e.copy(text = text) } }

    private fun twoSlides(): StoryComposerUiState =
        base.written("t1", "Bonjour").withDeckTransform { it.addSlide("s2") }.written("t2", "Salut")

    @Test
    fun `every publishable slide exports in order, not only the one shown`() {
        val state = twoSlides()
        assertThat(state.deck.selectedSlide.id).isEqualTo("s2")

        val scenes = ComposerSceneExport.scenes(state, "fr") { item -> slideView(item.id) }

        assertThat(scenes.map { it.second.id }).containsExactly("composer-preview-0", "composer-preview-1").inOrder()
        assertThat(scenes.map { it.first.id }).containsExactly("composer-preview-0", "composer-preview-1").inOrder()
    }

    @Test
    fun `export is offered as soon as any slide carries a scene, even when the shown slide is empty`() {
        val state = base.written("t1", "Bonjour").withDeckTransform { it.addSlide("s2") }

        assertThat(ComposerSceneExport.entries(state))
            .containsExactly(ComposerOverflowEntry.SAVE_TO_PHOTOS, ComposerOverflowEntry.SHARE).inOrder()
    }

    @Test
    fun `nothing to publish, nothing to export`() {
        assertThat(ComposerSceneExport.entries(base)).isEmpty()
        assertThat(ComposerSceneExport.entries(StoryComposerTextReducer.added(base, "t"))).isEmpty()
        assertThat(ComposerSceneExport.scenes(base, "fr") { slideView(it.id) }).isEmpty()
    }

    @Test
    fun `a colour backdrop alone publishes nothing and exports nothing`() {
        val coloured = StoryComposerBackgroundReducer.backgroundChanged(base, StoryBackgroundValue.Hex("112233"))

        assertThat(ComposerSceneExport.entries(coloured)).isEmpty()
    }

    @Test
    fun `save goes to the photos and share hands the whole file over`() {
        assertThat(ComposerSceneExport.mode(SceneExportDestination.GALLERY)).isEqualTo(StoryExportMode.SAVE)
        assertThat(ComposerSceneExport.mode(SceneExportDestination.SHARE)).isEqualTo(StoryExportMode.SHARE)
    }

    private fun slideView(id: String) = StorySlideView(id = id, text = "", isTranslated = false, imageUrl = null, accentHex = "6366F1")
}
