package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.scene.ComposerOverflowEntry
import me.meeshy.sdk.model.composer.scene.ComposerSceneEffect
import org.junit.Test

/** La scène d'abord (#13834) : six outils posés sur la scène, un « ⋯ » qui range le reste, rien d'inerte. */
class ComposerSceneToolsTest {
    private fun more(
        editsSlides: Boolean = true,
        hasBackgroundMedia: Boolean = false,
        animated: Boolean = false,
        sceneEffects: List<ComposerSceneEffect> = emptyList(),
        exports: List<ComposerOverflowEntry> = emptyList(),
        hasContent: Boolean = false,
        hasBackground: Boolean = false,
        canPickBackground: Boolean = false,
        hasSomethingToErase: Boolean = false,
    ) = ComposerSceneTools.moreEntries(
        ComposerSceneTools.MoreInput(
            editsSlides = editsSlides,
            hasBackgroundMedia = hasBackgroundMedia,
            animated = animated,
            sceneEffects = sceneEffects,
            exports = exports,
            hasContent = hasContent,
            hasBackground = hasBackground,
            canPickBackground = canPickBackground,
            hasSomethingToErase = hasSomethingToErase,
        ),
    )

    @Test
    fun `the column carries six round tools in the order of the mockup, the more button last`() {
        assertThat(ComposerSceneTools.column).containsExactly(
            ComposerSceneTool.TEXT, ComposerSceneTool.MEDIA, ComposerSceneTool.STICKER,
            ComposerSceneTool.SOUND, ComposerSceneTool.DRAWING, ComposerSceneTool.MORE,
        ).inOrder()
    }

    @Test
    fun `the tools step aside while an object is focused or the brush is held`() {
        assertThat(ComposerSceneTools.toolsServed(objectFocused = false, drawing = false)).isEqualTo(ComposerSceneTools.column)
        assertThat(ComposerSceneTools.toolsServed(objectFocused = true, drawing = false)).isEmpty()
        assertThat(ComposerSceneTools.toolsServed(objectFocused = false, drawing = true)).isEmpty()
    }

    @Test
    fun `a bare scene's more menu holds what every scene can do, then nothing to export`() {
        assertThat(more()).containsExactly(
            ComposerMoreEntry.ADD_SLIDE, ComposerMoreEntry.BACKGROUND, ComposerMoreEntry.SLIDE_DURATION,
            ComposerMoreEntry.ANIMATION, ComposerMoreEntry.CAPTION,
            ComposerMoreEntry.MENTION, ComposerMoreEntry.HASHTAGS, ComposerMoreEntry.PLACE,
        ).inOrder()
    }

    @Test
    fun `every entry is served in the order of the spec when it has an effect`() {
        val all = more(
            hasBackgroundMedia = true,
            animated = true,
            sceneEffects = listOf(ComposerSceneEffect.OPENING, ComposerSceneEffect.VISUAL),
            exports = listOf(ComposerOverflowEntry.SAVE_TO_PHOTOS, ComposerOverflowEntry.SHARE),
            hasContent = true,
            hasBackground = true,
            canPickBackground = true,
            hasSomethingToErase = true,
        )
        assertThat(all).containsExactly(
            ComposerMoreEntry.PREVIEW, ComposerMoreEntry.ADD_SLIDE, ComposerMoreEntry.BACKGROUND,
            ComposerMoreEntry.PICK_BACKGROUND, ComposerMoreEntry.REMOVE_BACKGROUND, ComposerMoreEntry.SLIDE_DURATION,
            ComposerMoreEntry.ANIMATION, ComposerMoreEntry.TIMING, ComposerMoreEntry.FRAME,
            ComposerMoreEntry.OPENING_EFFECT, ComposerMoreEntry.VISUAL_EFFECT, ComposerMoreEntry.CAPTION,
            ComposerMoreEntry.MENTION, ComposerMoreEntry.HASHTAGS, ComposerMoreEntry.PLACE,
            ComposerMoreEntry.SAVE_TO_PHOTOS, ComposerMoreEntry.SHARE, ComposerMoreEntry.CLEAR_ALL,
        ).inOrder()
    }

    @Test
    fun `the preview opens the menu, and only over a scene that has something to show`() {
        assertThat(more(hasContent = false)).doesNotContain(ComposerMoreEntry.PREVIEW)
        assertThat(more(hasContent = true).first()).isEqualTo(ComposerMoreEntry.PREVIEW)
    }

    @Test
    fun `choosing a background media is only offered where the media door no longer reaches the background`() {
        assertThat(more(canPickBackground = false)).doesNotContain(ComposerMoreEntry.PICK_BACKGROUND)
        assertThat(more(canPickBackground = true)).contains(ComposerMoreEntry.PICK_BACKGROUND)
    }

