package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.composer.ComposerObjectEditorSection
import me.meeshy.sdk.model.composer.ComposerObjectKind
import me.meeshy.sdk.model.composer.ComposerTrailingColumn
import me.meeshy.sdk.model.composer.ComposerTrailingColumn.Entry
import me.meeshy.sdk.model.composer.ComposerTrailingColumn.Focus
import me.meeshy.sdk.model.composer.MediaEditTool
import me.meeshy.sdk.model.composer.SceneObjectMenu.Action
import me.meeshy.sdk.model.composer.scene.ComposerSceneEffect
import org.junit.Test

class StoryComposerSelectionTest {
    private val filterSection = ComposerObjectEditorSection.Media(MediaEditTool.FILTER)
    private val lookSection = ComposerObjectEditorSection.Media(MediaEditTool.LOOK)
    private val altSection = ComposerObjectEditorSection.Media(MediaEditTool.ALT_TEXT)

    private fun media(id: String, mime: String = "image/jpeg") =
        UploadedMedia(id = id, url = "https://cdn/$id", mimeType = mime, fileSize = 1, width = 10, height = 10, durationMs = null, thumbnailUrl = null)

    private fun withMedia(vararg ids: String): StoryComposerUiState {
        val deck = ids.fold(StorySlideDeck.single("s")) { acc, id -> acc.addMediaToSelected(id) }
        return StoryComposerUiState(deck = deck, attachments = ids.map { media(it) }).mirrorDraftToSelection()
    }

    private fun withSound(state: StoryComposerUiState = StoryComposerUiState(), id: String = "a1"): StoryComposerUiState =
        state.copy(deck = state.deck.copy(slides = state.deck.slides.map { it.copy(audio = it.audio + StoryAudioPlayerObject(id = id, isBackground = true)) }))

    private fun withBackground(state: StoryComposerUiState, id: String) =
        state.copy(deck = state.deck.toggleSelectedBackgroundMedia(id))

    @Test
    fun `a selected media serves filters and frames, filter, adjust, effects, description and plan, the first open, with its actions`() {
        val state = StoryComposerSelectionReducer.mediaSelected(withMedia("m1"), "m1")
        val focus = state.trailingFocus as Focus.Object
        assertThat(focus.sections).containsExactly(
            lookSection,
            filterSection,
            ComposerObjectEditorSection.Media(MediaEditTool.ADJUST),
            ComposerObjectEditorSection.Media(MediaEditTool.EFFECTS),
            altSection,
            ComposerObjectEditorSection.Plan,
        ).inOrder()
        assertThat(focus.open).isEqualTo(lookSection)
        assertThat(focus.actions).containsExactly(Action.SET_AS_BACKGROUND, Action.DELETE).inOrder()
        assertThat(ComposerTrailingColumn.options(focus).last()).isEqualTo(Entry.ExitObject)
    }

    @Test
    fun `every served media section is a section of the iOS rail of the family`() {
        assertThat(ComposerObjectEditorRail_entries(ComposerObjectKind.MEDIA)).containsAtLeastElementsIn(ServedMediaSections)
        assertThat(ComposerObjectEditorRail_entries(ComposerObjectKind.AUDIO)).containsAtLeastElementsIn(ServedSoundSections)
        assertThat(ServedSoundSections).containsExactly(ComposerObjectEditorSection.Timing, ComposerObjectEditorSection.Plan).inOrder()
    }

    private fun ComposerObjectEditorRail_entries(kind: ComposerObjectKind) =
        me.meeshy.sdk.model.composer.ComposerObjectEditorRail.entries(kind)

    @Test
    fun `a media section opens, one the family does not serve is ignored`() {
        val selected = StoryComposerSelectionReducer.mediaSelected(withMedia("m1"), "m1")
        val alt = StoryComposerTrailingReducer.sectionOpened(selected, altSection)
        assertThat((alt.trailingFocus as Focus.Object).open).isEqualTo(altSection)
        val ignored = StoryComposerTrailingReducer.sectionOpened(selected, ComposerObjectEditorSection.Media(MediaEditTool.SPLIT))
        assertThat((ignored.trailingFocus as Focus.Object).open).isEqualTo(lookSection)
    }

