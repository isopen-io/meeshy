package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.composer.ComposerObjectKind
import me.meeshy.sdk.model.composer.ComposerSelectionAction.DUPLICATE
import me.meeshy.sdk.model.composer.ComposerSelectionAction.EDIT
import me.meeshy.sdk.model.composer.ComposerSelectionAction.REMOVE
import me.meeshy.sdk.model.composer.ComposerSelectionAction.TIME
import me.meeshy.sdk.model.composer.ComposerSelectionActions
import me.meeshy.sdk.model.composer.SceneObjectMenu.Action
import me.meeshy.sdk.model.composer.StoryToolMode
import org.junit.Test

/**
 * L'état de sélection du compositeur (#13836) : toucher un objet le sélectionne — un texte touché n'est pas écrit —, une
 * seule barre d'actions le sert, et toucher la scène à vide rend les outils, quelle que soit la famille touchée.
 */
class StoryComposerSelectionBarTest {
    private fun withText(vararg ids: String): StoryComposerUiState =
        ids.fold(StoryComposerUiState()) { acc, id -> StoryComposerTextReducer.typed(StoryComposerTextReducer.added(acc, id), "mot $id") }
            .let(StoryComposerTextReducer::deselected)

    private fun withStickers(vararg ids: String): StoryComposerUiState =
        ids.fold(StoryComposerUiState()) { acc, id -> StoryComposerStickerReducer.added(acc, "😀", id) }

    private fun withMedia(id: String): StoryComposerUiState {
        val media = UploadedMedia(id = id, url = "https://cdn/$id", mimeType = "image/jpeg", fileSize = 1, width = 10, height = 10, durationMs = null, thumbnailUrl = null)
        return StoryComposerUiState(deck = StorySlideDeck.single("s").addMediaToSelected(id), attachments = listOf(media)).mirrorDraftToSelection()
    }

    private fun withSound(state: StoryComposerUiState = StoryComposerUiState()): StoryComposerUiState =
        state.copy(deck = state.deck.copy(slides = state.deck.slides.map { it.copy(audio = it.audio + StoryAudioPlayerObject(id = "a1", isBackground = true)) }))

    @Test
    fun `a text touched on the scene is framed, not written`() {
        val framed = StoryComposerTextReducer.tapped(withText("t1"), "t1")

        assertThat(framed.selectedSceneObject).isEqualTo(SceneObjectRef(ComposerObjectKind.TEXT, "t1"))
        assertThat(framed.isEditingTextElement).isFalse()
        assertThat(framed.selectionBar!!.actions).containsExactly(EDIT, DUPLICATE, TIME, REMOVE).inOrder()
    }

    @Test
    fun `touching the framed text again writes it, as its Edit does`() {
        val framed = StoryComposerTextReducer.tapped(withText("t1"), "t1")

        assertThat(StoryComposerTextReducer.tapped(framed, "t1").isEditingTextElement).isTrue()
        assertThat(StoryComposerTextReducer.selected(framed, "t1").isEditingTextElement).isTrue()
    }

    @Test
    fun `a text being written serves no bar, and a new text is written at once`() {
        val written = StoryComposerTextReducer.added(StoryComposerTextReducer.tapped(withText("t1"), "t1"), "t2")

        assertThat(written.isEditingTextElement).isTrue()
        assertThat(written.selectionBar).isNull()
    }

    @Test
    fun `a duplicated framed text stays framed, the copy selected`() {
        val copy = StoryComposerTextReducer.duplicated(StoryComposerTextReducer.tapped(withText("t1"), "t1"), "t1", "t2")

        assertThat(copy.selectedTextElementId).isEqualTo("t2")
        assertThat(copy.isEditingTextElement).isFalse()
    }

    @Test
    fun `a text picked on the frise of the timing sheet is framed, never written`() {
        val picked = StoryComposerSceneReducer.trackSelected(withText("t1"), "t1")

        assertThat(picked.selectedTextElementId).isEqualTo("t1")
        assertThat(picked.isEditingTextElement).isFalse()
    }

