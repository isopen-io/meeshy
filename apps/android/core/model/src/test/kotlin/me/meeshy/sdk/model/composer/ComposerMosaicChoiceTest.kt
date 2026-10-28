package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
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
    fun `each layout travels under the wire name the reader parses`() {
        assertThat(MosaicLayoutMode.entries.map { it.wire }).containsExactly("carousel", "reel", "hero", "wave", "sine")
        assertThat(MosaicLayoutMode.fromWire("hero")).isEqualTo(MosaicLayoutMode.HERO)
        assertThat(MosaicLayoutMode.fromWire("nope")).isEqualTo(MosaicLayoutMode.CAROUSEL)
        assertThat(MosaicLayoutMode.fromWire(null)).isEqualTo(MosaicLayoutMode.CAROUSEL)
    }
}