    @Test
    fun `selecting a media unknown to the slide changes nothing`() {
        val state = withMedia("m1")
        assertThat(StoryComposerSelectionReducer.mediaSelected(state, "ghost")).isEqualTo(state)
    }

    @Test
    fun `the background media offers no second background but can still be removed`() {
        val state = StoryComposerSelectionReducer.mediaSelected(withBackground(withMedia("m1", "m2"), "m1"), "m1")
        assertThat((state.trailingFocus as Focus.Object).actions).containsExactly(Action.DELETE)
        val other = StoryComposerSelectionReducer.mediaSelected(state, "m2")
        assertThat((other.trailingFocus as Focus.Object).actions).containsExactly(Action.REPLACE_BACKGROUND, Action.DELETE).inOrder()
    }

    @Test
    fun `selecting a media releases a text and a sticker, and the reverse`() {
        val withText = StoryComposerTextReducer.added(withMedia("m1"), "t1")
        val media = StoryComposerSelectionReducer.mediaSelected(withText, "m1")
        assertThat(media.selectedTextElementId).isNull()
        assertThat(media.selectedSceneObject!!.kind).isEqualTo(ComposerObjectKind.MEDIA)
        val sticker = StoryComposerStickerReducer.added(media, "😀", "s1")
        assertThat(sticker.selectedMediaId).isNull()
        assertThat(sticker.selectedSceneObject!!.kind).isEqualTo(ComposerObjectKind.STICKER)
        val text = StoryComposerTextReducer.selected(StoryComposerSelectionReducer.mediaSelected(sticker, "m1"), "t1")
        assertThat(text.selectedMediaId).isNull()
    }

    @Test
    fun `removing the selected media ends its selection`() {
        val selected = StoryComposerSelectionReducer.mediaSelected(withMedia("m1"), "m1")
        val removed = selected.copy(deck = selected.deck.removeMedia("m1")).mirrorDraftToSelection()
        assertThat(removed.selectedMediaId).isNull()
        assertThat(removed.trailingFocus).isEqualTo(Focus.Scene())
    }

    @Test
    fun `the exit of a selection clears whatever family was touched`() {
        val media = StoryComposerSelectionReducer.cleared(StoryComposerSelectionReducer.mediaSelected(withMedia("m1"), "m1"))
        assertThat(media.selectedSceneObject).isNull()
        val sound = StoryComposerSelectionReducer.cleared(StoryComposerSelectionReducer.soundSelected(withSound(), "a1"))
        assertThat(sound.selectedSceneObject).isNull()
    }

    @Test
    fun `a selected sound serves time then plan, and can be deleted`() {
        val focus = StoryComposerSelectionReducer.soundSelected(withSound(), "a1").trailingFocus as Focus.Object
        assertThat(focus.sections).containsExactly(ComposerObjectEditorSection.Timing, ComposerObjectEditorSection.Plan).inOrder()
        assertThat(focus.open).isEqualTo(ComposerObjectEditorSection.Timing)
        assertThat(focus.actions).containsExactly(Action.DELETE)
    }

    @Test
    fun `the window of a sound cycles like a text window, on that sound alone`() {
        val state = withSound(withSound(), "a2")
        val started = StoryComposerSelectionReducer.soundStartCycled(state, "a1")
        assertThat(started.deck.selectedSlide.audio.first { it.id == "a1" }.timing().hasStart).isTrue()
        assertThat(started.deck.selectedSlide.audio.first { it.id == "a2" }.timing().isActive).isFalse()
        val timed = StoryComposerSelectionReducer.soundDurationCycled(started, "a1")
        val track = timed.deck.selectedSlide.audio.first { it.id == "a1" }
        assertThat(track.timing().isTimed).isTrue()
        assertThat(track.timing().startSeconds).isEqualTo(started.deck.selectedSlide.audio.first { it.id == "a1" }.startTime)
        assertThat(StoryComposerSelectionReducer.soundStartCycled(state, "absent")).isEqualTo(state)
    }