    @Test
    fun `removing the background is only offered over a background colour or media`() {
        assertThat(more(hasBackground = false)).doesNotContain(ComposerMoreEntry.REMOVE_BACKGROUND)
        assertThat(more(hasBackground = true)).contains(ComposerMoreEntry.REMOVE_BACKGROUND)
    }

    @Test
    fun `clear all is never offered on a blank composer and always closes the menu, the only destructive entry`() {
        assertThat(more(hasSomethingToErase = false)).doesNotContain(ComposerMoreEntry.CLEAR_ALL)
        val served = more(hasSomethingToErase = true, exports = listOf(ComposerOverflowEntry.SHARE))
        assertThat(served.last()).isEqualTo(ComposerMoreEntry.CLEAR_ALL)
        assertThat(ComposerMoreEntry.entries.filter { it.isDestructive }).containsExactly(ComposerMoreEntry.CLEAR_ALL)
    }

    @Test
    fun `a long press on the media tool offers the photo library or the files, and no other tool has one`() {
        assertThat(ComposerSceneTools.longPressSources(ComposerSceneTool.MEDIA))
            .containsExactly(ComposerMediaSource.PHOTO_LIBRARY, ComposerMediaSource.FILES).inOrder()
        ComposerSceneTools.column.filterNot { it == ComposerSceneTool.MEDIA }.forEach { tool ->
            assertThat(ComposerSceneTools.longPressSources(tool)).isEmpty()
        }
    }

    @Test
    fun `the frame is only served over a background media, the timing only for an animated scene`() {
        assertThat(more(hasBackgroundMedia = false)).doesNotContain(ComposerMoreEntry.FRAME)
        assertThat(more(hasBackgroundMedia = true)).contains(ComposerMoreEntry.FRAME)
        assertThat(more(animated = false)).doesNotContain(ComposerMoreEntry.TIMING)
        assertThat(more(animated = true)).contains(ComposerMoreEntry.TIMING)
    }

    @Test
    fun `a published story being edited cannot gain a slide, so the entry is not offered`() {
        assertThat(more(editsSlides = false)).doesNotContain(ComposerMoreEntry.ADD_SLIDE)
    }

    @Test
    fun `the export entries follow the scene export law one for one`() {
        assertThat(more(exports = listOf(ComposerOverflowEntry.SHARE))).contains(ComposerMoreEntry.SHARE)
        assertThat(more(exports = listOf(ComposerOverflowEntry.SHARE))).doesNotContain(ComposerMoreEntry.SAVE_TO_PHOTOS)
        assertThat(ComposerMoreEntry.SAVE_TO_PHOTOS.export).isEqualTo(ComposerOverflowEntry.SAVE_TO_PHOTOS)
        assertThat(ComposerMoreEntry.SHARE.export).isEqualTo(ComposerOverflowEntry.SHARE)
        assertThat(ComposerMoreEntry.CAPTION.export).isNull()
    }

    @Test
    fun `the slide strip only exists from two slides`() {
        assertThat(ComposerSceneTools.showsSlideStrip(slideCount = 0)).isFalse()
        assertThat(ComposerSceneTools.showsSlideStrip(slideCount = 1)).isFalse()
        assertThat(ComposerSceneTools.showsSlideStrip(slideCount = 2)).isTrue()
        assertThat(ComposerSceneTools.showsSlideStrip(slideCount = 10)).isTrue()
    }

    @Test
    fun `undo and redo only appear with a history`() {
        assertThat(ComposerSceneTools.showsHistory(canUndo = false, canRedo = false)).isFalse()
        assertThat(ComposerSceneTools.showsHistory(canUndo = true, canRedo = false)).isTrue()
        assertThat(ComposerSceneTools.showsHistory(canUndo = false, canRedo = true)).isTrue()
    }

    @Test
    fun `the publish chevron only exists when there is another format or a layout to choose`() {
        assertThat(ComposerSceneTools.showsFormatChevron(formats = 0, layouts = 0)).isFalse()
        assertThat(ComposerSceneTools.showsFormatChevron(formats = 1, layouts = 0)).isFalse()
        assertThat(ComposerSceneTools.showsFormatChevron(formats = 3, layouts = 0)).isTrue()
        assertThat(ComposerSceneTools.showsFormatChevron(formats = 1, layouts = 5)).isTrue()
    }

    @Test
    fun `the brush hides the close cross and the publish socle, the scene stays whole for the stroke`() {
        assertThat(ComposerSceneTools.showsSceneChrome(drawing = false)).isTrue()
        assertThat(ComposerSceneTools.showsSceneChrome(drawing = true)).isFalse()
    }
}
