package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.StoryToolMode
import org.junit.Test

/**
 * Le panneau qui monte au bas de la scène (#13834) : un seul à la fois, celui du geste en cours ; au repos, aucun — ni
 * légende, ni compteur, ni trace du son, ni rangée des médias.
 */
class StoryScenePanelTest {
    private val rest = StoryComposerUiState()

    @Test
    fun `a scene at rest raises no panel at all`() {
        assertThat(rest.scenePanel(local = null)).isNull()
    }

    @Test
    fun `the duration and the caption the more menu opens are panels of their own`() {
        assertThat(rest.scenePanel(StoryMorePanel.DURATION)).isEqualTo(StoryScenePanel.DURATION)
        assertThat(rest.scenePanel(StoryMorePanel.CAPTION)).isEqualTo(StoryScenePanel.CAPTION)
    }

    @Test
    fun `an open tool takes the place of a more panel`() {
        val tool = rest.copy(band = rest.band.tapTool(StoryToolMode.MEDIA))
        assertThat(tool.scenePanel(StoryMorePanel.CAPTION)).isEqualTo(StoryScenePanel.TOOL)
    }

    @Test
    fun `the brush in hand beats everything else`() {
        val drawing = StoryComposerDrawingReducer.entered(rest)
        assertThat(drawing.scenePanel(StoryMorePanel.DURATION)).isEqualTo(StoryScenePanel.DRAWING)
    }

    @Test
    fun `a selected sticker raises no panel, its actions ride the selection bar (#13836)`() {
        val sticker = StoryComposerStickerReducer.added(rest, "😀", "s1")
        assertThat(sticker.selectedSticker).isNotNull()
        assertThat(sticker.scenePanel(local = null)).isNull()
    }

    @Test
    fun `the timeline of a selected sticker is the tool panel, not the sticker sections`() {
        val sticker = StoryComposerStickerReducer.added(rest, "😀", "s1")
        val timeline = sticker.copy(band = sticker.band.swipeUpOnTool(StoryToolMode.TIMELINE))
        assertThat(timeline.scenePanel(local = null)).isEqualTo(StoryScenePanel.TOOL)
    }
}
