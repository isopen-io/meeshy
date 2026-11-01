package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MosaicLayoutMode
import org.junit.Test

/** « Disposition des scènes » (#13863 R2) : dans le menu du chevron, en post, dès deux scènes de la scène unique. */
class ComposerHostStateLayoutTest {
    private fun post(scenes: Int) = ComposerHostState.open(ComposerIntent(ComposerOrigin.FeedComposer)).withSceneCount(scenes)

    @Test
    fun `no layout section for a post of one scene, five layouts from two`() {
        assertThat(post(1).layoutChoices).isEmpty()
        assertThat(post(2).layoutChoices).isEqualTo(ComposerMosaicChoice.ordered)
    }

    @Test
    fun `a story or a reel of several scenes has no layout to choose`() {
        assertThat(post(3).choose(ComposerFormat.STORY).layoutChoices).isEmpty()
        assertThat(post(3).withMedia(listOf(me.meeshy.sdk.model.ReelComposition.MediaKind("video/mp4", 5_000))).choose(ComposerFormat.REEL).layoutChoices).isEmpty()
    }

    @Test
    fun `an offered layout is armed, one that is not offered leaves the state untouched`() {
        assertThat(post(3).chooseLayout(MosaicLayoutMode.HERO).layout).isEqualTo(MosaicLayoutMode.HERO)
        assertThat(post(1).chooseLayout(MosaicLayoutMode.HERO).layout).isNull()
    }

    @Test
    fun `the choice survives a scene count change and stays unpublished while the control is withdrawn`() {
        val armed = post(3).chooseLayout(MosaicLayoutMode.WAVE)
        val alone = armed.withSceneCount(1)
        assertThat(ComposerMosaicChoice.published(alone.layout, alone.sceneCount, alone.selectedFormat)).isNull()
        val again = alone.withSceneCount(3)
        assertThat(ComposerMosaicChoice.published(again.layout, again.sceneCount, again.selectedFormat)).isEqualTo(MosaicLayoutMode.WAVE)
    }

    @Test
    fun `a post checked behind a story still offers its layouts, and the story alone has none`() {
        val tray = ComposerHostState.open(ComposerIntent(ComposerOrigin.StoryTray)).withSceneCount(2)
        val both = tray.toggle(ComposerFormat.POST)

        assertThat(tray.layoutChoices).isEmpty()
        assertThat(both.selectedFormat).isEqualTo(ComposerFormat.STORY)
        assertThat(both.layoutChoices).isEqualTo(ComposerMosaicChoice.ordered)
        assertThat(both.chooseLayout(MosaicLayoutMode.HERO).layout).isEqualTo(MosaicLayoutMode.HERO)
    }

    @Test
    fun `unchecking the post withdraws its layouts`() {
        val both = post(2).toggle(ComposerFormat.STORY)

        assertThat(both.layoutChoices).isEqualTo(ComposerMosaicChoice.ordered)
        assertThat(both.toggle(ComposerFormat.POST).layoutChoices).isEmpty()
    }
}
