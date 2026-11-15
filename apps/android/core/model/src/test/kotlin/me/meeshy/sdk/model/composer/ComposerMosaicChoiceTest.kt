package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MosaicLayoutMode
import org.junit.Test

class ComposerMosaicChoiceTest {
    @Test
    fun `a story publishes one post per scene, the other formats publish one document`() {
        assertThat(ComposerPublishChannel.of(ComposerFormat.STORY)).isEqualTo(ComposerPublishChannel.SCENE)
        listOf(ComposerFormat.POST, ComposerFormat.REEL, ComposerFormat.STATUS).forEach {
            assertThat(ComposerPublishChannel.of(it)).isEqualTo(ComposerPublishChannel.DOCUMENT)
        }
    }

    @Test
    fun `the layout control exists only where the layout travels - several scenes in a document`() {
        assertThat(ComposerMosaicChoice.isServed(slideCount = 1, format = ComposerFormat.POST)).isFalse()
        assertThat(ComposerMosaicChoice.isServed(slideCount = 3, format = ComposerFormat.STORY)).isFalse()
        assertThat(ComposerMosaicChoice.isServed(slideCount = 2, format = ComposerFormat.POST)).isTrue()
        assertThat(ComposerMosaicChoice.isServed(slideCount = 2, format = ComposerFormat.REEL)).isTrue()
    }

    @Test
    fun `the fallback comes first so the first of the list is what you get without choosing`() {
        assertThat(ComposerMosaicChoice.ordered.first()).isEqualTo(ComposerMosaicChoice.fallback)
        assertThat(ComposerMosaicChoice.fallback).isEqualTo(MosaicLayoutMode.CAROUSEL)
        assertThat(ComposerMosaicChoice.ordered).containsExactly(
            MosaicLayoutMode.CAROUSEL, MosaicLayoutMode.REEL, MosaicLayoutMode.HERO,
            MosaicLayoutMode.WAVE, MosaicLayoutMode.SINE,
        ).inOrder()
    }

    @Test
    fun `the layouts unfold under Post only, as on iOS - a reel has none to choose`() {
        assertThat(ComposerMosaicChoice.offered(3, ComposerFormat.POST)).isEqualTo(ComposerMosaicChoice.ordered)
        assertThat(ComposerMosaicChoice.offered(3, ComposerFormat.REEL)).isEmpty()
        assertThat(ComposerMosaicChoice.offered(1, ComposerFormat.POST)).isEmpty()
        assertThat(ComposerMosaicChoice.offered(3, ComposerFormat.STORY)).isEmpty()
    }

    @Test
    fun `the menu ticks the fallback until the author chooses`() {
        assertThat(ComposerMosaicChoice.checked(null)).isEqualTo(MosaicLayoutMode.CAROUSEL)
        assertThat(ComposerMosaicChoice.checked(MosaicLayoutMode.HERO)).isEqualTo(MosaicLayoutMode.HERO)
    }

    @Test
    fun `the publication writes the armed layout only where the control was offered`() {
        assertThat(ComposerMosaicChoice.published(MosaicLayoutMode.WAVE, 3, ComposerFormat.POST)).isEqualTo(MosaicLayoutMode.WAVE)
        assertThat(ComposerMosaicChoice.published(MosaicLayoutMode.WAVE, 1, ComposerFormat.POST)).isNull()
        assertThat(ComposerMosaicChoice.published(MosaicLayoutMode.WAVE, 3, ComposerFormat.REEL)).isNull()
        assertThat(ComposerMosaicChoice.published(null, 3, ComposerFormat.POST)).isNull()
    }
}
