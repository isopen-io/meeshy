package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.StoryToolMode
import org.junit.Test

class ComposerBandToolsTest {
    @Test
    fun `only tools with a panel are served, in canonical order`() {
        assertThat(ComposerBandTools.served).containsExactly(
            StoryToolMode.MEDIA, StoryToolMode.TEXT, StoryToolMode.DRAWING, StoryToolMode.TEXTURE,
        ).inOrder()
        assertThat(ComposerBandTools.served).containsNoneOf(StoryToolMode.AUDIO, StoryToolMode.TIMELINE)
    }

    @Test
    fun `badges count the elements each tool carries`() {
        val badges = ComposerBandTools.badges(mediaCount = 2, textCount = 3, strokeCount = 0, hasBackground = true)
        assertThat(badges[StoryToolMode.MEDIA]).isEqualTo(2)
        assertThat(badges[StoryToolMode.TEXT]).isEqualTo(3)
        assertThat(badges[StoryToolMode.DRAWING]).isEqualTo(0)
        assertThat(badges[StoryToolMode.TEXTURE]).isEqualTo(1)
    }

    @Test
    fun `the tool panel steps aside while a text is edited or a stroke drawn, so their settings stay in view`() {
        assertThat(ComposerBandTools.showsPanel(isDrawing = false, isEditingText = false)).isTrue()
        assertThat(ComposerBandTools.showsPanel(isDrawing = false, isEditingText = true)).isFalse()
        assertThat(ComposerBandTools.showsPanel(isDrawing = true, isEditingText = false)).isFalse()
    }
}
