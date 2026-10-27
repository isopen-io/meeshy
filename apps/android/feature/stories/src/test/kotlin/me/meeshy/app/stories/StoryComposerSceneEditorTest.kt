package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.ComposerBandState
import me.meeshy.sdk.model.composer.ComposerObjectKind
import me.meeshy.sdk.model.composer.StoryToolMode
import me.meeshy.sdk.model.composer.SceneObjectMenu.Action
import me.meeshy.sdk.model.composer.timeline.TrackBar
import me.meeshy.sdk.model.scene.StoryElementTiming
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class StoryComposerSceneEditorTest {

    private fun withText(vararg ids: String): StoryComposerUiState =
        ids.fold(StoryComposerUiState()) { acc, id ->
            StoryComposerTextReducer.typed(StoryComposerTextReducer.added(acc, id), "mot $id")
        }

    private fun withStickers(vararg ids: String): StoryComposerUiState =
        ids.fold(StoryComposerUiState()) { acc, id -> StoryComposerStickerReducer.added(acc, "😀", id) }

    @Test
    fun `un sticker porte sa fenetre sur le fil seulement quand elle est posee`() {
        val bare = StoryStickerElement(id = "s", emoji = "😀").toSticker()
        assertThat(bare.startTime).isNull()
        assertThat(bare.duration).isNull()

        val timed = StoryStickerElement(id = "s", emoji = "😀", timing = StoryElementTiming(2f, 3f)).toSticker()
        assertThat(timed.startTime).isEqualTo(2.0)
        assertThat(timed.duration).isEqualTo(3.0)
    }

    @Test
    fun `la fenetre d'un sticker est posee par le reducteur de scene`() {
        val state = withStickers("s1")

        val after = StoryComposerSceneReducer.windowed(state, "s1", startSeconds = 1.5f, durationSeconds = 4f)

        assertThat(after.deck.selectedSlide.stickers.single().timing).isEqualTo(StoryElementTiming(1.5f, 4f))
    }

    @Test
    fun `la fenetre d'un texte est posee par le meme reducteur`() {
        val after = StoryComposerSceneReducer.windowed(withText("t1"), "t1", startSeconds = 2f, durationSeconds = 0f)

        assertThat(after.deck.selectedSlide.elements.single().timing).isEqualTo(StoryElementTiming(2f, 0f))
    }

    @Test
    fun `une fenetre sur un objet inconnu laisse l'etat intact`() {
        val state = withText("t1")
        assertThat(StoryComposerSceneReducer.windowed(state, "ghost", 1f, 1f)).isSameInstanceAs(state)
    }

    @Test
    fun `dupliquer un sticker le decale le range apres sa source et le selectionne`() {
        val state = withStickers("s1")

        val after = StoryComposerSceneReducer.stickerDuplicated(state, "s1", "s2")

        assertThat(after.deck.selectedSlide.stickers.map { it.id }).containsExactly("s1", "s2").inOrder()
        assertThat(after.selectedStickerId).isEqualTo("s2")
        assertThat(after.deck.selectedSlide.stickers[1].x).isNotEqualTo(after.deck.selectedSlide.stickers[0].x)
    }

    @Test
    fun `dupliquer au plafond avertit et ne clone pas`() {
        val full = withStickers(*(1..StorySlideDeck.MAX_STICKERS_PER_SLIDE).map { "s$it" }.toTypedArray())

        val after = StoryComposerSceneReducer.stickerDuplicated(full, "s1", "extra")

        assertThat(after.errorMessage).isEqualTo(StoryComposerViewModel.STICKER_LIMIT)
        assertThat(after.deck).isEqualTo(full.deck)
    }

    @Test
    fun `l'empilement d'un sticker suit l'ordre de la liste`() {
        val state = withStickers("a", "b", "c")

        val toFront = StoryComposerSceneReducer.stickerReordered(state, "a", StoryZOrder.TO_FRONT)
        assertThat(toFront.deck.selectedSlide.stickers.map { it.id }).containsExactly("b", "c", "a").inOrder()

        val toBack = StoryComposerSceneReducer.stickerReordered(toFront, "a", StoryZOrder.TO_BACK)
        assertThat(toBack.deck.selectedSlide.stickers.map { it.id }).containsExactly("a", "b", "c").inOrder()

        assertThat(StoryComposerSceneReducer.stickerReordered(state, "c", StoryZOrder.TO_FRONT)).isSameInstanceAs(state)
    }

    @Test
    fun `l'appui long sur un sticker ouvre son menu, le selectionne et ferme le menu du texte`() {
        val state = withText("t1").copy(elementMenuId = "t1")
        val withSticker = StoryComposerStickerReducer.added(state, "😀", "s1")

        val opened = StoryComposerSceneReducer.stickerMenuOpened(withSticker, "s1")

        assertThat(opened.stickerMenuId).isEqualTo("s1")
        assertThat(opened.selectedStickerId).isEqualTo("s1")
        assertThat(opened.elementMenuId).isNull()
        assertThat(StoryComposerSceneReducer.stickerMenuOpened(withSticker, "ghost")).isSameInstanceAs(withSticker)
        assertThat(StoryComposerSceneReducer.menuDismissed(opened).stickerMenuId).isNull()
    }

    @Test
    fun `le menu d'un sticker seul n'offre que dupliquer et supprimer`() {
        val state = StoryComposerSceneReducer.stickerMenuOpened(withStickers("s1"), "s1")

        assertThat(state.sceneContextMenu!!.actions).containsExactly(Action.DUPLICATE, Action.DELETE).inOrder()
    }

    @Test
    fun `le menu de deux stickers offre l'empilement entre dupliquer et supprimer`() {
        val state = StoryComposerSceneReducer.stickerMenuOpened(withStickers("s1", "s2"), "s1")

        assertThat(state.sceneContextMenu!!.actions)
            .containsExactly(Action.DUPLICATE, Action.BRING_FORWARD, Action.SEND_BACKWARD, Action.DELETE).inOrder()
    }

    @Test
    fun `le menu d'un texte offre modifier et jamais une ligne grisee`() {
        val state = withText("t1", "t2").copy(elementMenuId = "t1")

        val menu = state.sceneContextMenu!!

        assertThat(menu.ref).isEqualTo(SceneObjectRef(ComposerObjectKind.TEXT, "t1"))
        assertThat(menu.actions)
            .containsExactly(Action.EDIT, Action.DUPLICATE, Action.BRING_FORWARD, Action.SEND_BACKWARD, Action.DELETE)
            .inOrder()
    }

    @Test
    fun `le menu d'un texte perd dupliquer au plafond de textes`() {
        val full = withText(*(1..StorySlideDeck.MAX_TEXT_ELEMENTS_PER_SLIDE).map { "t$it" }.toTypedArray())
            .copy(elementMenuId = "t1")

        assertThat(full.sceneContextMenu!!.actions).doesNotContain(Action.DUPLICATE)
    }

    @Test
    fun `l'objet selectionne est unique et l'inspecteur dit sa famille`() {
        val both = StoryComposerStickerReducer.selected(withStickers("s1"), "s1")
        assertThat(both.selectedSceneObject).isEqualTo(SceneObjectRef(ComposerObjectKind.STICKER, "s1"))

        val text = StoryComposerTextReducer.selected(withText("t1").let { StoryComposerStickerReducer.added(it, "😀", "s1") }, "t1")
        assertThat(text.selectedSceneObject).isEqualTo(SceneObjectRef(ComposerObjectKind.TEXT, "t1"))
        assertThat(StoryComposerUiState().selectedSceneObject).isNull()
    }

    @Test
    fun `les jetons d'un sticker disent taille, rotation et fenetre`() {
        val state = StoryComposerSceneReducer.windowed(withStickers("s1"), "s1", 2f, 6f)
            .let { StoryComposerStickerReducer.transformed(it, "s1", 1.5f, 30f) }

        val chips = state.sceneInspector!!.chips

        assertThat(chips.map { it.id }).containsExactly("size", "rotation", "window").inOrder()
        assertThat(chips.first { it.id == "window" }.argument).isEqualTo("0:02 → 0:08")
    }

    @Test
    fun `les jetons d'un texte disent police, taille, alignement et fenetre`() {
        val state = StoryComposerSceneReducer.windowed(withText("t1"), "t1", 1f, 3f)
            .let { StoryComposerTextReducer.selected(it, "t1") }

        val ids = state.sceneInspector!!.chips.map { it.id }

        assertThat(ids).containsAtLeast("style", "size", "align", "window")
    }

    @Test
    fun `aucun objet selectionne, aucun inspecteur`() {
        assertThat(StoryComposerUiState().sceneInspector).isNull()
    }

    @Test
    fun `les pistes du plan 2D suivent les objets de la slide, premier plan d'abord`() {
        val state = StoryComposerSceneReducer.windowed(withStickers("s1"), "s1", 2f, 3f)
            .let { StoryComposerTextReducer.added(it, "t1") }
            .let { StoryComposerTextReducer.typed(it, "bonjour") }

        val tracks = state.sceneTracks

        assertThat(tracks.map { it.id }).containsExactly("t1", "s1")
        val sticker = tracks.first { it.id == "s1" }.bar as TrackBar.Timed
        assertThat(sticker.start).isEqualTo(2.0)
        assertThat(sticker.end).isEqualTo(5.0)
        assertThat(tracks.first { it.id == "t1" }.bar).isEqualTo(TrackBar.Ghost)
    }

    @Test
    fun `la tete de lecture reste dans la slide`() {
        val state = StoryComposerUiState()
        val moved = StoryComposerSceneReducer.playheadMoved(state, 999f)
        assertThat(moved.playheadSeconds).isEqualTo(state.selectedSlideDurationSeconds.toFloat())
        assertThat(StoryComposerSceneReducer.playheadMoved(state, -3f).playheadSeconds).isEqualTo(0f)
    }

    @Test
    fun `la frise ouverte n'ouvre pas l'edition d'un texte selectionne`() {
        val state = withText("t1").copy(band = ComposerBandState.Hidden.tapTool(StoryToolMode.TIMELINE))
        assertThat(state.isTimelineOpen).isTrue()
        assertThat(state.selectedTextElement).isNotNull()
        assertThat(state.isEditingTextElement).isFalse()
    }

    @Test
    fun `selectionner un objet d'une piste de la frise le selectionne sur la scene`() {
        val state = StoryComposerSceneReducer.trackSelected(withStickers("s1", "s2"), "s1")
        assertThat(state.selectedStickerId).isEqualTo("s1")

        val text = StoryComposerSceneReducer.trackSelected(withText("t1"), "t1")
        assertThat(text.selectedTextElementId).isEqualTo("t1")
    }
}