    @Test
    fun `touching the empty scene releases every family and the frame`() {
        val text = StoryComposerSelectionReducer.cleared(StoryComposerTextReducer.tapped(withText("t1"), "t1"))
        assertThat(text.selectedSceneObject).isNull()
        assertThat(StoryComposerTextReducer.selected(text, "t1").isEditingTextElement).isTrue()

        val media = StoryComposerSelectionReducer.cleared(StoryComposerSelectionReducer.mediaSelected(withMedia("m1"), "m1"))
        assertThat(media.selectedSceneObject).isNull()
        val sound = StoryComposerSelectionReducer.cleared(StoryComposerSelectionReducer.soundSelected(withSound(), "a1"))
        assertThat(sound.selectedSceneObject).isNull()
    }

    @Test
    fun `stickers sharing the plane serve no Order, touching one brought it to the front`() {
        val bar = StoryComposerStickerReducer.selected(withStickers("s1", "s2"), "s1").selectionBar!!

        assertThat(bar.actions).containsExactly(EDIT, DUPLICATE, TIME, REMOVE).inOrder()
    }

    @Test
    fun `timing joins the bar of a text or a sticker, the scene animated or still, as on iOS`() {
        val animated = withStickers("s1").copy(sceneIsAnimated = true)

        assertThat(animated.selectionBar!!.actions).contains(TIME)
        assertThat(withStickers("s1").selectionBar!!.actions).contains(TIME)
    }

    @Test
    fun `a media is edited and removed, its background designation lives in its sheet`() {
        val bar = StoryComposerSelectionReducer.mediaSelected(withMedia("m1"), "m1").selectionBar!!

        assertThat(bar.actions).containsExactly(EDIT, REMOVE).inOrder()
        assertThat(bar.sheetActions).containsExactly(Action.SET_AS_BACKGROUND)
    }

    @Test
    fun `an ambient sound is edited in its sheet and removed, never timed from the bar`() {
        val bar = StoryComposerSelectionReducer.soundSelected(withSound(), "a1").copy(sceneIsAnimated = true).selectionBar!!

        assertThat(bar.actions).containsExactly(EDIT, REMOVE).inOrder()
    }

    @Test
    fun `picking a media or a sound in the tool panel leaves the panel for the selection`() {
        val panel = withMedia("m1").let { it.copy(band = it.band.tapTool(StoryToolMode.MEDIA)) }

        val media = StoryComposerSelectionReducer.mediaSelected(panel, "m1")
        assertThat(media.band.activeTool).isNull()
        assertThat(media.scenePanel(local = null)).isNull()
        val sound = StoryComposerSelectionReducer.soundSelected(withSound().let { it.copy(band = it.band.tapTool(StoryToolMode.AUDIO)) }, "a1")
        assertThat(sound.scenePanel(local = null)).isNull()
    }

    @Test
    fun `the long-press menu of a text or a sticker never offers what the bar lacks`() {
        val text = withText("t1", "t2").copy(elementMenuId = "t1").let { StoryComposerTextReducer.menuOpened(it, "t1") }
        val sticker = StoryComposerSceneReducer.stickerMenuOpened(withStickers("s1", "s2"), "s1")

        listOf(text, sticker).forEach { state ->
            val bar = state.selectionBar!!.actions
            state.sceneContextMenu!!.actions.forEach { assertThat(bar).contains(ComposerSelectionActions.of(it)) }
        }
        assertThat(text.isEditingTextElement).isFalse()
    }

    @Test
    fun `a sticker swapped keeps its place, its size and its selection`() {
        val placed = withStickers("s1")
        val swapped = StoryComposerStickerReducer.swapped(placed, "s1", "🎉")

        val before = placed.deck.selectedSlide.stickers.single()
        val after = swapped.deck.selectedSlide.stickers.single()
        assertThat(after.emoji).isEqualTo("🎉")
        assertThat(after.copy(emoji = before.emoji)).isEqualTo(before)
        assertThat(swapped.selectedStickerId).isEqualTo("s1")
        assertThat(StoryComposerStickerReducer.swapped(placed, "s1", " ")).isSameInstanceAs(placed)
        assertThat(StoryComposerStickerReducer.swapped(placed, "ghost", "🎉")).isSameInstanceAs(placed)
    }
}
