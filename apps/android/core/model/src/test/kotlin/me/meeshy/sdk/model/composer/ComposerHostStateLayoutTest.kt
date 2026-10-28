package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MosaicLayoutMode
import me.meeshy.sdk.model.StoryVisibility
import me.meeshy.sdk.model.UploadedMedia
import org.junit.Test

class ComposerHostStateLayoutTest {
    private fun media(id: String) = CarriedMedia(UploadedMedia(id, "u/$id", "image/jpeg", 1L, null, null, null, null))

    private fun post(count: Int) = ComposerHostState.open(ComposerIntent(ComposerOrigin.FeedComposer))
        .withPostDocument((1..count).map { media("m$it") }, StoryVisibility.PUBLIC)

    @Test
    fun `no layout section for a post of one scene, five layouts from two`() {
        assertThat(post(1).layoutChoices).isEmpty()
        assertThat(post(2).layoutChoices).isEqualTo(ComposerMosaicChoice.ordered)
    }

    @Test
    fun `no layout section for media a document of photo scenes does not carry, the control would have no effect`() {
        val video = CarriedMedia(UploadedMedia("v", "u/v", "video/mp4", 1L, null, null, 4000L, null))
        val mixed = ComposerHostState.open(ComposerIntent(ComposerOrigin.FeedComposer))
            .withPostDocument(listOf(media("m1"), video), StoryVisibility.PUBLIC)

        assertThat(mixed.layoutChoices).isEmpty()
        assertThat(mixed.chooseLayout(MosaicLayoutMode.HERO).layout).isNull()
    }

    @Test
    fun `an offered layout is armed, one that is not offered leaves the state untouched`() {
        assertThat(post(3).chooseLayout(MosaicLayoutMode.HERO).layout).isEqualTo(MosaicLayoutMode.HERO)
        assertThat(post(1).chooseLayout(MosaicLayoutMode.HERO).layout).isNull()
    }

    @Test
    fun `the choice survives a media change and stays unpublished while the control is withdrawn`() {
        val armed = post(3).chooseLayout(MosaicLayoutMode.WAVE)
        val alone = armed.withPostDocument(listOf(media("m1")), StoryVisibility.PUBLIC)
        assertThat(ComposerMosaicChoice.published(alone.layout, alone.postMedia.size, alone.selectedFormat)).isNull()
        val again = alone.withPostDocument((1..3).map { media("n$it") }, StoryVisibility.PUBLIC)
        assertThat(ComposerMosaicChoice.published(again.layout, again.postMedia.size, again.selectedFormat)).isEqualTo(MosaicLayoutMode.WAVE)
    }
}