    @Test
    fun `the scene without a media background serves no effect`() {
        assertThat(StoryComposerUiState().trailingFocus).isEqualTo(Focus.Scene())
        assertThat(StoryComposerSelectionReducer.sceneEffectToggled(StoryComposerUiState(), ComposerSceneEffect.OPENING).openSceneEffect).isNull()
    }

    @Test
    fun `an image background serves opening then visual, a video background only the opening`() {
        val image = withBackground(withMedia("m1"), "m1")
        assertThat((image.trailingFocus as Focus.Scene).effects).containsExactly(ComposerSceneEffect.OPENING, ComposerSceneEffect.VISUAL).inOrder()
        val video = image.copy(attachments = listOf(media("m1", "video/mp4")))
        assertThat((video.trailingFocus as Focus.Scene).effects).containsExactly(ComposerSceneEffect.OPENING)
    }

    @Test
    fun `touching an effect opens its carousel, touching it again closes it`() {
        val image = withBackground(withMedia("m1"), "m1")
        val open = StoryComposerSelectionReducer.sceneEffectToggled(image, ComposerSceneEffect.VISUAL)
        assertThat((open.trailingFocus as Focus.Scene).open).isEqualTo(ComposerSceneEffect.VISUAL)
        assertThat(open.sceneEffectCarousel).isEqualTo(ComposerSceneEffect.VISUAL)
        val other = StoryComposerSelectionReducer.sceneEffectToggled(open, ComposerSceneEffect.OPENING)
        assertThat(other.sceneEffectCarousel).isEqualTo(ComposerSceneEffect.OPENING)
        assertThat(StoryComposerSelectionReducer.sceneEffectToggled(other, ComposerSceneEffect.OPENING).sceneEffectCarousel).isNull()
    }

    @Test
    fun `the carousel yields to a touched object and to the brush`() {
        val open = StoryComposerSelectionReducer.sceneEffectToggled(withBackground(withMedia("m1"), "m1"), ComposerSceneEffect.VISUAL)
        assertThat(StoryComposerTextReducer.added(open, "t1").sceneEffectCarousel).isNull()
        assertThat(StoryComposerDrawingReducer.entered(open).sceneEffectCarousel).isNull()
    }

    @Test
    fun `the frame and the carousel share the foot, opening one closes the other`() {
        val image = withBackground(withMedia("m1"), "m1")
        val frame = StoryComposerSelectionReducer.frameToggled(image)
        assertThat(frame.frameOpen).isTrue()
        val effect = StoryComposerSelectionReducer.sceneEffectToggled(frame, ComposerSceneEffect.OPENING)
        assertThat(effect.frameOpen).isFalse()
        assertThat(effect.sceneEffectCarousel).isEqualTo(ComposerSceneEffect.OPENING)
        assertThat(StoryComposerSelectionReducer.frameToggled(effect).sceneEffectCarousel).isNull()
    }

    @Test
    fun `the frame tapped while a media is touched opens at once, the touched media let go`() {
        val touched = StoryComposerSelectionReducer.mediaSelected(withBackground(withMedia("m1", "m2"), "m1"), "m2")
        val frame = StoryComposerSelectionReducer.frameToggled(touched)
        assertThat(frame.frameOpen).isTrue()
        assertThat(frame.selectedMedia).isNull()
        assertThat(StoryComposerSelectionReducer.frameToggled(frame).frameOpen).isFalse()
    }

    @Test
    fun `the frame needs a media background`() {
        assertThat(StoryComposerSelectionReducer.frameToggled(StoryComposerUiState()).frameOpen).isFalse()
    }

    @Test
    fun `toggling animated makes the time button appear at the foot`() {
        val state = StoryComposerSceneReducer.animationToggled(StoryComposerUiState())
        assertThat(ComposerTrailingColumn.foot(state.trailingFocus, state.timeServed)).contains(ComposerTrailingColumn.Foot.TIME)
    }
}
